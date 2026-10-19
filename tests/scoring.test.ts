import { describe, expect, it } from 'vitest';
import { computeWeightedScore, defaultFullCount, starsOf, weightOf } from '../src/engine/scoring';
import type { JudgeStatus } from '../src/types';

/** 造 n 个指定状态/关联度的判定 */
const J = (n: number, status: JudgeStatus = 'correct', relevance = 90) =>
  Array.from({ length: n }, () => ({ status, relevance }));

describe('weightOf 单词权重', () => {
  it('关联度 ≥ 70 且拼写正确 → 1', () => expect(weightOf({ status: 'correct', relevance: 70 })).toBe(1));
  it('关联度 ≥ 70 但 typo → 0.5', () => expect(weightOf({ status: 'typo', relevance: 95 })).toBe(0.5));
  it('关联度 69 → 0（阈值边界）', () => expect(weightOf({ status: 'correct', relevance: 69 })).toBe(0));
  it('未收录 / 重复 / 无效 → 0', () => {
    expect(weightOf({ status: 'unknown', relevance: 0 })).toBe(0);
    expect(weightOf({ status: 'duplicate', relevance: 95 })).toBe(0);
    expect(weightOf({ status: 'invalid', relevance: 80 })).toBe(0);
  });
});

describe('defaultFullCount ≈ 1.45 × N_pass', () => {
  it('6 → 9', () => expect(defaultFullCount(6)).toBe(9));
  it('10 → 15', () => expect(defaultFullCount(10)).toBe(15));
  it('20 → 29', () => expect(defaultFullCount(20)).toBe(29));
  it('1 → 2（至少比 N_pass 多 1）', () => expect(defaultFullCount(1)).toBe(2));
});

describe('情况 A：未达及格词数，严格按比例且绝不及格', () => {
  it('PRD 示例：要求 6 个，写出 5 个 → 5/6×60 = 50 分，未过关', () => {
    const r = computeWeightedScore(J(5), 6);
    expect(r.total).toBe(50);
    expect(r.passed).toBe(false);
    expect(r.case).toBe('A');
    expect(r.missingToPass).toBe(1);
  });
  it('4 正确 + 2 typo = 5 个达标 → 50 分', () => {
    const r = computeWeightedScore([...J(4), ...J(2, 'typo')], 6);
    expect(r.nValid).toBe(5);
    expect(r.total).toBe(50);
    expect(r.typoCount).toBe(2);
  });
  it('低关联词不计入：3 个 ≥70 + 5 个 <70 → 3/6×60 = 30', () => {
    const r = computeWeightedScore([...J(3), ...J(5, 'correct', 50)], 6);
    expect(r.total).toBe(30);
  });
  it('0 个达标 → 0 分', () => expect(computeWeightedScore(J(4, 'unknown', 0), 8).total).toBe(0));
  it('半个词也不能凑整及格：N_pass=6, N_valid=5.5 → 55', () => {
    const r = computeWeightedScore([...J(5), ...J(1, 'typo')], 6);
    expect(r.nValid).toBe(5.5);
    expect(r.total).toBe(55);
    expect(r.passed).toBe(false);
  });
  it('极端：round 可能进位到 60 时也夹到 59（N_pass=200, N_valid=199.5）', () => {
    const r = computeWeightedScore([...J(199), ...J(1, 'typo')], 200);
    expect(r.passed).toBe(false);
    expect(r.total).toBe(59);
  });
});

describe('情况 B：达到及格词数，保底 60 冲刺 100', () => {
  it('刚好及格且平均关联度 70 → 60 分', () => {
    const r = computeWeightedScore(J(6, 'correct', 70), 6);
    expect(r.case).toBe('B');
    expect(r.extraScore).toBe(0);
    expect(r.qualityBonus).toBe(0);
    expect(r.total).toBe(60);
    expect(r.passed).toBe(true);
  });
  it('达到满分目标 + 平均关联度 95 → 100', () => {
    const r = computeWeightedScore(J(9, 'correct', 95), 6, 9);
    expect(r.extraScore).toBe(30);
    expect(r.qualityBonus).toBe(10);
    expect(r.total).toBe(100);
  });
  it('超额封顶 30、质量封顶 10、总分封顶 100', () => {
    const r = computeWeightedScore(J(30, 'correct', 100), 6, 9);
    expect(r.extraScore).toBe(30);
    expect(r.qualityBonus).toBe(10);
    expect(r.total).toBe(100);
  });
  it('中间值：N_pass=6, N_full=9, N_valid=7.5, avgRel=85 → 60+15+6 = 81', () => {
    // 6 个正确(85) + 3 个 typo(85)：N_valid = 6 + 1.5 = 7.5
    const r = computeWeightedScore([...J(6, 'correct', 85), ...J(3, 'typo', 85)], 6, 9);
    expect(r.nValid).toBe(7.5);
    expect(r.extraScore).toBeCloseTo(15, 6);
    expect(r.qualityBonus).toBeCloseTo(6, 6);
    expect(r.total).toBe(81);
  });
  it('平均关联度只统计达标词（低关联词不拉低质量分）', () => {
    const r = computeWeightedScore([...J(6, 'correct', 95), ...J(4, 'correct', 30)], 6, 9);
    expect(r.avgRel).toBe(95);
    expect(r.qualityBonus).toBe(10);
  });
  it('N_full ≤ N_pass 时用 max(1, …) 防止除零', () => {
    const r = computeWeightedScore(J(8, 'correct', 70), 6, 6);
    // N_full 被修正为 7（至少比 N_pass 多 1）：(8-6)/1×30 → 封顶 30
    expect(r.nFull).toBe(7);
    expect(r.extraScore).toBe(30);
    expect(r.total).toBe(90);
  });
  it('公式拆解文本包含关键步骤', () => {
    const r = computeWeightedScore(J(7, 'correct', 90), 6);
    expect(r.breakdown.join('\n')).toContain('基础分 60');
    expect(r.breakdown.join('\n')).toContain('超额分');
    expect(r.breakdown.join('\n')).toContain('质量分');
  });
});

describe('星级', () => {
  it('59/60/80/95', () => {
    expect(starsOf(59)).toBe(0);
    expect(starsOf(60)).toBe(1);
    expect(starsOf(80)).toBe(2);
    expect(starsOf(95)).toBe(3);
  });
});
