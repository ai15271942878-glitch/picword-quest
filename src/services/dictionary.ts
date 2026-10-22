// ============================================================
// 图解词典：导入玩家本机的 .pwdict 词典包 → IndexedDB；按英文 / 中文 / 拼音搜词
//
// .pwdict 格式（由 scripts/build_dict_pack.py 从 PDF 生成）：
//   "PWDICT1\n"（8 字节魔数）+ uint32 LE 头部长度 + UTF-8 JSON 头部 + 各页图片字节依次拼接
//   头部：{ name, pages: [{ page, offset, length, mime, width, height, title? }], entries: [{ en, zh, py?, page, box? }] }
//   offset 从图片区起点算起。导入时用 Blob.slice 按页切出，不会把整个文件读进内存（手机上几百 MB 也能导）。
//
// 词典内容只存在本机浏览器，不进仓库、不进网站、不进备份文件。
// ============================================================

import { useLiveQuery } from 'dexie-react-hooks';
import type { DictEntry, DictMeta, DictPage } from '../types';
import { db, getSetting, setSetting } from './db';
import { baseCandidates, inputForms, normalizeWord } from '../engine/morph';

const MAGIC = 'PWDICT1\n';

interface PackHeader {
  name?: string;
  pages: { page: number; offset: number; length: number; mime?: string; width: number; height: number; title?: string }[];
  entries: DictEntry[];
}

export async function readPackHeader(file: Blob): Promise<{ header: PackHeader; dataStart: number }> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (head.length < 12 || new TextDecoder().decode(head.slice(0, 8)) !== MAGIC) {
    throw new Error('不是有效的词典包（需要 .pwdict 文件）');
  }
  const len = new DataView(head.buffer).getUint32(8, true);
  if (12 + len > file.size) throw new Error('词典包不完整（文件可能没下载完）');
  const header = JSON.parse(new TextDecoder().decode(await file.slice(12, 12 + len).arrayBuffer())) as PackHeader;
  if (!Array.isArray(header.pages) || !Array.isArray(header.entries)) throw new Error('词典包内容格式不对');
  return { header, dataStart: 12 + len };
}

/** 导入词典包（覆盖已有词典）。onProgress(已完成页数, 总页数) */
export async function importDictPack(file: Blob, fileName: string, onProgress?: (done: number, total: number) => void): Promise<DictMeta> {
  const { header, dataStart } = await readPackHeader(file);
  for (const p of header.pages) {
    if (dataStart + p.offset + p.length > file.size) throw new Error(`词典包不完整：第 ${p.page} 页缺失`);
  }
  await deleteDict();
  const total = header.pages.length;
  const BATCH = 20;
  for (let i = 0; i < total; i += BATCH) {
    const rows: DictPage[] = header.pages.slice(i, i + BATCH).map((p) => ({
      page: p.page,
      blob: file.slice(dataStart + p.offset, dataStart + p.offset + p.length, p.mime ?? 'image/jpeg'),
      width: p.width,
      height: p.height,
      title: p.title,
    }));
    // 先读成 ArrayBuffer 再存，避免某些浏览器存的是对原文件的引用（原文件一删就失效）
    const materialized = await Promise.all(rows.map(async (r) => ({ ...r, blob: new Blob([await r.blob.arrayBuffer()], { type: r.blob.type }) })));
    await db.dictPages.bulkPut(materialized);
    onProgress?.(Math.min(total, i + BATCH), total);
  }
  const entries = header.entries
    .filter((e) => e && typeof e.en === 'string' && typeof e.page === 'number')
    .map(({ en, zh, py, page, box }) => ({ en: en.trim(), zh: (zh ?? '').trim(), py: py?.trim() || undefined, page, box }));
  await db.dictEntries.bulkAdd(entries);
  const meta: DictMeta = {
    name: header.name?.trim() || fileName.replace(/\.pwdict$/i, ''),
    pageCount: total,
    entryCount: entries.length,
    importedAt: Date.now(),
  };
  await setSetting('dict', meta);
  return meta;
}

export async function deleteDict(): Promise<void> {
  await db.transaction('rw', [db.dictPages, db.dictEntries, db.settings], async () => {
    await Promise.all([db.dictPages.clear(), db.dictEntries.clear(), db.settings.delete('dict')]);
  });
}

export function useDictMeta(): DictMeta | null | undefined {
  return useLiveQuery(() => getSetting<DictMeta | null>('dict', null), []);
}

export function useDictEntries(): DictEntry[] | undefined {
  return useLiveQuery(() => db.dictEntries.toArray(), []);
}

// ------------------------------------------------------------
// 搜索（纯函数，便于测试）
// ------------------------------------------------------------

/** 拼音去声调、去空格：“xiūxián shàngyī” → “xiuxianshangyi” */
export function plainPinyin(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ü/g, 'v')
    .replace(/[^a-z]/g, '');
}

const hasCJK = (s: string) => /[㐀-鿿]/.test(s);

/**
 * 按相关度排序返回匹配词条：
 *   0 完全命中（含单复数 / 时态还原、英美拼写）  1 开头匹配  2 整词包含  3 子串包含
 * 中文查询匹配 zh；英文查询同时匹配 en 和（去声调的）拼音。
 */
export function searchDict(entries: DictEntry[], query: string, limit = 50): DictEntry[] {
  const q = query.trim();
  if (!q) return [];
  const scored: { e: DictEntry; rank: number }[] = [];
  if (hasCJK(q)) {
    for (const e of entries) {
      const zh = e.zh;
      const rank = zh === q ? 0 : zh.startsWith(q) ? 1 : zh.includes(q) ? 2 : -1;
      if (rank >= 0) scored.push({ e, rank });
    }
  } else {
    const n = normalizeWord(q);
    if (!n) return [];
    const forms = [...new Set([...inputForms(q), ...baseCandidates(n)])];
    const exact = new Set(forms);
    const py = plainPinyin(q);
    for (const e of entries) {
      const en = normalizeWord(e.en);
      let rank = -1;
      if (exact.has(en)) rank = 0;
      else if (forms.some((f) => en.startsWith(f))) rank = 1;
      else if (forms.some((f) => ` ${en} `.includes(` ${f} `))) rank = 2;
      else if (n.length >= 3 && en.includes(n)) rank = 3;
      else if (py.length >= 2 && e.py && plainPinyin(e.py).startsWith(py)) rank = 3;
      if (rank >= 0) scored.push({ e, rank });
    }
  }
  scored.sort((a, b) => a.rank - b.rank || a.e.en.length - b.e.en.length || a.e.page - b.e.page);
  return scored.slice(0, limit).map((x) => x.e);
}
