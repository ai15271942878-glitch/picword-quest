// ============================================================
// 游戏状态中枢：当前关卡 / 玩家输入 / 提示 / 判卷 / 结算 / 存档
// ============================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Level, RoundResult, TieredWord } from '../types';
import { SEED_LEVELS } from '../data/seedLevels';
import { db, getSetting, setSetting } from '../services/db';
import { getSettings } from '../services/settings';
import { resolveAiConfig } from '../services/llm/client';
import { judgeWithAI } from '../services/llm/ai';
import { toChatImage } from '../services/imageStore';
import { judgeOffline, makeHint, qualifiedEntryCount, recommendOffline, type Hint } from '../engine/offlineJudge';
import { computeWeightedScore, defaultFullCount } from '../engine/scoring';
import { looksEnglish, normalizeWord } from '../engine/morph';

export interface Session {
  level: Level;
  words: string[];
  nPass: number;
  startedAt: number;
  hints: Hint[];
  result: RoundResult | null;
}

export type Phase = 'loading' | 'playing' | 'judging' | 'result';

interface GameApi {
  session: Session | null;
  phase: Phase;
  extras: TieredWord[];
  nFull: number;
  /** 离线词库中 ≥70% 的词条数（及格要求的可达上限参考） */
  qualifiedCount: number;
  loadLevel: (level: Level, opts?: { toast?: string }) => void;
  nextRandom: () => Promise<void>;
  addWord: (raw: string) => string | null;
  removeWord: (index: number) => void;
  setNPass: (n: number) => void;
  takeHint: () => Hint | null;
  submit: () => Promise<RoundResult | null>;
  replay: () => void;
  notice: string | null;
  clearNotice: () => void;
}

const GameContext = createContext<GameApi | null>(null);

export function useGame(): GameApi {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame 必须在 GameProvider 内使用');
  return ctx;
}

const PREF_PASS: Record<string, number> = { easy: 6, medium: 12, hard: 20 };

