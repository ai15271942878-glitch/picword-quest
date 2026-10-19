// ============================================================
// 大模型输出的“容错 JSON 解析” + 字段清洗
// 大模型经常：包 ```json 代码块、前后加解释、末尾多逗号、用中文引号……
// 这里统一兜底，并把字段夹到合法范围（关联度 0~100、分级区间、词数上限）。
// ============================================================

import type { Recommendation, Tier, TieredWord, WordEntry } from '../../types';
import { normalizeWord } from '../../engine/morph';

/** 从任意文本里抠出第一个完整 JSON 对象 / 数组 */
export function extractJson<T = any>(text: string): T {
  let s = (text ?? '').trim();
  const fence = s.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();

  const start = s.search(/[{[]/);
  if (start < 0) throw new Error('输出里找不到 JSON');
  // 括号配对（忽略字符串内的括号）
  const open = s[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const candidate = end > 0 ? s.slice(start, end + 1) : s.slice(start);
  try {
    return JSON.parse(candidate);
  } catch {
    const repaired = candidate
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/,\s*([}\]])/g, '$1') // 末尾多余逗号
      .replace(/\/\/[^\n"]*$/gm, ''); // 行尾注释
    return JSON.parse(repaired);
  }
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function toRelevance(v: unknown): number {
  let n = typeof v === 'string' ? parseFloat(v.replace('%', '')) : Number(v);
  if (!Number.isFinite(n)) return 0;
  if (n > 0 && n <= 1) n *= 100; // 有的模型给 0.85
  return Math.round(clamp(n, 0, 100));
}

/** 各分级的关联度区间：保证分级与 70% 达标线语义一致 */
export const TIER_RANGE: Record<Tier, [number, number]> = {
  core: [75, 100],
  adv: [70, 95],
  weak: [20, 69],
};

const str = (v: unknown, max = 60) => (typeof v === 'string' ? v.trim().slice(0, max) : v == null ? '' : String(v).slice(0, max));

/** 清洗一个词表 */
export function coerceWords(arr: unknown, tier: Tier, max = 30): WordEntry[] {
  if (!Array.isArray(arr)) return [];
  const out: WordEntry[] = [];
  const seen = new Set<string>();
  for (const raw of arr) {
    const o = (typeof raw === 'string' ? { word: raw } : raw) as Record<string, unknown>;
    const word = str(o?.word ?? o?.en ?? o?.english, 40).replace(/\s+/g, ' ');
    const key = normalizeWord(word);
    if (!key || seen.has(key) || !/^[a-zA-Z]/.test(word)) continue;
    seen.add(key);
    const [lo, hi] = TIER_RANGE[tier];
    const rel = toRelevance(o?.relevance ?? o?.score ?? (tier === 'weak' ? 50 : 85));
    const alts = Array.isArray(o?.alts) ? (o.alts as unknown[]).map((a) => str(a, 40)).filter((a) => /^[a-zA-Z]/.test(a)) : undefined;
    out.push({
      // 首字母大写的先保留（可能是 Italian / London 这类专有词），下面统一判断
      word: /^[A-Z][a-z]/.test(word) ? word : word.toLowerCase(),
      pos: str(o?.pos ?? o?.partOfSpeech, 12) || 'n.',
      meaning: str(o?.meaning ?? o?.zh ?? o?.chinese, 30) || '—',
      relevance: clamp(rel, lo, hi),
      ...(alts?.length ? { alts } : {}),
    });
    if (out.length >= max) break;
  }
  // 模型若把大部分词都首字母大写（Passport、Knife…），说明是格式习惯而非专有名词 → 全部转小写
  const capRatio = out.length ? out.filter((w) => /^[A-Z]/.test(w.word)).length / out.length : 0;
  if (capRatio >= 0.6) out.forEach((w) => (w.word = w.word.toLowerCase()));
  return out;
}

export interface LevelVocab {
  coreWords: WordEntry[];
  advWords: WordEntry[];
  weakWords: WordEntry[];
}

export interface AiLevelJson extends LevelVocab {
  title: string;
  titleEn: string;
  searchKeyword: string;
  altKeywords: string[];
  sceneDesc: string;
  passCount: number;
}

/** 清洗“生成关卡”的输出 */
export function coerceLevelJson(o: any, fallbackTitle = 'AI 场景'): AiLevelJson {
  const kw = str(o?.searchKeyword ?? o?.keyword ?? o?.keywords, 80);
  const alt = Array.isArray(o?.altKeywords) ? o.altKeywords.map((x: unknown) => str(x, 80)).filter(Boolean).slice(0, 4) : [];
  const res: AiLevelJson = {
    title: str(o?.title, 20) || fallbackTitle,
    titleEn: str(o?.titleEn ?? o?.title_en, 50),
    searchKeyword: kw || alt[0] || '',
    altKeywords: alt,
    sceneDesc: str(o?.sceneDesc ?? o?.description, 1200),
    passCount: Math.round(clamp(Number(o?.passCount) || 8, 3, 40)),
    coreWords: coerceWords(o?.coreWords, 'core', 30),
    advWords: coerceWords(o?.advWords, 'adv', 20),
    weakWords: coerceWords(o?.weakWords, 'weak', 10),
  };
  return res;
}

export function assertUsableVocab(v: LevelVocab) {
  if (v.coreWords.length < 5 || v.coreWords.length + v.advWords.length < 10) {
    throw new Error(`AI 生成的词库太少（核心 ${v.coreWords.length} 个 / 高阶 ${v.advWords.length} 个），请重试`);
  }
}

export interface AiJudgeItem {
  input: string;
  word: string;
  status: 'correct' | 'typo' | 'invalid';
  pos: string;
  meaning: string;
  relevance: number;
  tier: Tier | 'none';
  note: string;
}

/** 清洗“判卷”的输出 */
export function coerceJudgeJson(o: any): { items: AiJudgeItem[]; recommendations: Recommendation[] } {
  const list = Array.isArray(o?.judgments) ? o.judgments : Array.isArray(o) ? o : [];
  const items: AiJudgeItem[] = list.map((j: any) => {
    const status = String(j?.status ?? '').toLowerCase();
    const tier = String(j?.tier ?? '').toLowerCase();
    return {
      input: str(j?.input, 60),
      word: str(j?.word ?? j?.corrected ?? j?.input, 60),
      status: status === 'typo' ? 'typo' : status === 'correct' ? 'correct' : 'invalid',
      pos: str(j?.pos, 12),
      meaning: str(j?.meaning, 30),
      relevance: toRelevance(j?.relevance),
      tier: (['core', 'adv', 'weak'].includes(tier) ? tier : 'none') as Tier | 'none',
      note: str(j?.note ?? j?.comment, 80),
    };
  });
  const recs: Recommendation[] = [];
  const recRaw = Array.isArray(o?.recommendations) ? o.recommendations : [];
  for (const r of recRaw) {
    const tier = (String(r?.tier ?? 'core').toLowerCase() === 'adv' ? 'adv' : 'core') as Tier;
    const [w] = coerceWords([r], tier, 1);
    if (w) recs.push({ ...w, tier });
  }
  return { items, recommendations: recs.slice(0, 12) };
}

/** AI 判定 → 可沉淀进词库的新词 */
export function toLearned(item: AiJudgeItem): TieredWord {
  const tier: Tier = item.tier === 'core' || item.tier === 'adv' ? item.tier : item.relevance >= 85 ? 'core' : 'adv';
  return { word: item.word.toLowerCase(), pos: item.pos || 'n.', meaning: item.meaning || '—', relevance: item.relevance, tier };
}
