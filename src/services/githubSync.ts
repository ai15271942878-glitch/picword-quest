// ============================================================
// GitHub 私有仓库同步（浏览器直连 api.github.com，不经过任何第三方服务器）
//   · 词典：下载仓库里的 .pwdict 词典包 → 导入本机
//   · 存档：生词本 / 关卡库 / 战绩 ⇄ 仓库里的 sync/picword-data.json
//     同步 = 先拉取云端存档合并进本机，再把合并后的完整存档推回云端
// 访问令牌只存在本机 localStorage，不进存档导出。
// ============================================================

import { buildBackup, importBackup, type ImportSummary } from './backup';
import { importDictPack } from './dictionary';
import type { AppSettings } from './settings';
import type { DictMeta } from '../types';

export const DATA_PATH = 'sync/picword-data.json';
const API = 'https://api.github.com';

export interface GhConfig {
  token: string;
  repo: string;
}

export function ghConfigOf(s: Pick<AppSettings, 'ghToken' | 'ghRepo'>): GhConfig | null {
  const token = s.ghToken.trim();
  const repo = s.ghRepo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '');
  return token && /^[\w.-]+\/[\w.-]+$/.test(repo) ? { token, repo } : null;
}

function contentsUrl(cfg: GhConfig, path: string) {
  return `${API}/repos/${cfg.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
}

async function ghFetch(cfg: GhConfig, url: string, init: RequestInit & { accept?: string } = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: init.accept ?? 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new Error('连不上 GitHub（网络问题，国内可能需要开代理）');
  }
  if (res.status === 401) throw new Error('访问令牌无效或已过期，请到设置里重新填写');
  if (res.status === 403) throw new Error('访问令牌没有这个仓库的权限（或请求过于频繁，稍后再试）');
  return res;
}

/** 测试连接：返回仓库全名与是否私有 */
export async function testGhConnection(cfg: GhConfig): Promise<{ fullName: string; private: boolean }> {
  const res = await ghFetch(cfg, `${API}/repos/${cfg.repo}`);
  if (res.status === 404) throw new Error(`找不到仓库 ${cfg.repo}（名字写错，或令牌没有这个仓库的权限）`);
  if (!res.ok) throw new Error(`GitHub 返回错误 ${res.status}`);
  const j = (await res.json()) as { full_name: string; private: boolean };
  return { fullName: j.full_name, private: j.private };
}

/** 读取进度：边下载边回调（已下载字节, 总字节） */
async function readWithProgress(res: Response, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const total = Number(res.headers.get('Content-Length')) || 0;
  if (!res.body || !onProgress) return res.blob();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let done = 0;
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    chunks.push(r.value);
    done += r.value.length;
    onProgress(done, total);
  }
  return new Blob(chunks as BlobPart[]);
}

/** 从仓库下载词典包并导入本机 */
export async function syncDictFromGitHub(
  cfg: GhConfig,
  path: string,
  onProgress?: (stage: 'download' | 'import', done: number, total: number) => void,
): Promise<DictMeta> {
  const res = await ghFetch(cfg, contentsUrl(cfg, path), { accept: 'application/vnd.github.raw' });
  if (res.status === 404) throw new Error(`仓库里没有找到词典包 ${path}`);
  if (!res.ok) throw new Error(`下载词典失败（GitHub 返回 ${res.status}）`);
  const blob = await readWithProgress(res, (d, t) => onProgress?.('download', d, t));
  return importDictPack(blob, path.split('/').pop() ?? 'dict.pwdict', (d, t) => onProgress?.('import', d, t));
}

// ------------------------------------------------------------
// 存档同步
// ------------------------------------------------------------

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** 读取云端存档：返回内容与 sha（不存在时都为 null） */
async function readRemoteData(cfg: GhConfig): Promise<{ text: string | null; sha: string | null }> {
  const res = await ghFetch(cfg, `${contentsUrl(cfg, DATA_PATH)}?t=${Date.now()}`);
  if (res.status === 404) return { text: null, sha: null };
  if (!res.ok) throw new Error(`读取云端存档失败（GitHub 返回 ${res.status}）`);
  const meta = (await res.json()) as { sha: string; content?: string; encoding?: string };
  if (meta.encoding === 'base64' && meta.content) {
    const bin = atob(meta.content.replace(/\s/g, ''));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return { text: new TextDecoder().decode(bytes), sha: meta.sha };
  }
  // 超过 1 MB 时 JSON 里没有内容，改用 raw 读取
  const raw = await ghFetch(cfg, `${contentsUrl(cfg, DATA_PATH)}?t=${Date.now()}`, { accept: 'application/vnd.github.raw' });
  if (!raw.ok) throw new Error(`读取云端存档失败（GitHub 返回 ${raw.status}）`);
  return { text: await raw.text(), sha: meta.sha };
}

export interface SyncResult {
  pulled: ImportSummary | null;
  pushedBytes: number;
}

/** 双向同步：拉取合并 → 推送。云端在此期间被别的设备改过（409）时重试一次。 */
export async function syncDataWithGitHub(cfg: GhConfig, attempt = 0): Promise<SyncResult> {
  const remote = await readRemoteData(cfg);
  const pulled = remote.text ? await importBackup(remote.text, 'merge') : null;
  const json = JSON.stringify(await buildBackup());
  const res = await ghFetch(cfg, contentsUrl(cfg, DATA_PATH), {
    method: 'PUT',
    body: JSON.stringify({
      message: `PicWord Quest 存档同步 ${new Date().toISOString()}`,
      content: utf8ToBase64(json),
      ...(remote.sha ? { sha: remote.sha } : {}),
    }),
  });
  if ((res.status === 409 || res.status === 422) && attempt === 0) return syncDataWithGitHub(cfg, 1);
  if (!res.ok) throw new Error(`上传存档失败（GitHub 返回 ${res.status}）`);
  return { pulled, pushedBytes: json.length };
}

// ------------------------------------------------------------
// 持久存储：请求浏览器把本站数据标记为“重要”，空间紧张时不优先清理
// ------------------------------------------------------------

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function isStoragePersisted(): Promise<boolean | null> {
  try {
    return navigator.storage?.persisted ? await navigator.storage.persisted() : null;
  } catch {
    return null;
  }
}