function initialPass(level: Level, extras: TieredWord[] = []): number {
  const pref = getSettings().defaultDifficulty;
  const want = pref === 'level' ? level.passCount : PREF_PASS[pref] ?? level.passCount;
  // 不超过离线词库可达上限（否则离线模式无论如何过不了）
  const cap = Math.max(3, qualifiedEntryCount(level, extras));
  return Math.min(want, cap);
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [extras, setExtras] = useState<TieredWord[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const judgingRef = useRef(false);
  // 同步镜像：同一个事件里连续多次修改（如一次粘贴多个词）都能看到最新状态
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;
  const update = useCallback((fn: (s: Session) => Session) => {
    const cur = sessionRef.current;
    if (!cur) return;
    const next = fn(cur);
    sessionRef.current = next;
    setSession(next);
  }, []);

  // ---- 持久化当前对局（刷新不丢） ----
  useEffect(() => {
    if (!session) return;
    const t = setTimeout(() => void setSetting('session', session), 300);
    return () => clearTimeout(t);
  }, [session]);

  // ---- 关卡切换时加载 AI 沉淀词 ----
  const levelId = session?.level.id;
  useEffect(() => {
    let alive = true;
    if (!levelId) return;
    db.extras.get(levelId).then((x) => alive && setExtras(x?.words ?? []));
    return () => {
      alive = false;
    };
  }, [levelId]);

  const loadLevel = useCallback((level: Level, opts: { toast?: string } = {}) => {
    const next: Session = { level, words: [], nPass: initialPass(level), startedAt: Date.now(), hints: [], result: null };
    sessionRef.current = next;
    setSession(next);
    setPhase('playing');
    if (opts.toast) setNotice(opts.toast);
  }, []);

  const nextRandom = useCallback(async () => {
    const played = await getSetting<string[]>('playedSeeds', []);
    const currentId = session?.level.id;
    let pool = SEED_LEVELS.filter((l) => !played.includes(l.id) && l.id !== currentId);
    let note: string | undefined;
    if (!pool.length) {
      await setSetting('playedSeeds', []);
      pool = SEED_LEVELS.filter((l) => l.id !== currentId);
      note = `🎉 ${SEED_LEVELS.length} 个内置关卡已全部玩过，开启新一轮！也可以试试「AI 搜图造关」`;
    }
    const level = pool[Math.floor(Math.random() * pool.length)];
    loadLevel(level, { toast: note });
  }, [session?.level.id, loadLevel]);

  // ---- 启动：恢复未完成的对局，否则随机新关 ----
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      const saved = await getSetting<Session | null>('session', null);
      if (saved?.level && saved.words.length > 0 && !saved.result) {
        const resumed = { ...saved, startedAt: Date.now() - 1000 };
        sessionRef.current = resumed;
        setSession(resumed);
        setPhase('playing');
        setNotice(`已恢复上次未完成的关卡「${saved.level.title}」（已写 ${saved.words.length} 个词）`);
      } else {
        await nextRandom();
      }
    })();
  }, [nextRandom]);

  const addWord = useCallback(
    (raw: string): string | null => {
      const w = raw.trim().replace(/\s+/g, ' ');
      const cur = sessionRef.current;
      if (!w) return null;
      if (!cur || phase !== 'playing') return '当前不能添加';
      if (!looksEnglish(w)) return `「${w}」不是英文单词或短语（只能包含字母、空格、连字符）`;
      if (w.length > 40) return '太长了，单词或短语不超过 40 个字符';
      const n = normalizeWord(w);
      if (cur.words.some((x) => normalizeWord(x) === n)) return `「${w}」已经写过了`;
      if (cur.words.length >= 80) return '最多写 80 个词';
      update((s) => ({ ...s, words: [...s.words, w] }));
      return null;
    },
    [phase, update],
  );

  const removeWord = useCallback(
    (index: number) => {
      if (phase !== 'playing') return;
      update((s) => ({ ...s, words: s.words.filter((_, i) => i !== index) }));
    },
    [phase, update],
  );

  const setNPass = useCallback(
    (n: number) => {
      if (!Number.isFinite(n)) return;
      const v = Math.max(1, Math.min(40, Math.round(n)));
      update((s) => {
        // 已判卷：改及格词数后立即用同一批判定重新算分（AI 只给 relevance，分数永远前端算）
        if (!s.result) return { ...s, nPass: v };
        const nFull = v === s.level.passCount ? s.level.fullCount : defaultFullCount(v);
        const score = computeWeightedScore(s.result.judgments, v, nFull);
        return { ...s, nPass: v, result: { ...s.result, score } };
      });
    },
    [update],
  );

  const takeHint = useCallback((): Hint | null => {
    const cur = sessionRef.current;
    if (!cur || phase !== 'playing') return null;
    if (cur.hints.length >= getSettings().hintsPerLevel) return null;
    const h = makeHint(cur.level, extras, cur.words, cur.hints.map((x) => x.word));
    if (h) update((s) => ({ ...s, hints: [...s.hints, h] }));
    return h;
  }, [phase, extras, update]);

  const submit = useCallback(async (): Promise<RoundResult | null> => {
    if (!session || !session.words.length || judgingRef.current) return null;
    judgingRef.current = true;
    setPhase('judging');
    const { level, words, nPass } = session;
    const nFull = nPass === level.passCount ? level.fullCount : defaultFullCount(nPass);
    const settings = getSettings();
    const cfg = settings.aiEnabled ? resolveAiConfig(settings) : null;

    let judgments = null as RoundResult['judgments'] | null;
    let recommendations: RoundResult['recommendations'] = [];
    let learned: TieredWord[] = [];
    let mode: RoundResult['mode'] = 'offline';
    let fallbackReason: string | undefined;

    if (settings.aiEnabled && !cfg) fallbackReason = 'AI 已开启但没有填写 API Key（或自定义端点不完整），本次使用离线判卷';
    if (cfg) {
      try {
        const image = cfg.visionModel ? await toChatImage(level).catch(() => null) : null;
        const r = await judgeWithAI(cfg, level, words, extras, { image: image ?? undefined });
        judgments = r.judgments;
        recommendations = r.recommendations;
        learned = r.learned;
        mode = 'ai';
      } catch (e) {
        fallbackReason = `AI 判卷失败，已自动回退离线判卷：${(e as Error).message}`;
      }
    }
    if (!judgments) {
      judgments = judgeOffline(words, level, extras);
      recommendations = recommendOffline(level, extras, judgments);
    }
    const score = computeWeightedScore(judgments, nPass, nFull);
    const result: RoundResult = { judgments, score, recommendations, mode, fallbackReason, learned, judgedAt: Date.now() };

    setSession((s) => (s && s.level.id === level.id ? { ...s, result } : s));
    setPhase('result');
    judgingRef.current = false;

    // ---- 副作用：记录 / 沉淀 / 关卡统计 ----
    const durationSec = Math.round((Date.now() - session.startedAt) / 1000);
    void db.history.add({
      levelId: level.id,
      levelTitle: level.title,
      source: level.source,
      score: score.total,
      passed: score.passed,
      nValid: score.nValid,
      nPass,
      nFull,
      wordCount: words.length,
      mode,
      hintsUsed: session.hints.length,
      durationSec,
      playedAt: Date.now(),
    });
    if (level.source === 'seed') {
      const played = await getSetting<string[]>('playedSeeds', []);
      if (!played.includes(level.id)) await setSetting('playedSeeds', [...played, level.id]);
    }
    if (learned.length) {
      const cur = (await db.extras.get(level.id))?.words ?? [];
      const have = new Set(cur.map((w) => normalizeWord(w.word)));
      const merged = [...cur, ...learned.filter((w) => !have.has(normalizeWord(w.word)))];
      await db.extras.put({ levelId: level.id, words: merged, updatedAt: Date.now() });
      setExtras(merged);
    }
    const stored = await db.levels.get(level.id);
    if (stored) {
      await db.levels.update(level.id, {
        plays: (stored.plays ?? 0) + 1,
        bestScore: Math.max(stored.bestScore ?? 0, score.total),
      });
    }
    return result;
  }, [session, extras]);

  const replay = useCallback(() => {
    update((s) => ({ ...s, words: [], hints: [], result: null, startedAt: Date.now() }));
    setPhase('playing');
  }, [update]);

  const nFull = session ? (session.nPass === session.level.passCount ? session.level.fullCount : defaultFullCount(session.nPass)) : 0;
  const qualifiedCount = useMemo(() => (session ? qualifiedEntryCount(session.level, extras) : 0), [session, extras]);

  const api: GameApi = {
    session,
    phase,
    extras,
    nFull,
    qualifiedCount,
    loadLevel,
    nextRandom,
    addWord,
    removeWord,
    setNPass,
    takeHint,
    submit,
    replay,
    notice,
    clearNotice: () => setNotice(null),
  };
  // 仅开发模式：暴露给控制台 / 自动化测试（生产构建会被摇树移除）
  if (import.meta.env.DEV) (window as unknown as { __pwq: GameApi }).__pwq = api;
  return <GameContext.Provider value={api}>{children}</GameContext.Provider>;
}
