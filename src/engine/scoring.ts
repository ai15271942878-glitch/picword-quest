// ============================================================
// 计分引擎 computeWeightedScore —— 严格按 PRD 模块三的数学模型实现
//
// 原则：AI / 离线词库只负责给出每个词的 status 与 relevance，
//       总分 100% 由本文件的公式计算，绝不让大模型“拍脑袋”给分。
//
// 单词权重 w_i：
//   relevance ≥ 70 且拼写正确（含合理变形）  → 1.0
//   relevance ≥ 70 但轻微拼写错误（typo）    → 0.5
//   relevance < 70 / 未收录 / 重复 / 无效    → 0
// N_valid  = Σ w_i
// UnitScore = 60 / N_pass
//
// 情况 A（N_valid < N_pass）：Total = round(N_valid / N_pass × 60)  —— 绝不及格
// 情况 B（N_valid ≥ N_pass）：
//   Extra   = min(30, (N_valid − N_pass) / max(1, N_full − N_pass) × 30)
//   Quality = min(10, max(0, (avgRel − 70) / 25 × 10))   （avgRel = 达标词平均关联度）
//   Total   = min(100, round(60 + Extra + Quality))
// ============================================================

import type { Judgment, ScoreResult } from '../types';

/** 达标关联度阈值 */
export const RELEVANCE_THRESHOLD = 70;
/** 满分目标词数默认系数 */
export const FULL_RATIO = 1.45;

/** 由及格词数推出默认满分词数：≈ 1.45 × N_pass，且至少比 N_pass 多 1 */
export function defaultFullCount(nPass: number): number {
  const p = Math.max(1, Math.round(nPass));
  return Math.max(p + 1, Math.round(FULL_RATIO * p));
}

/** 单个判定的折算权重 w_i */
export function weightOf(j: Pick<Judgment, 'status' | 'relevance'>): number {
  if (j.relevance < RELEVANCE_THRESHOLD) return 0;
  if (j.status === 'correct') return 1;
  if (j.status === 'typo') return 0.5;
  return 0; // unknown / invalid / duplicate
}

const fmt = (x: number, d = 1) => {
  const r = Number(x.toFixed(d));
  return Number.isInteger(r) ? String(r) : r.toFixed(d);
};

export function computeWeightedScore(
  judgments: Pick<Judgment, 'status' | 'relevance'>[],
  nPassRaw: number,
  nFullRaw?: number,
): ScoreResult {
  const nPass = Math.max(1, Math.round(nPassRaw));
  const nFull = Math.max(nPass + 1, Math.round(nFullRaw ?? defaultFullCount(nPass)));
  const unitScore = 60 / nPass;

  const weights = judgments.map(weightOf);
  const nValid = weights.reduce((a, b) => a + b, 0);
  const correctCount = weights.filter((w) => w === 1).length;
  const typoCount = weights.filter((w) => w === 0.5).length;

  const qualified = judgments.filter((_, i) => weights[i] > 0);
  const avgRel = qualified.length
    ? qualified.reduce((a, j) => a + j.relevance, 0) / qualified.length
    : 0;

  const breakdown: string[] = [];
  const validDesc =
    typoCount > 0
      ? `${correctCount} 个正确 × 1.0 + ${typoCount} 个轻微拼错 × 0.5 = ${fmt(nValid)}`
      : `${correctCount} 个正确 × 1.0 = ${fmt(nValid)}`;
  breakdown.push(`有效达标词 N_valid = ${validDesc}（关联度 ≥ ${RELEVANCE_THRESHOLD}% 才计入）`);
  breakdown.push(`本关要求：及格 N_pass = ${nPass} 个，满分目标 N_full = ${nFull} 个；每个达标词 = 60 / ${nPass} = ${fmt(unitScore, 2)} 分`);

  if (nValid < nPass) {
    // —— 情况 A：严格按比例给分，绝不及格 ——
    // 理论上 round 可能把 59.6 进成 60，这里额外夹到 59，确保“绝不及格”
    const raw = (nValid / nPass) * 60;
    const total = Math.min(59, Math.round(raw));
    const missingToPass = nPass - nValid;
    breakdown.push(`未达及格词数 → 按比例给分：round(${fmt(nValid)} / ${nPass} × 60) = round(${fmt(raw, 2)}) = ${total} 分`);
    breakdown.push(`还差 ${fmt(missingToPass)} 个达标词及格（一个拼错的词只算半个）`);
    return {
      total,
      passed: false,
      case: 'A',
      nPass,
      nFull,
      nValid,
      unitScore,
      weights,
      correctCount,
      typoCount,
      avgRel,
      extraScore: 0,
      qualityBonus: 0,
      missingToPass,
      breakdown,
    };
  }

  // —— 情况 B：保底 60，超额 + 高关联度冲刺 100 ——
  const extraScore = Math.min(30, ((nValid - nPass) / Math.max(1, nFull - nPass)) * 30);
  const qualityBonus = Math.min(10, Math.max(0, ((avgRel - 70) / 25) * 10));
  const total = Math.min(100, Math.round(60 + extraScore + qualityBonus));
  breakdown.push(`已达及格线 → 基础分 60`);
  breakdown.push(
    `超额分 = min(30, (${fmt(nValid)} − ${nPass}) / max(1, ${nFull} − ${nPass}) × 30) = ${fmt(extraScore, 2)}`,
  );
  breakdown.push(
    `质量分 = min(10, max(0, (平均关联度 ${fmt(avgRel, 1)} − 70) / 25 × 10)) = ${fmt(qualityBonus, 2)}`,
  );
  breakdown.push(`总分 = min(100, round(60 + ${fmt(extraScore, 2)} + ${fmt(qualityBonus, 2)})) = ${total} 分`);
  return {
    total,
    passed: true,
    case: 'B',
    nPass,
    nFull,
    nValid,
    unitScore,
    weights,
    correctCount,
    typoCount,
    avgRel,
    extraScore,
    qualityBonus,
    missingToPass: 0,
    breakdown,
  };
}

/** 星级：60 一星 / 80 两星 / 95 三星 */
export function starsOf(total: number): number {
  if (total >= 95) return 3;
  if (total >= 80) return 2;
  if (total >= 60) return 1;
  return 0;
}

/** 难度标签（按及格词数） */
export function difficultyOf(nPass: number): { key: string; label: string; color: string } {
  if (nPass <= 7) return { key: 'easy', label: '🟢 入门', color: 'emerald' };
  if (nPass <= 15) return { key: 'medium', label: '🔵 进阶', color: 'sky' };
  if (nPass <= 25) return { key: 'hard', label: '🟠 挑战', color: 'orange' };
  return { key: 'hell', label: '🔴 地狱', color: 'rose' };
}
