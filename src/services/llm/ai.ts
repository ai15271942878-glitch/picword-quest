// ============================================================
// AI 业务：判卷 / 造关 / 看图校准 / 自建图生成词库
// ============================================================

import type { Judgment, Level, Recommendation, TieredWord } from '../../types';
import { buildIndex, judgeOffline, lookup, recommendOffline, resolveDuplicates } from '../../engine/offlineJudge';
import { looksEnglish, normalizeWord } from '../../engine/morph';
import { defaultFullCount } from '../../engine/scoring';
import { chat, type AiConfig, type ChatImage } from './client';
import {
  BLIND_BOX_IDEAS,
  JUDGE_SYSTEM,
  LEVEL_SYSTEM,
  VISION_SYSTEM,
  buildJudgePrompt,
  buildLevelPrompt,
  buildTextVocabPrompt,
  buildVisionVocabPrompt,
} from './prompts';
import { assertUsableVocab, coerceJudgeJson, coerceLevelJson, extractJson, toLearned, type AiLevelJson } from './json';

export interface AiJudgeResult {
  judgments: Judgment[];
  recommendations: Recommendation[];
  learned: TieredWord[];
}

/** AI 判卷：AI 给 status + relevance，前端再做对齐、去重、补判、沉淀新词 */
export async function judgeWithAI(
  cfg: AiConfig,
  level: Level,
  inputs: string[],
  extras: TieredWord[],
  opts: { image?: ChatImage; signal?: AbortSignal } = {},
): Promise<AiJudgeResult> {
  const withImage = !!opts.image && !!cfg.visionModel;
  const text = await chat(
    cfg,
    [
      { role: 'system', content: JUDGE_SYSTEM },
      { role: 'user', content: buildJudgePrompt(level, inputs, extras, withImage), image: withImage ? opts.image : undefined },
    ],
    { json: true, temperature: 0.2, vision: withImage, signal: opts.signal, timeoutMs: 90_000 },
  );
  const parsed = coerceJudgeJson(extractJson(text));
  if (!parsed.items.length) throw new Error('AI 没有返回逐词判定结果');

  const index = buildIndex(level, extras);
  const offline = judgeOffline(inputs, level, extras);
  const byInput = new Map(parsed.items.map((it) => [normalizeWord(it.input), it]));
  // 沉淀：只从“与玩家输入对齐”的判定里取（模型多吐出来的条目一律忽略）
  const learnedMap = new Map<string, TieredWord>();

  const list = inputs.map((raw, i) => {
    const it = byInput.get(normalizeWord(raw)) ?? (parsed.items.length === inputs.length ? parsed.items[i] : undefined);
    if (it && (it.status === 'correct' || it.status === 'typo') && it.relevance >= 70 && looksEnglish(it.word) && !lookup(index, it.word)) {
      const lw = toLearned(it);
      learnedMap.set(normalizeWord(lw.word), lw);
    }
    if (!it) {
      // AI 漏掉的词：用离线结果兜底，保证每个输入都有判定
      return { ...offline[i], note: `${offline[i].note ?? ''}（AI 漏判，已用离线词库补判）`.trim() };
    }
    const hit = lookup(index, it.word) ?? lookup(index, raw);
    const vocab = hit?.ie.entry;
    const j: Judgment & { _id?: string } = {
      input: raw,
      word: it.word || raw,
      status: it.status === 'invalid' ? 'invalid' : it.status,
      tier: it.tier !== 'none' ? it.tier : hit?.ie.tier ?? 'none',
      pos: it.pos || vocab?.pos || '',
      meaning: it.meaning || vocab?.meaning || '',
      relevance: it.status === 'invalid' ? 0 : it.relevance,
      note: it.note || (it.status === 'typo' ? `正确拼写：${it.word}` : undefined),
      source: 'ai',
      // 同一词条（含同义词）只计一次：命中词库就用词条 id，否则用规范化后的词
      _id: hit ? `v:${hit.ie.id}` : `w:${normalizeWord(it.word || raw)}`,
    };
    return j;
  });
  const judgments = resolveDuplicates(list);

  // 推荐词：去掉玩家写过的；不足 6 个用离线词库补齐
  const written = new Set<string>();
  judgments.forEach((j) => {
    written.add(normalizeWord(j.word));
    written.add(normalizeWord(j.input));
    const h = lookup(index, j.word);
    if (h) written.add(h.ie.id);
  });
  let recs = parsed.recommendations.filter((r) => {
    const h = lookup(index, r.word);
    return !written.has(normalizeWord(r.word)) && !(h && written.has(h.ie.id));
  });
  if (recs.length < 6) {
    const more = recommendOffline(level, extras, offline).filter((r) => !recs.some((x) => normalizeWord(x.word) === normalizeWord(r.word)));
    recs = [...recs, ...more];
  }
  return { judgments, recommendations: recs.slice(0, 10), learned: [...learnedMap.values()] };
}

