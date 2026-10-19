// ============================================================
// 【新增】间隔复习（Leitner 盒子）——让视觉生词本不只是“收藏夹”
//   盒子 0：新词，立即可复习
//   答对 → 升一盒，间隔 1 / 2 / 4 / 7 / 15 / 30 天
//   差一点（拼错 1 个字母）→ 留在原盒，明天再来
//   答错 → 回到 1 号盒，本轮稍后重考
// ============================================================

import type { VocabItem } from '../types';

export const BOX_DAYS = [0, 1, 2, 4, 7, 15, 30];
export const MAX_BOX = BOX_DAYS.length - 1;
const DAY = 24 * 3600 * 1000;

export type ReviewGrade = 'good' | 'almost' | 'again';

export function initialSrs(now = Date.now()): Pick<VocabItem, 'box' | 'due' | 'reviews' | 'lapses'> {
  return { box: 0, due: now, reviews: 0, lapses: 0 };
}

export function applyReview(item: Pick<VocabItem, 'box' | 'due' | 'reviews' | 'lapses'>, grade: ReviewGrade, now = Date.now()) {
  const reviews = item.reviews + 1;
  if (grade === 'good') {
    const box = Math.min(MAX_BOX, item.box + 1);
    return { box, due: now + BOX_DAYS[box] * DAY, reviews, lapses: item.lapses };
  }
  if (grade === 'almost') {
    const box = Math.max(1, item.box);
    return { box, due: now + DAY, reviews, lapses: item.lapses };
  }
  return { box: 1, due: now, reviews, lapses: item.lapses + 1 };
}

export const isDue = (item: Pick<VocabItem, 'due'>, now = Date.now()) => item.due <= now;

export function boxLabel(box: number): string {
  if (box <= 0) return '新词';
  if (box >= MAX_BOX) return '已掌握';
  return `第 ${box} 盒`;
}
