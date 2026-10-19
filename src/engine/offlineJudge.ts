// ============================================================
// 离线判卷：关卡词库 + 词形变化 + 编辑距离纠错（零延迟、零网络）
//
// 匹配优先级：
//   1. 精确命中词条原形 / 同义词 alts
//   2. 命中原形生成的合法变形（复数 / 三单 / -ing / -ed / 比较级）
//   3. 命中复合词连写（icecream）或英式拼写（colour）
//   4. 命中“反推原形”（词库写 cooking，玩家写 cook）
//   5. 以上都不中 → OSA 编辑距离 = 1（且词长 ≥ 4）→ typo，计 0.5
//   6. 编辑距离 = 2 → 不计分，但提示“你是不是想写 xxx？”
// 同一词条被多次命中（如 taxi 与 cab）只计一次，其余标为 duplicate。
// ============================================================

import type { Judgment, Level, Recommendation, Tier, TieredWord, WordEntry } from '../types';
import { baseCandidates, inflections, inputForms, normalizeWord, spaceless } from './morph';
import { typoDistance } from './levenshtein';

export interface IndexedEntry {
  /** 词条唯一键（规范化后的原形） */
  id: string;
  entry: WordEntry;
  tier: Tier;
  source: 'vocab' | 'learned';
}

interface Hit {
  ie: IndexedEntry;
  /** 命中的具体写法（原形 / 变形 / 同义词） */
  form: string;
  kind: 'base' | 'alt' | 'inflection' | 'loose';
}

export interface VocabIndex {
  entries: IndexedEntry[];
  exact: Map<string, Hit>;
  loose: Map<string, Hit>;
}

/** 关卡全部词条（含 AI 沉淀词），按 core → adv → weak 顺序 */
export function levelEntries(level: Pick<Level, 'coreWords' | 'advWords' | 'weakWords'>, extras: TieredWord[] = []): IndexedEntry[] {
  const out: IndexedEntry[] = [];
  const seen = new Set<string>();
  const push = (e: WordEntry, tier: Tier, source: 'vocab' | 'learned') => {
    const id = normalizeWord(e.word);
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({ id, entry: e, tier, source });
  };
  level.coreWords.forEach((e) => push(e, 'core', 'vocab'));
  level.advWords.forEach((e) => push(e, 'adv', 'vocab'));
  level.weakWords.forEach((e) => push(e, 'weak', 'vocab'));
  extras.forEach((e) => push(e, e.tier, 'learned'));
  return out;
}

export function buildIndex(level: Pick<Level, 'coreWords' | 'advWords' | 'weakWords'>, extras: TieredWord[] = []): VocabIndex {
  const entries = levelEntries(level, extras);
  const exact = new Map<string, Hit>();
  const loose = new Map<string, Hit>();
  const put = (map: Map<string, Hit>, key: string, hit: Hit) => {
    if (key && !map.has(key)) map.set(key, hit);
  };

  // 第 1 轮：原形 + 同义词（优先级最高，避免被别的词的变形抢占）
  for (const ie of entries) {
    put(exact, ie.id, { ie, form: ie.entry.word, kind: 'base' });
    for (const alt of ie.entry.alts ?? []) put(exact, normalizeWord(alt), { ie, form: alt, kind: 'alt' });
  }
  // 第 2 轮：合法变形
  for (const ie of entries) {
    const surfaces = [ie.entry.word, ...(ie.entry.alts ?? [])];
    for (const s of surfaces) {
      for (const f of inflections(s, ie.entry.pos)) put(exact, f, { ie, form: f, kind: 'inflection' });
    }
  }
  // 第 3 轮：复合词连写形式
  for (const [k, hit] of [...exact.entries()]) {
    if (k.includes(' ')) put(exact, spaceless(k), hit);
  }
  // 第 4 轮：反推原形（低优先级，单独一张表）
  for (const ie of entries) {
    for (const s of [ie.entry.word, ...(ie.entry.alts ?? [])]) {
      const n = normalizeWord(s);
      for (const b of baseCandidates(n)) {
        if (!exact.has(b)) {
          put(loose, b, { ie, form: s, kind: 'loose' });
          for (const f of inflections(b, ie.entry.pos)) if (!exact.has(f)) put(loose, f, { ie, form: s, kind: 'loose' });
        }
      }
    }
  }
  return { entries, exact, loose };
}

