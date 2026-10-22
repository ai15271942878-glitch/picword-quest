// ============================================================
// 全局存档导出 / 导入（PRD 模块四.3）
// 导出：IndexedDB 全部表 → 一个 .json（图片 Blob 转 data URL 内嵌）
// 导入：合并（默认，保留本地已有数据）或覆盖
// 出于安全考虑，API Key（localStorage）不进存档。
// ============================================================

import { db } from './db';
import { blobToDataUrl, dataUrlToBlob } from './imageStore';
import type { HistoryRecord, LevelExtras, SettingRow, StoredLevel, VocabItem } from '../types';

export const BACKUP_APP = 'picword-quest';
export const BACKUP_VERSION = 1;
/** 只属于本机、不进存档的 settings 行：当前对局、图解词典元信息（词典本体不进存档，元信息也不能单独带过去） */
const LOCAL_ONLY_KEYS = ['session', 'dict'];

interface BackupImage {
  id: string;
  dataUrl: string;
  mime: string;
  width: number;
  height: number;
  sourceUrl?: string;
  createdAt: number;
}

export interface BackupFile {
  app: string;
  version: number;
  exportedAt: string;
  data: {
    levels: StoredLevel[];
    images: BackupImage[];
    vocabBook: VocabItem[];
    history: HistoryRecord[];
    extras: LevelExtras[];
    settings: SettingRow[];
  };
}

export async function buildBackup(): Promise<BackupFile> {
  const [levels, images, vocabBook, history, extras, settings] = await Promise.all([
    db.levels.toArray(),
    db.images.toArray(),
    db.vocabBook.toArray(),
    db.history.toArray(),
    db.extras.toArray(),
    db.settings.toArray(),
  ]);
  const imgs: BackupImage[] = [];
  for (const im of images) {
    imgs.push({ id: im.id, dataUrl: await blobToDataUrl(im.blob), mime: im.mime, width: im.width, height: im.height, sourceUrl: im.sourceUrl, createdAt: im.createdAt });
  }
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    // 当前对局、词典元信息不导出
    data: { levels, images: imgs, vocabBook, history, extras, settings: settings.filter((s) => !LOCAL_ONLY_KEYS.includes(s.key)) },
  };
}

export async function downloadBackup(): Promise<{ bytes: number; filename: string }> {
  const backup = await buildBackup();
  const json = JSON.stringify(backup);
  const blob = new Blob([json], { type: 'application/json' });
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const filename = `picword-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return { bytes: blob.size, filename };
}

export interface ImportSummary {
  levels: number;
  images: number;
  vocab: number;
  history: number;
}

export function validateBackup(obj: any): asserts obj is BackupFile {
  if (!obj || obj.app !== BACKUP_APP) throw new Error('这不是 PicWord Quest 的存档文件');
  if (typeof obj.version !== 'number' || obj.version > BACKUP_VERSION) throw new Error(`存档版本 ${obj.version} 太新，请升级游戏`);
  if (!obj.data || !Array.isArray(obj.data.levels)) throw new Error('存档内容损坏');
}

export async function importBackup(text: string, mode: 'merge' | 'replace'): Promise<ImportSummary> {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('文件不是合法的 JSON');
  }
  validateBackup(obj);
  const { data } = obj;
  const images = await Promise.all(
    (data.images ?? []).map(async (im) => ({
      id: im.id,
      blob: await dataUrlToBlob(im.dataUrl),
      mime: im.mime,
      width: im.width,
      height: im.height,
      sourceUrl: im.sourceUrl,
      createdAt: im.createdAt,
    })),
  );
  const summary: ImportSummary = { levels: 0, images: 0, vocab: 0, history: 0 };

  await db.transaction('rw', [db.levels, db.images, db.vocabBook, db.history, db.extras, db.settings], async () => {
    if (mode === 'replace') {
      await Promise.all([db.levels.clear(), db.images.clear(), db.vocabBook.clear(), db.history.clear(), db.extras.clear()]);
      const keep = (await db.settings.bulkGet(LOCAL_ONLY_KEYS)).filter((r) => r !== undefined);
      await db.settings.clear();
      if (keep.length) await db.settings.bulkPut(keep);
    }
    // 关卡 / 图片：按 ID 覆盖写入
    await db.images.bulkPut(images);
    summary.images = images.length;
    await db.levels.bulkPut(data.levels ?? []);
    summary.levels = (data.levels ?? []).length;

    // 生词：按 key 去重，本地已有的保留（保住复习进度）
    for (const v of data.vocabBook ?? []) {
      const { id: _drop, ...rest } = v;
      void _drop;
      if (!(await db.vocabBook.where('key').equals(rest.key).first())) {
        await db.vocabBook.add(rest as VocabItem);
        summary.vocab++;
      }
    }
    // 通关记录：按 (levelId, playedAt) 去重
    const existing = new Set((await db.history.toArray()).map((h) => `${h.levelId}@${h.playedAt}`));
    for (const h of data.history ?? []) {
      const { id: _drop, ...rest } = h;
      void _drop;
      if (!existing.has(`${rest.levelId}@${rest.playedAt}`)) {
        await db.history.add(rest as HistoryRecord);
        summary.history++;
      }
    }
    // AI 沉淀词：合并
    for (const ex of data.extras ?? []) {
      const cur = await db.extras.get(ex.levelId);
      if (!cur) await db.extras.put(ex);
      else {
        const seen = new Set(cur.words.map((w) => w.word.toLowerCase()));
        await db.extras.put({ ...cur, words: [...cur.words, ...ex.words.filter((w) => !seen.has(w.word.toLowerCase()))], updatedAt: Date.now() });
      }
    }
    // 收藏夹列表合并、已玩种子合并
    for (const s of data.settings ?? []) {
      if (LOCAL_ONLY_KEYS.includes(s.key)) continue;
      const cur = await db.settings.get(s.key);
      if (cur && Array.isArray(cur.value) && Array.isArray(s.value)) {
        await db.settings.put({ key: s.key, value: [...new Set([...(cur.value as unknown[]), ...(s.value as unknown[])])] });
      } else if (!cur || mode === 'replace') {
        await db.settings.put(s);
      }
    }
  });
  return summary;
}

export async function clearAllData() {
  await db.transaction('rw', [db.levels, db.images, db.vocabBook, db.history, db.extras, db.settings], async () => {
    // 图解词典单独管理（词典面板里删除），这里保留它的元信息
    const dict = await db.settings.get('dict');
    await Promise.all([db.levels.clear(), db.images.clear(), db.vocabBook.clear(), db.history.clear(), db.extras.clear(), db.settings.clear()]);
    if (dict) await db.settings.put(dict);
  });
}
