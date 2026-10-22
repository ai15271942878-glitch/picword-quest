// ============================================================
// ☁️ 云端账号（Supabase）：邮箱登录 + 存档 / 图解词典存到账号专属的私有文件夹
//   picword/<用户ID>/data.json                    存档（生词本 / 关卡库 / 战绩）
//   picword/<用户ID>/dict/manifest.json + part-NNN  图解词典（分块上传，避开免费版单文件上限）
// 每个账号只能读写自己的文件夹（见 supabase/setup.sql 的行级安全策略）。
// Supabase 库按需加载，不进首屏。
// ============================================================

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { buildBackup, importBackup, type ImportSummary } from './backup';
import { exportDictPack, importDictPack } from './dictionary';
import { getSetting } from './db';
import type { DictMeta } from '../types';

import { AUTH_STORAGE_KEY, CLOUD_ANON_KEY, CLOUD_URL, cloudConfigured } from './cloudConfig';

export { cloudConfigured };

const BUCKET = 'picword';
const PART_SIZE = 20 * 1024 * 1024;

let clientPromise: Promise<SupabaseClient> | null = null;

export function getCloud(): Promise<SupabaseClient> {
  if (!cloudConfigured()) return Promise.reject(new Error('云端账号还没有配置'));
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(CLOUD_URL, CLOUD_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: AUTH_STORAGE_KEY } }),
  );
  return clientPromise;
}

/** 把 Supabase / 网络错误翻译成中文提示 */
export function cloudErrorText(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) return '连不上云端（网络问题，国内可能需要开代理）';
  if (/Invalid login credentials/i.test(msg)) return '邮箱或密码不对';
  if (/Email not confirmed/i.test(msg)) return '邮箱还没验证：请先点开注册邮件里的确认链接';
  if (/already registered|already been registered/i.test(msg)) return '这个邮箱已经注册过了，请直接登录';
  if (/Password should be at least/i.test(msg)) return '密码太短，至少 6 位';
  if (/rate limit/i.test(msg)) return '操作太频繁，请稍后再试';
  if (/Bucket not found/i.test(msg)) return '云端存储还没初始化（需要在 Supabase 后台运行 setup.sql）';
  if (/row-level security|violates|Unauthorized|JWT/i.test(msg)) return '没有权限（登录可能已过期，请重新登录）';
  return msg;
}

// ------------------------------------------------------------
// 账号
// ------------------------------------------------------------

export async function signUp(email: string, password: string): Promise<{ needConfirm: boolean }> {
  const sb = await getCloud();
  const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw error;
  // 开启了“邮箱验证”时不会直接返回会话
  return { needConfirm: !data.session };
}