/** 查找一个输入命中的词条（不含拼写纠错） */
export function lookup(index: VocabIndex, raw: string): Hit | null {
  const forms = inputForms(raw);
  for (const f of forms) {
    const h = index.exact.get(f);
    if (h) return h;
  }
  for (const f of forms) {
    const h = index.loose.get(f);
    if (h) return h;
  }
  return null;
}

/** 两个字符串的公共后缀长度 */
function commonSuffix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

/**
 * 拼写纠错：返回最近的词条写法与距离。
 * 平局规则：距离小优先 → 关联度高优先 → 与输入公共后缀长优先
 * （tomatos 离 tomato、tomatoes 都是 1，但玩家显然想写复数，应纠正为 tomatoes）。
 */
export function nearest(index: VocabIndex, raw: string): { hit: Hit; dist: number } | null {
  const forms = inputForms(raw);
  let best: { hit: Hit; dist: number; suffix: number } | null = null;
  for (const f of forms) {
    for (const [k, hit] of index.exact) {
      if (Math.abs(k.length - f.length) > 2) continue;
      const d = typoDistance(f, k, 2);
      if (d > 2) continue;
      const suffix = commonSuffix(f, k);
      const rel = hit.ie.entry.relevance;
      if (
        !best ||
        d < best.dist ||
        (d === best.dist && rel > best.hit.ie.entry.relevance) ||
        (d === best.dist && rel === best.hit.ie.entry.relevance && suffix > best.suffix)
      ) {
        best = { hit, dist: d, suffix };
      }
    }
  }
  return best ? { hit: best.hit, dist: best.dist } : null;
}

const STATUS_RANK: Record<string, number> = { correct: 2, typo: 1 };

/**
 * 离线判卷主函数：逐词判定 status / relevance / 分级 / 释义。
 * 计分交给 computeWeightedScore（本函数不算分）。
 */
export function judgeOffline(
  inputs: string[],
  level: Pick<Level, 'coreWords' | 'advWords' | 'weakWords'>,
  extras: TieredWord[] = [],
): Judgment[] {
  const index = buildIndex(level, extras);
  const res: (Judgment & { _id?: string })[] = inputs.map((raw) => {
    const norm = normalizeWord(raw);
    if (!norm) {
      return {
        input: raw,
        word: raw,
        status: 'invalid',
        tier: 'none',
        pos: '',
        meaning: '',
        relevance: 0,
        note: '无法识别为英文单词',
        source: 'vocab',
      };
    }
    const hit = lookup(index, raw);
    if (hit) {
      const e = hit.ie.entry;
      let note: string | undefined;
      if (hit.kind === 'alt') note = `同义词，按 ${e.word} 计`;
      return {
        input: raw,
        word: e.word,
        status: 'correct',
        tier: hit.ie.tier,
        pos: e.pos,
        meaning: e.meaning,
        relevance: e.relevance,
        note,
        source: hit.ie.source,
        _id: hit.ie.id,
      };
    }
    const near = nearest(index, raw);
    const minLen = near ? Math.min(norm.length, normalizeWord(near.hit.form).length) : 0;
    if (near && near.dist === 1 && minLen >= 4) {
      const e = near.hit.ie.entry;
      return {
        input: raw,
        word: near.hit.form,
        status: 'typo',
        tier: near.hit.ie.tier,
        pos: e.pos,
        meaning: e.meaning,
        relevance: e.relevance,
        note: `轻微拼写错误，正确拼写：${near.hit.form}`,
        source: near.hit.ie.source,
        _id: near.hit.ie.id,
      };
    }
    let note = '离线词库未收录（开启 AI 判卷可识别词库外的词）';
    if (near && near.dist <= 2 && norm.length >= 5) note = `词库未收录。你是不是想写 “${near.hit.form}”？`;
    return {
      input: raw,
      word: norm,
      status: 'unknown',
      tier: 'none',
      pos: '',
      meaning: '',
      relevance: 0,
      note,
      source: 'vocab',
    };
  });

  return resolveDuplicates(res);
}