// ------------------------------------------------------------
// 造关
// ------------------------------------------------------------

export type Difficulty = 'easy' | 'medium' | 'hard';

/** 第 1 步：AI 构思关卡（标题、检索词、画面描述、分级词库） */
export async function designLevel(
  cfg: AiConfig,
  opts: { theme: string; difficulty: Difficulty; avoid: string[]; signal?: AbortSignal },
): Promise<AiLevelJson> {
  const seedHint = BLIND_BOX_IDEAS[Math.floor(Math.random() * BLIND_BOX_IDEAS.length)];
  const text = await chat(
    cfg,
    [
      { role: 'system', content: LEVEL_SYSTEM },
      { role: 'user', content: buildLevelPrompt(opts.theme, opts.difficulty, opts.avoid.slice(-12), seedHint) },
    ],
    { json: true, temperature: opts.theme ? 0.7 : 1.0, signal: opts.signal, timeoutMs: 120_000 },
  );
  const json = coerceLevelJson(extractJson(text), opts.theme || 'AI 盲盒');
  assertUsableVocab(json);
  if (!json.searchKeyword) json.searchKeyword = json.titleEn || opts.theme;
  return json;
}

/** 视觉模型看图出词库（AI 搜图后的校准 / 玩家上传图） */
export async function visionVocab(
  cfg: AiConfig,
  image: ChatImage,
  opts: { title?: string; userDesc?: string; difficulty?: Difficulty; draftDesc?: string; signal?: AbortSignal },
): Promise<AiLevelJson> {
  const text = await chat(
    cfg,
    [
      { role: 'system', content: VISION_SYSTEM },
      { role: 'user', content: buildVisionVocabPrompt(opts), image },
    ],
    { json: true, temperature: 0.4, vision: true, signal: opts.signal, timeoutMs: 150_000 },
  );
  const json = coerceLevelJson(extractJson(text), opts.title || '我的图片');
  assertUsableVocab(json);
  return json;
}

/** 纯文本模型：按玩家描述出词库 */
export async function textVocab(
  cfg: AiConfig,
  opts: { title?: string; userDesc: string; difficulty?: Difficulty; signal?: AbortSignal },
): Promise<AiLevelJson> {
  const text = await chat(
    cfg,
    [
      { role: 'system', content: LEVEL_SYSTEM },
      { role: 'user', content: buildTextVocabPrompt(opts) },
    ],
    { json: true, temperature: 0.5, signal: opts.signal, timeoutMs: 120_000 },
  );
  const json = coerceLevelJson(extractJson(text), opts.title || '我的图片');
  assertUsableVocab(json);
  return json;
}

/** 及格词数不能超过词库可达上限（≥70 的词数的 2/3），否则离线模式根本过不了 */
export function safePassCount(json: Pick<AiLevelJson, 'passCount' | 'coreWords' | 'advWords'>): number {
  const qualified = json.coreWords.length + json.advWords.length;
  return Math.max(3, Math.min(json.passCount, Math.floor((qualified * 2) / 3)));
}

export function makeLevelId(prefix: 'ai' | 'custom') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** AI JSON → Level */
export function levelFromJson(
  json: AiLevelJson,
  source: 'ai' | 'custom',
  image: Pick<Level, 'imageUrl' | 'imageId' | 'credit'>,
  extra: Partial<Level> = {},
): Level {
  const passCount = safePassCount(json);
  return {
    id: makeLevelId(source),
    source,
    title: json.title,
    titleEn: json.titleEn,
    searchKeyword: json.searchKeyword,
    sceneDesc: json.sceneDesc,
    passCount,
    fullCount: defaultFullCount(passCount),
    coreWords: json.coreWords,
    advWords: json.advWords,
    weakWords: json.weakWords,
    createdAt: Date.now(),
    ...image,
    ...extra,
  };
}
