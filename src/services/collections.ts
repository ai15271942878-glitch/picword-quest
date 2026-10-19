// ============================================================
// 两大核心资产库的数据操作（PRD 模块四）
//   · 视觉生词本：单词永远和它所在的图片绑定
//   · 私人关卡库：分类文件夹；AI / 自建关卡收藏时把图片 + 完整词库固化进 IndexedDB
// ============================================================

import { useLiveQuery } from 'dexie-react-hooks';
import { db, getFolders, saveFolders } from './db';
import { cacheRemoteImage } from './imageStore';
import { initialSrs } from './srs';
import { normalizeWord } from '../engine/morph';
import type { Level, StoredLevel, Tier, VocabItem } from '../types';

export const vocabKey = (levelId: string, word: string) => `${levelId}|${normalizeWord(word)}`;

/** 关卡图片引用：非内置关卡尽量固化成库内 Blob（离线可看） */
async function ensureImageRef(level: Level): Promise<{ imageId?: string; imageUrl?: string }> {
  if (level.imageId) return { imageId: level.imageId, imageUrl: level.imageUrl };
  if (level.imageUrl && level.source !== 'seed') {
    const id = await cacheRemoteImage(level.imageUrl);
    if (id) return { imageId: id, imageUrl: level.imageUrl };
  }
  return { imageUrl: level.imageUrl };
}

export async function collectWord(level: Level, w: { word: string; pos: string; meaning: string; relevance: number; tier: Tier | 'none' }) {
  const key = vocabKey(level.id, w.word);
  if (await db.vocabBook.where('key').equals(key).first()) return;
  const img = await ensureImageRef(level);
  const item: VocabItem = {
    key,
    word: w.word,
    pos: w.pos,
    meaning: w.meaning,
    relevance: w.relevance,
    tier: w.tier,
    levelId: level.id,
    levelTitle: level.title,
    ...img,
    createdAt: Date.now(),
    ...initialSrs(),
  };
  await db.vocabBook.add(item);
}

export async function uncollectWord(levelId: string, word: string) {
  await db.vocabBook.where('key').equals(vocabKey(levelId, word)).delete();
}

/** 当前关卡已收藏的词（实时） */
export function useCollectedKeys(levelId: string | undefined): Set<string> {
  const keys = useLiveQuery(
    () => (levelId ? db.vocabBook.where('levelId').equals(levelId).toArray() : Promise.resolve([] as VocabItem[])),
    [levelId],
  );
  return new Set((keys ?? []).map((v) => v.key));
}

export function useVocabCount(): number {
  return useLiveQuery(() => db.vocabBook.count(), []) ?? 0;
}

export function useDueCount(): number {
  return useLiveQuery(() => db.vocabBook.where('due').belowOrEqual(Date.now()).count(), []) ?? 0;
}

// ------------------------------------------------------------
// 关卡库
// ------------------------------------------------------------

export async function collectLevel(level: Level, folder: string): Promise<StoredLevel> {
  const prev = await db.levels.get(level.id);
  const img = await ensureImageRef(level);
  // AI 判卷沉淀的新词一并固化进关卡词库
  const extras = await db.extras.get(level.id);
  const merged: Level = { ...level };
  if (extras?.words.length) {
    const have = new Set([...level.coreWords, ...level.advWords, ...level.weakWords].map((w) => normalizeWord(w.word)));
    for (const w of extras.words) {
      if (have.has(normalizeWord(w.word))) continue;
      const { tier, ...entry } = w;
      if (tier === 'core') merged.coreWords = [...merged.coreWords, entry];
      else if (tier === 'adv') merged.advWords = [...merged.advWords, entry];
      else merged.weakWords = [...merged.weakWords, entry];
    }
  }
  const stored: StoredLevel = {
    ...merged,
    ...img,
    folder,
    collectedAt: prev?.collectedAt ?? Date.now(),
    plays: prev?.plays ?? 0,
    bestScore: prev?.bestScore ?? null,
  };
  await db.levels.put(stored);
  const folders = await getFolders();
  if (!folders.includes(folder)) await saveFolders([...folders, folder]);
  return stored;
}

export async function removeLevel(id: string) {
  await db.levels.delete(id);
}

export async function moveLevel(id: string, folder: string) {
  await db.levels.update(id, { folder });
  const folders = await getFolders();
  if (!folders.includes(folder)) await saveFolders([...folders, folder]);
}

export async function renameFolder(from: string, to: string) {
  const name = to.trim();
  if (!name || name === from) return;
  await db.levels.where('folder').equals(from).modify({ folder: name });
  const folders = await getFolders();
  await saveFolders(folders.map((f) => (f === from ? name : f)));
}

export async function deleteFolder(name: string, moveTo = '未分类') {
  await db.levels.where('folder').equals(name).modify({ folder: moveTo });
  const folders = (await getFolders()).filter((f) => f !== name);
  const hasMoved = (await db.levels.where('folder').equals(moveTo).count()) > 0;
  await saveFolders(hasMoved && !folders.includes(moveTo) ? [...folders, moveTo] : folders);
}

export function useStoredLevel(id: string | undefined) {
  return useLiveQuery(async () => (id ? await db.levels.get(id) : undefined), [id]);
}

export function useFolders(): string[] {
  return useLiveQuery(() => getFolders(), []) ?? [];
}