/** 同一词条被多次命中时只保留最好的一个（correct 优先于 typo，其次先写的） */
export function resolveDuplicates<T extends Judgment & { _id?: string }>(list: T[]): Judgment[] {
  const bestByEntry = new Map<string, number>();
  list.forEach((j, i) => {
    if (!j._id || !(j.status in STATUS_RANK)) return;
    const cur = bestByEntry.get(j._id);
    if (cur === undefined || STATUS_RANK[j.status] > STATUS_RANK[list[cur].status]) bestByEntry.set(j._id, i);
  });
  return list.map((j, i) => {
    const { _id, ...rest } = j;
    if (_id && j.status in STATUS_RANK && bestByEntry.get(_id) !== i) {
      const keeper = list[bestByEntry.get(_id)!];
      return { ...rest, status: 'duplicate' as const, note: `与 “${keeper.input}” 是同一个词条，不重复计分` };
    }
    return rest;
  });
}

/** 被玩家命中（correct / typo / duplicate）的词条 id 集合 */
export function foundEntryIds(index: VocabIndex, judgments: Judgment[]): Set<string> {
  const ids = new Set<string>();
  for (const j of judgments) {
    if (j.status !== 'correct' && j.status !== 'typo' && j.status !== 'duplicate') continue;
    const hit = lookup(index, j.word) ?? lookup(index, j.input);
    if (hit) ids.add(hit.ie.id);
  }
  return ids;
}

/**
 * 离线“高分拓展词”：从玩家没写出的 core / adv 词中按关联度挑 8~10 个，
 * 核心词约 5 个、高阶词约 4~5 个；某一类不足时由另一类补齐。
 */
export function recommendOffline(
  level: Pick<Level, 'coreWords' | 'advWords' | 'weakWords'>,
  extras: TieredWord[],
  judgments: Judgment[],
  total = 10,
): Recommendation[] {
  const index = buildIndex(level, extras);
  const found = foundEntryIds(index, judgments);
  const pool = index.entries.filter((ie) => !found.has(ie.id) && ie.tier !== 'weak');
  const byRel = (a: IndexedEntry, b: IndexedEntry) => b.entry.relevance - a.entry.relevance;
  const core = pool.filter((ie) => ie.tier === 'core').sort(byRel);
  const adv = pool.filter((ie) => ie.tier === 'adv').sort(byRel);
  const wantCore = Math.min(core.length, Math.max(5, total - adv.length));
  const wantAdv = Math.min(adv.length, total - wantCore);
  const picked = [...core.slice(0, wantCore), ...adv.slice(0, wantAdv)];
  return picked.map((ie) => ({ ...ie.entry, tier: ie.tier }));
}

/** 提示：一个尚未写出的核心词 → 中文释义 + 首字母掩码 */
export interface Hint {
  word: string;
  meaning: string;
  pos: string;
  mask: string;
  tier: Tier;
}

export function maskWord(word: string): string {
  return word
    .split(' ')
    .map((t) => (t.length <= 1 ? t : t[0] + '_'.repeat(t.length - 1)))
    .join(' ');
}

export function makeHint(
  level: Pick<Level, 'coreWords' | 'advWords' | 'weakWords'>,
  extras: TieredWord[],
  inputs: string[],
  alreadyHinted: string[],
  rand: () => number = Math.random,
): Hint | null {
  const index = buildIndex(level, extras);
  const found = new Set<string>();
  for (const raw of inputs) {
    const h = lookup(index, raw);
    if (h) found.add(h.ie.id);
  }
  const hinted = new Set(alreadyHinted.map(normalizeWord));
  const pick = (tier: Tier) =>
    index.entries
      .filter((ie) => ie.tier === tier && !found.has(ie.id) && !hinted.has(ie.id))
      .sort((a, b) => b.entry.relevance - a.entry.relevance);
  let pool = pick('core');
  if (!pool.length) pool = pick('adv');
  if (!pool.length) return null;
  // 在关联度最高的前一半里随机，既有帮助又不总是同一个词
  const top = pool.slice(0, Math.max(1, Math.ceil(pool.length / 2)));
  const ie = top[Math.floor(rand() * top.length)];
  return { word: ie.entry.word, meaning: ie.entry.meaning, pos: ie.entry.pos, mask: maskWord(ie.entry.word), tier: ie.tier };
}

/** 离线词库里关联度 ≥ 70 的词条数（用于提示“及格要求是否超出词库上限”） */
export function qualifiedEntryCount(level: Pick<Level, 'coreWords' | 'advWords' | 'weakWords'>, extras: TieredWord[] = []): number {
  return levelEntries(level, extras).filter((ie) => ie.entry.relevance >= 70).length;
}
