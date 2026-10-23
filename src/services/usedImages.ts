// ============================================================
// AI 造关防撞图：关卡库 + 内置总库里已经用过的照片，搜到时排到最后并标记“已用过”
// 按原图页面地址（pageUrl）和图片地址（url）比对，去掉查询参数、大小写、结尾斜杠
// ============================================================

import { SEED_LEVELS } from '../data/seedLevels';
import { db } from './db';
import type { ImageCandidate } from './imageSearch';

export function normalizeImageKey(u: string | undefined): string {
  if (!u) return '';
  try {
    const url = new URL(u);
    return `${url.host}${url.pathname}`.toLowerCase().replace(/\/+$/, '');
  } catch {
    return u.trim().toLowerCase();
  }
}

interface WithImage {
  imageUrl?: string;
  credit?: { pageUrl?: string };
}

export function imageKeysOf(levels: WithImage[]): Set<string> {
  const keys = new Set<string>();
  for (const l of levels) {
    for (const k of [normalizeImageKey(l.imageUrl), normalizeImageKey(l.credit?.pageUrl)]) if (k) keys.add(k);
  }
  return keys;
}

/** 关卡库 + 内置总库里用过的照片 */
export async function usedImageKeys(): Promise<Set<string>> {
  return imageKeysOf([...SEED_LEVELS, ...(await db.levels.toArray())]);
}

export const isUsedImage = (c: Pick<ImageCandidate, 'url' | 'pageUrl'>, used: Set<string>) =>
  used.has(normalizeImageKey(c.url)) || used.has(normalizeImageKey(c.pageUrl));

/** 没用过的排前面（各自保持原来的相关度顺序），返回排序后的列表和用过的数量 */
export function preferUnused<T extends Pick<ImageCandidate, 'url' | 'pageUrl'>>(cands: T[], used: Set<string>): { list: T[]; usedCount: number } {
  const fresh = cands.filter((c) => !isUsedImage(c, used));
  const old = cands.filter((c) => isUsedImage(c, used));
  return { list: [...fresh, ...old], usedCount: old.length };
}
