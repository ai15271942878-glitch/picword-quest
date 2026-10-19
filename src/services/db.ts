// ============================================================
// IndexedDB（Dexie）—— 大容量本地持久化
//   levels     私人关卡库（含 AI 关卡、自建关卡、收藏的内置关卡）
//   images     图片 Blob（自建关卡上传图、AI 关卡固化后的图）
//   vocabBook  视觉生词本（每个词都绑定关卡 ID + 图片）
//   history    通关记录
//   extras     AI 判卷沉淀的“本关新词”（离线判卷时并入词库）
//   settings   体积较大或结构化的状态（收藏夹列表、已玩种子、当前对局）
// API Key 等轻量配置按 PRD 放在 localStorage（见 settings.ts）。
// ============================================================

import Dexie, { type EntityTable } from 'dexie';
import type { HistoryRecord, ImageRecord, LevelExtras, SettingRow, StoredLevel, VocabItem } from '../types';

export class PicWordDB extends Dexie {
  levels!: EntityTable<StoredLevel, 'id'>;
  images!: EntityTable<ImageRecord, 'id'>;
  vocabBook!: EntityTable<VocabItem, 'id'>;
  history!: EntityTable<HistoryRecord, 'id'>;
  extras!: EntityTable<LevelExtras, 'levelId'>;
  settings!: EntityTable<SettingRow, 'key'>;

  constructor(name = 'picword-quest') {
    super(name);
    this.version(1).stores({
      levels: 'id, folder, source, collectedAt',
      images: 'id, createdAt',
      vocabBook: '++id, &key, levelId, createdAt, due',
      history: '++id, levelId, playedAt',
      extras: 'levelId',
      settings: 'key',
    });
  }
}

export const db = new PicWordDB();

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value });
}

/** 默认收藏夹 */
export const DEFAULT_FOLDERS = ['自然风光', '现代都市', '职场办公', '校园学习', '居家生活', '美食餐饮', '交通出行', '运动休闲', 'AI 生成', '我的自制'];

export async function getFolders(): Promise<string[]> {
  const saved = await getSetting<string[] | null>('folders', null);
  return saved ?? DEFAULT_FOLDERS;
}

export async function saveFolders(folders: string[]): Promise<void> {
  await setSetting('folders', [...new Set(folders.map((f) => f.trim()).filter(Boolean))]);
}

/** 删除不再被任何关卡 / 生词 / 当前对局引用的图片（启动时调用一次） */
export async function gcImages(): Promise<number> {
  const used = new Set<string>();
  (await db.levels.toArray()).forEach((l) => l.imageId && used.add(l.imageId));
  (await db.vocabBook.toArray()).forEach((v) => v.imageId && used.add(v.imageId));
  const session = await getSetting<{ level?: { imageId?: string } } | null>('session', null);
  if (session?.level?.imageId) used.add(session.level.imageId);
  const ids = (await db.images.toCollection().primaryKeys()) as string[];
  const orphan = ids.filter((id) => !used.has(id));
  if (orphan.length) await db.images.bulkDelete(orphan);
  return orphan.length;
}
