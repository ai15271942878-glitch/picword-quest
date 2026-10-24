// ============================================================
// 🎯 场景分拣（关卡复习）的规则：挑场景、出词、计分、过关与星级
// 只用闯关及格过的关卡；每个词只属于其中一张图（在别的场景词库里出现过的词不出）。
// 纯函数，界面在 components/modals/SortGameModal.tsx。
// ============================================================

import type { Level } from '../types';
import { normalizeWord } from './morph';

export interface SortStage {
  stage: number;
  scenes: number;
  /** 每个词在传送带最前面停留的毫秒数，超时算漏掉 */
  wordMs: number;
  words: number;
}

export const SORT_STAGES: SortStage[] = [
  { stage: 1, scenes: 3, wordMs: 6000, words: 18 },
  { stage: 2, scenes: 4, wordMs: 4500, words: 22 },
  { stage: 3, scenes: 5, wordMs: 3500, words: 26 },
];

export const MIN_PASSED_LEVELS = SORT_STAGES[0].scenes;

export interface SortWord {
  word: string;
  meaning: string;
  pos: string;
  /** 所属场景在本局场景数组里的下标 */
  scene: number;
}

type Rand = () => number;

/** 一个关卡里画面相关（关联度 ≥ 70）的核心 / 高阶词，以及它们所有写法的规范化形式 */
function sceneVocab(level: Level) {
  const entries = [...level.coreWords, ...level.advWords].filter((e) => e.relevance >= 70);
  const forms = new Set<string>();
  for (const e of [...level.coreWords, ...level.advWords, ...level.weakWords]) {
    for (const w of [e.word, ...(e.alts ?? [])]) forms.add(normalizeWord(w));
  }
  return { entries, forms };
}

/** 每个场景只属于它自己的词（别的场景词库里出现过的写法都排除） */
export function uniqueWords(levels: Level[]): SortWord[][] {
  const vocab = levels.map(sceneVocab);
  return vocab.map((v, i) => {
    const seen = new Set<string>();
    const out: SortWord[] = [];
    for (const e of v.entries) {
      const n = normalizeWord(e.word);
      if (!n || seen.has(n)) continue;
      const forms = [e.word, ...(e.alts ?? [])].map(normalizeWord);
      if (vocab.some((o, j) => j !== i && forms.some((f) => o.forms.has(f)))) continue;
      seen.add(n);
      out.push({ word: e.word, meaning: e.meaning, pos: e.pos, scene: i });
    }
    return out;
  });
}

function shuffle<T>(a: T[], rand: Rand): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/** 两个场景词库的重叠程度（共同写法数） */
function overlap(a: Level, b: Level): number {
  const fa = sceneVocab(a).forms;
  let n = 0;
  for (const f of sceneVocab(b).forms) if (fa.has(f)) n++;
  return n;
}

/** 从通关关卡里挑 n 个场景：随机试若干组，取词库重叠最少、且每张图都有足够独有词的一组 */
export function pickScenes(passed: Level[], n: number, rand: Rand = Math.random, tries = 24): Level[] {
  if (passed.length <= n) return shuffle(passed, rand);
  let best: Level[] = [];
  let bestCost = Infinity;
  for (let t = 0; t < tries; t++) {
    const pick = shuffle(passed, rand).slice(0, n);
    let cost = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) cost += overlap(pick[i], pick[j]);
    const thin = uniqueWords(pick).filter((ws) => ws.length < 4).length;
    cost += thin * 100;
    if (cost < bestCost) {
      bestCost = cost;
      best = pick;
    }
  }
  return best;
}

/** 本局的单词队列：各场景尽量平均，顺序打乱，避免同一场景连续出太多 */
export function buildQueue(perScene: SortWord[][], total: number, rand: Rand = Math.random): SortWord[] {
  const pools = perScene.map((ws) => shuffle(ws, rand));
  const out: SortWord[] = [];
  let i = 0;
  while (out.length < total && pools.some((p) => p.length)) {
    const p = pools[i % pools.length];
    if (p.length) out.push(p.pop()!);
    i++;
  }
  return shuffle(out, rand);
}

// ------------------------------------------------------------
// 计分
// ------------------------------------------------------------

export type SortOutcome = 'correct' | 'wrong' | 'miss';

export interface SortAnswer {
  word: SortWord;
  outcome: SortOutcome;
  /** 玩家扔进的场景（漏掉时为 null） */
  chosen: number | null;
  ms: number;
}

/** 单词得分：答对 = 100 + 速度奖励（越快越多，最多 100）× 连击倍数（每连击 +10%，最多 ×2）；答错 −50；漏掉 0 */
export function pointsFor(outcome: SortOutcome, ms: number, wordMs: number, combo: number): number {
  if (outcome === 'wrong') return -50;
  if (outcome === 'miss') return 0;
  const speed = Math.round(Math.max(0, 1 - ms / wordMs) * 100);
  const mult = 1 + Math.min(combo, 10) * 0.1;
  return Math.round((100 + speed) * mult);
}

export interface SortResult {
  total: number;
  correct: number;
  wrong: number;
  missed: number;
  accuracy: number;
  avgMs: number;
  maxCombo: number;
  passed: boolean;
  stars: number;
}

/** 过关：正确率 ≥ 80% 且漏掉 ≤ 3 个；⭐⭐ 正确率 ≥ 90%；⭐⭐⭐ 正确率 ≥ 95% 且平均反应 < 2 秒 */
export function summarize(answers: SortAnswer[], wordMs: number): SortResult {
  let total = 0;
  let combo = 0;
  let maxCombo = 0;
  for (const a of answers) {
    total += pointsFor(a.outcome, a.ms, wordMs, combo);
    combo = a.outcome === 'correct' ? combo + 1 : 0;
    maxCombo = Math.max(maxCombo, combo);
  }
  const correct = answers.filter((a) => a.outcome === 'correct').length;
  const wrong = answers.filter((a) => a.outcome === 'wrong').length;
  const missed = answers.filter((a) => a.outcome === 'miss').length;
  const accuracy = answers.length ? correct / answers.length : 0;
  const hit = answers.filter((a) => a.outcome === 'correct');
  const avgMs = hit.length ? hit.reduce((s, a) => s + a.ms, 0) / hit.length : 0;
  const passed = accuracy >= 0.8 && missed <= 3;
  const stars = !passed ? 0 : accuracy >= 0.95 && avgMs < 2000 ? 3 : accuracy >= 0.9 ? 2 : 1;
  return { total: Math.max(0, total), correct, wrong, missed, accuracy, avgMs, maxCombo, passed, stars };
}

/** 进度：每阶最好成绩；拿到 ⭐⭐ 解锁下一阶 */
export interface SortProgress {
  best: Record<number, { score: number; stars: number }>;
  plays: number;
}

export const emptyProgress = (): SortProgress => ({ best: {}, plays: 0 });

export function isStageUnlocked(p: SortProgress, stage: number): boolean {
  return stage === 1 || (p.best[stage - 1]?.stars ?? 0) >= 2;
}

export function recordResult(p: SortProgress, stage: number, r: SortResult): SortProgress {
  const prev = p.best[stage];
  const best = { score: Math.max(prev?.score ?? 0, r.total), stars: Math.max(prev?.stars ?? 0, r.stars) };
  return { best: { ...p.best, [stage]: best }, plays: p.plays + 1 };
}