export async function signIn(email: string, password: string): Promise<User> {
  const sb = await getCloud();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signOut(): Promise<void> {
  const sb = await getCloud();
  await sb.auth.signOut();
}

export async function currentUser(): Promise<User | null> {
  const sb = await getCloud();
  const { data } = await sb.auth.getSession();
  return data.session?.user ?? null;
}

export async function onAuthChange(cb: (u: User | null) => void): Promise<() => void> {
  const sb = await getCloud();
  const { data } = sb.auth.onAuthStateChange((_ev, session) => cb(session?.user ?? null));
  return () => data.subscription.unsubscribe();
}

async function requireUser(): Promise<{ sb: SupabaseClient; uid: string }> {
  const sb = await getCloud();
  const user = await currentUser();
  if (!user) throw new Error('请先登录');
  return { sb, uid: user.id };
}

async function download(sb: SupabaseClient, path: string): Promise<Blob | null> {
  const { data, error } = await sb.storage.from(BUCKET).download(path);
  if (error) {
    const status = (error as { status?: number; statusCode?: string }).status ?? Number((error as { statusCode?: string }).statusCode);
    if (status === 404 || status === 400 || /not found/i.test(error.message)) return null;
    throw error;
  }
  return data;
}

async function upload(sb: SupabaseClient, path: string, body: Blob, contentType: string): Promise<void> {
  const { error } = await sb.storage.from(BUCKET).upload(path, body, { upsert: true, contentType, cacheControl: '0' });
  if (error) throw error;
}

// ------------------------------------------------------------
// 存档：拉取合并 → 上传
// ------------------------------------------------------------

export async function syncDataWithCloud(): Promise<{ pulled: ImportSummary | null; pushedBytes: number }> {
  const { sb, uid } = await requireUser();
  const remote = await download(sb, `${uid}/data.json`);
  const pulled = remote ? await importBackup(await remote.text(), 'merge') : null;
  const json = JSON.stringify(await buildBackup());
  await upload(sb, `${uid}/data.json`, new Blob([json], { type: 'application/json' }), 'application/json');
  return { pulled, pushedBytes: json.length };
}

// ------------------------------------------------------------
// 图解词典：本机 → 云端（分块）；云端 → 本机
// ------------------------------------------------------------

export interface CloudDictManifest {
  name: string;
  size: number;
  parts: number;
  uploadedAt: number;
}

export async function cloudDictInfo(): Promise<CloudDictManifest | null> {
  const { sb, uid } = await requireUser();
  const m = await download(sb, `${uid}/dict/manifest.json`);
  return m ? (JSON.parse(await m.text()) as CloudDictManifest) : null;
}

export async function uploadDictToCloud(
  onProgress?: (done: number, total: number) => void,
  partSize = PART_SIZE,
): Promise<CloudDictManifest> {
  const { sb, uid } = await requireUser();
  const pack = await exportDictPack();
  if (!pack) throw new Error('这台设备上还没有词典，先导入或从 GitHub 同步一份');
  const meta = await getSetting<DictMeta | null>('dict', null);
  const parts = Math.ceil(pack.size / partSize);
  for (let i = 0; i < parts; i++) {
    const chunk = pack.slice(i * partSize, Math.min(pack.size, (i + 1) * partSize));
    await upload(sb, `${uid}/dict/part-${String(i).padStart(3, '0')}`, chunk, 'application/octet-stream');
    onProgress?.(i + 1, parts);
  }
  // 清单最后写：下载方只认清单里的块数，上传中途失败也不会读到半份词典
  const manifest: CloudDictManifest = { name: meta?.name ?? '图解词典', size: pack.size, parts, uploadedAt: Date.now() };
  await upload(sb, `${uid}/dict/manifest.json`, new Blob([JSON.stringify(manifest)], { type: 'application/json' }), 'application/json');
  return manifest;
}

export async function downloadDictFromCloud(onProgress?: (stage: 'download' | 'import', done: number, total: number) => void): Promise<DictMeta> {
  const { sb, uid } = await requireUser();
  const m = await download(sb, `${uid}/dict/manifest.json`);
  if (!m) throw new Error('云端还没有词典，先在有词典的设备上点「上传词典到云端」');
  const manifest = JSON.parse(await m.text()) as CloudDictManifest;
  const blobs: Blob[] = [];
  for (let i = 0; i < manifest.parts; i++) {
    const part = await download(sb, `${uid}/dict/part-${String(i).padStart(3, '0')}`);
    if (!part) throw new Error(`云端词典不完整（缺第 ${i + 1} 块），请在原设备上重新上传`);
    blobs.push(part);
    onProgress?.('download', i + 1, manifest.parts);
  }
  const pack = new Blob(blobs);
  if (pack.size !== manifest.size) throw new Error('云端词典不完整（大小对不上），请在原设备上重新上传');
  return importDictPack(pack, `${manifest.name}.pwdict`, (d, t) => onProgress?.('import', d, t));
}

// ------------------------------------------------------------
// 自动恢复：登录后 / 打开页面时，自动同步存档；本机没有词典而云端有，就自动下载
// ------------------------------------------------------------

export type Notify = (msg: string, kind: 'info' | 'success' | 'error') => void;

let restoring: Promise<void> | null = null;

/** 同一时间只跑一次（打开页面和刚登录可能同时触发）；出错只提示，不打断游戏 */
export function autoRestore(notify: Notify): Promise<void> {
  restoring ??= (async () => {
    try {
      if (!(await currentUser())) return;
      const r = await syncDataWithCloud();
      if (r.pulled && r.pulled.levels + r.pulled.vocab + r.pulled.history > 0) {
        notify(`☁️ 已从云端同步：关卡 ${r.pulled.levels} · 生词 ${r.pulled.vocab} · 记录 ${r.pulled.history}`, 'success');
      }
      if (!(await getSetting<DictMeta | null>('dict', null)) && (await cloudDictInfo())) {
        notify('☁️ 正在从云端恢复图解词典，稍等片刻…', 'info');
        const meta = await downloadDictFromCloud();
        notify(`☁️ 已从云端恢复「${meta.name}」：${meta.pageCount} 页、${meta.entryCount} 个词条`, 'success');
      }
    } catch (e) {
      notify(`☁️ 云端自动同步失败：${cloudErrorText(e)}`, 'error');
    } finally {
      restoring = null;
    }
  })();
  return restoring;
}
