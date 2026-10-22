// ============================================================
// 游戏词库释义：图解词典查不到时的补充（内置关卡 + 关卡库 + AI 沉淀词 + 生词本）
// ============================================================

import { SEED_LEVELS } from '../data/seedLevels';
import { db } from './db';
import { baseCandidates, inputForms, normalizeWord } from '../engine/morph';

export interface VocabHit {
  word: string;
  pos: string;
  meaning: string;
  /** 出处（关卡标题 / 生词本） */
  from: string;
}

interface Source {
  word: string;
  pos: string;
  meaning: string;
  alts?: string[];
  from: string;
}

async function allSources(): Promise<Source[]> {
  const out: Source[] = [];
  const toSrc = (title: string, ws: { word: string; pos: string; meaning: string; alts?: string[] }[]) => ws.map((w) => ({ ...w, from: title }));
  for (const l of SEED_LEVELS) out.push(...toSrc(l.title, [...l.coreWords, ...l.advWords, ...l.weakWords]));
  for (const l of await db.levels.toArray()) out.push(...toSrc(l.title, [...l.coreWords, ...l.advWords, ...l.weakWords]));
  for (const x of await db.extras.toArray()) out.push(...toSrc('AI 沉淀词', x.words));
  for (const v of await db.vocabBook.toArray()) out.push({ word: v.word, pos: v.pos, meaning: v.meaning, from: '生词本' });
  return out;
}

/** 英文按词形还原后完全匹配（含同义词）；中文按释义包含匹配。同一个“词 + 释义”只保留一条。 */
export async function lookupGameVocab(query: string, limit = 8): Promise<VocabHit[]> {
  const q = query.trim();
  if (!q) return [];
  const cjk = /[㐀-鿿]/.test(q);
  const n = normalizeWord(q);
  const forms = cjk ? new Set<string>() : new Set([...inputForms(q), ...baseCandidates(n)]);
  if (!cjk && !n) return [];
  const seen = new Set<string>();
  const hits: VocabHit[] = [];
  for (const s of await allSources()) {
    const ok = cjk ? s.meaning.includes(q) : [s.word, ...(s.alts ?? [])].some((w) => forms.has(normalizeWord(w)));
    if (!ok) continue;
    const key = `${normalizeWord(s.word)}|${s.meaning}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ word: s.word, pos: s.pos, meaning: s.meaning, from: s.from });
    if (hits.length >= limit) break;
  }
  return hits;
}

/** 在线词典（国内可直接打开） */
export function onlineDictLinks(word: string): { name: string; url: string }[] {
  const w = encodeURIComponent(word.trim());
  return [
    { name: '有道词典', url: `https://dict.youdao.com/result?word=${w}&lang=en` },
    { name: '必应词典', url: `https://cn.bing.com/dict/search?q=${w}` },
  ];
}
