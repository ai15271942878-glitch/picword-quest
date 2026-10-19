// ============================================================
// 判卷结果面板（PRD 模块三.4）
//   · 分数横幅 + 星级
//   · 透明的公式计算拆解框
//   · 玩家单词逐一评析：发音 / 分级 / 词性释义 / 关联度进度条 / 单项权重得分 / 收藏
//   · 本关高分拓展词汇 8~10 个
//   · 【新增】本关完整词库揭晓（标出你写到了哪些）
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../../game/GameContext';
import { collectWord, uncollectWord, useCollectedKeys, useStoredLevel, vocabKey } from '../../services/collections';
import { useSettings } from '../../services/settings';
import { PROVIDERS } from '../../services/llm/providers';
import { buildIndex, foundEntryIds } from '../../engine/offlineJudge';
import { starsOf } from '../../engine/scoring';
import { fireConfetti } from '../ui/effects';
import { Button, RelevanceBar, SpeakButton, StarToggle, TierBadge, cx } from '../ui/primitives';
import { useToast } from '../ui/Toast';
import type { Judgment, Level, Recommendation, Tier, WordEntry } from '../../types';

function useCountUp(target: number, key: unknown, ms = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // 兜底：页面在后台 / 窗口最小化时 requestAnimationFrame 会暂停，到点直接显示最终分数
    const done = setTimeout(() => {
      cancelAnimationFrame(raf);
      setV(target);
    }, ms + 150);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(done);
    };
  }, [target, key, ms]);
  return v;
}

function useWordCollect(level: Level) {
  const keys = useCollectedKeys(level.id);
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const isOn = (word: string) => keys.has(vocabKey(level.id, word));
  const toggle = async (w: { word: string; pos: string; meaning: string; relevance: number; tier: Tier | 'none' }) => {
    setBusy(w.word);
    try {
      if (isOn(w.word)) {
        await uncollectWord(level.id, w.word);
      } else {
        await collectWord(level, w);
        toast(`已收藏「${w.word}」到本图的视觉生词本`, 'success', 2000);
      }
    } catch (e) {
      toast(`收藏失败：${(e as Error).message}`, 'error');
    } finally {
      setBusy(null);
    }
  };
  return { isOn, toggle, busy };
}

export function ResultPanel({ onCollectLevel }: { onCollectLevel: () => void }) {
  const { session, phase } = useGame();
  const settings = useSettings();
  const ref = useRef<HTMLDivElement>(null);
  const result = session?.result;
  const judgedAt = result?.judgedAt;

  useEffect(() => {
    if (!judgedAt || !result) return;
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (settings.confetti && result.score.passed) fireConfetti(result.score.total >= 90 ? 2 : 1);
    // 只在新一次判卷时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [judgedAt]);

  if (phase !== 'result' || !session || !result) return null;
  return (
    <div ref={ref} className="scroll-mt-4">
      <ResultBody level={session.level} onCollectLevel={onCollectLevel} />
    </div>
  );
}

function ResultBody({ level, onCollectLevel }: { level: Level; onCollectLevel: () => void }) {
  const { session, extras } = useGame();
  const settings = useSettings();
  const stored = useStoredLevel(level.id);
  const collect = useWordCollect(level);
  const result = session!.result!;
  const sc = result.score;
  const shown = useCountUp(sc.total, result.judgedAt);
  const stars = starsOf(sc.total);

  const rows = useMemo(
    () =>
      result.judgments
        .map((j, i) => ({ j, w: sc.weights[i] }))
        .sort((a, b) => b.w - a.w || b.j.relevance - a.j.relevance),
    [result, sc.weights],
  );

  const title = sc.passed
    ? sc.total >= 95
      ? '🏆 完美通关！'
      : sc.total >= 80
        ? '🎉 漂亮！闯关成功'
        : '✅ 闯关成功！'
    : sc.nValid === 0
      ? '😅 还没有达标词'
      : `💪 还差 ${Number.isInteger(sc.missingToPass) ? sc.missingToPass : sc.missingToPass.toFixed(1)} 个达标词就及格了`;

  const providerLabel = PROVIDERS[settings.provider]?.label ?? 'AI';

  return (
    <section className="card overflow-hidden">
      {/* ---- 分数横幅 ---- */}
      <div
        className={cx(
          'flex flex-wrap items-center justify-between gap-4 px-5 py-4 text-white',
          sc.passed ? 'bg-gradient-to-r from-emerald-500 to-teal-600' : 'bg-gradient-to-r from-amber-500 to-orange-500',
        )}
      >
        <div>
          <h2 className="text-xl font-extrabold sm:text-2xl">{title}</h2>
          <p className="mt-0.5 text-sm text-white/90">
            有效达标词 {fmtN(sc.nValid)} / 及格 {sc.nPass} / 满分目标 {sc.nFull} · 共写 {result.judgments.length} 个词
            {sc.typoCount > 0 && ` · ${sc.typoCount} 个轻微拼错按半个计`}
          </p>
          <p className="mt-1 text-lg tracking-widest" aria-label={`${stars} 星`}>
            {'★'.repeat(stars)}
            <span className="text-white/35">{'★'.repeat(3 - stars)}</span>
          </p>
        </div>
        <div className="text-right">
          <div className="text-5xl font-black tabular-nums leading-none sm:text-6xl">{shown}</div>
          <div className="text-xs text-white/85">/ 100 分</div>
        </div>
      </div>

      <div className="space-y-5 p-4 sm:p-5">
        {/* ---- 判卷方式说明 ---- */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={cx('rounded-full px-2.5 py-1 font-semibold', result.mode === 'ai' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600')}>
            {result.mode === 'ai' ? `🤖 AI 判卷（${providerLabel}）· 分数由前端公式计算` : '📴 离线判卷（本关词库 + 编辑距离纠错）'}
          </span>
          {!!result.learned?.length && (
            <span className="rounded-full bg-violet-100 px-2.5 py-1 font-semibold text-violet-700" title={result.learned.map((w) => w.word).join(', ')}>
              🧠 AI 认识了 {result.learned.length} 个词库外的新词，已沉淀进本关词库（以后离线也认得）
            </span>
          )}
          {extras.length > 0 && result.mode === 'offline' && (
            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-600">本关词库含 {extras.length} 个 AI 沉淀词</span>
          )}
        </div>
        {result.fallbackReason && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">⚠️ {result.fallbackReason}</p>}

        {/* ---- 公式拆解 ---- */}
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-[280px] flex-1 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <h4 className="mb-2 text-sm font-bold text-slate-700">🧮 计分公式拆解（{sc.case === 'A' ? '情况 A：未达及格词数，按比例给分' : '情况 B：已及格，60 + 超额分 + 质量分'}）</h4>
            <ol className="space-y-1 text-[13px] leading-relaxed text-slate-700">
              {sc.breakdown.map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">{i + 1}</span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
            <ScoreTrack nValid={sc.nValid} nPass={sc.nPass} nFull={sc.nFull} />
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto">
            {stored ? (
              <Button size="lg" variant="secondary" onClick={onCollectLevel} title="修改所在文件夹">
                ⭐ 已在关卡库「{stored.folder}」
              </Button>
            ) : (
              <Button size="lg" variant="warning" onClick={onCollectLevel}>
                ⭐ 收藏本关到关卡库
              </Button>
            )}
            <p className="max-w-[220px] text-xs text-slate-500">改一下顶部的“及格词数”，分数会按新要求立即重算。</p>
          </div>
        </div>

        {/* ---- 逐词评析 ---- */}
        <div>
          <h4 className="mb-2 text-sm font-bold text-slate-700">📋 逐词评析（点「☆ 收藏到本图」存进视觉生词本）</h4>
          <div className="grid gap-2">
            {rows.map(({ j, w }) => (
              <EvalRow key={j.input} j={j} weight={w} unit={sc.unitScore} collect={collect} />
            ))}
          </div>
        </div>

        {/* ---- 拓展词 ---- */}
        <Recommendations recs={result.recommendations} collect={collect} mode={result.mode} />

        {/* ---- 完整词库 ---- */}
        <FullVocab level={level} judgments={result.judgments} />
      </div>
    </section>
  );
}

const fmtN = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

function ScoreTrack({ nValid, nPass, nFull }: { nValid: number; nPass: number; nFull: number }) {
  const max = Math.max(nFull, nValid, 1);
  const pct = (x: number) => `${Math.min(100, (x / max) * 100)}%`;
  return (
    <div className="mt-4">
      <div className="relative h-3 rounded-full bg-slate-200">
        <div className={cx('h-3 rounded-full transition-all duration-700', nValid >= nPass ? 'bg-emerald-500' : 'bg-amber-500')} style={{ width: pct(nValid) }} />
        <div className="absolute -top-1 h-5 w-0.5 bg-slate-700" style={{ left: pct(nPass) }} title="及格线" />
        <div className="absolute -top-1 h-5 w-0.5 bg-indigo-600" style={{ left: `calc(${pct(nFull)} - 2px)` }} title="满分目标" />
      </div>
      <div className="relative mt-1 h-4 text-[11px] text-slate-500">
        <span className="absolute -translate-x-1/2" style={{ left: pct(nPass) }}>
          及格 {nPass}
        </span>
        <span className="absolute -translate-x-full text-indigo-600" style={{ left: pct(nFull) }}>
          满分 {nFull}
        </span>
      </div>
    </div>
  );
}

type CollectApi = ReturnType<typeof useWordCollect>;

function EvalRow({ j, weight, unit, collect }: { j: Judgment; weight: number; unit: number; collect: CollectApi }) {
  const border = weight === 1 ? 'border-l-emerald-500' : weight === 0.5 ? 'border-l-pink-500' : j.tier === 'weak' ? 'border-l-amber-400' : 'border-l-slate-300';
  const canCollect = j.status !== 'invalid' && !!j.meaning && /^[a-zA-Z]/.test(j.word);
  return (
    <div className={cx('grid grid-cols-1 items-center gap-x-4 gap-y-1.5 rounded-lg border-l-4 bg-slate-50 px-3 py-2.5 sm:grid-cols-[minmax(150px,1.1fr)_minmax(140px,1.2fr)_150px_88px_auto]', border, weight === 0 && 'opacity-80')}>
      <div className="flex min-w-0 items-center gap-1.5">
        {/* 拼错：主显示正确拼写 + 划掉原词；其余：主显示玩家原词，原形不同时小字标出 */}
        <span className="truncate font-bold text-slate-800">{j.status === 'typo' ? j.word : j.input}</span>
        {j.word && /^[a-zA-Z]/.test(j.word) && <SpeakButton text={j.word} />}
        {j.status === 'typo' && <span className="truncate text-xs text-pink-600 line-through">{j.input}</span>}
        {j.status !== 'typo' && j.word && j.word.toLowerCase() !== j.input.trim().toLowerCase() && (
          <span className="truncate text-xs text-slate-400" title="词库中的标准写法">
            → {j.word}
          </span>
        )}
      </div>
      <div className="min-w-0 text-[13px]">
        <div className="flex flex-wrap items-center gap-1.5">
          <TierBadge tier={j.tier} status={j.status} />
          {j.status === 'typo' && <span className="rounded-md bg-pink-100 px-1.5 py-0.5 text-[11px] font-bold text-pink-700">拼写</span>}
          {j.pos && <span className="text-slate-400">{j.pos}</span>}
          <span className="text-slate-700">{j.meaning}</span>
        </div>
        {j.note && <div className="mt-0.5 text-xs text-slate-500">{j.note}</div>}
      </div>
      <RelevanceBar value={j.relevance} />
      <div className={cx('text-right text-sm font-bold tabular-nums', weight > 0 ? 'text-emerald-600' : 'text-slate-400')}>
        {weight > 0 ? `+${(weight * unit).toFixed(1)}` : '0'} 分{weight === 0.5 && <span className="block text-[10px] font-normal">（×0.5）</span>}
      </div>
      <div className="justify-self-end">
        {canCollect && <StarToggle on={collect.isOn(j.word)} busy={collect.busy === j.word} onClick={() => collect.toggle({ word: j.word, pos: j.pos, meaning: j.meaning, relevance: j.relevance, tier: j.tier })} />}
      </div>
    </div>
  );
}

function Recommendations({ recs, collect, mode }: { recs: Recommendation[]; collect: CollectApi; mode: 'ai' | 'offline' }) {
  if (!recs.length) return null;
  const groups: [string, Recommendation[], string][] = [
    ['🧱 基础核心词', recs.filter((r) => r.tier === 'core'), 'ring-emerald-200 bg-emerald-50/60'],
    ['🚀 高阶描写词', recs.filter((r) => r.tier !== 'core'), 'ring-indigo-200 bg-indigo-50/60'],
  ];
  return (
    <div>
      <h4 className="mb-2 text-sm font-bold text-slate-700">
        💎 本关高分拓展词汇（你没写到的高关联词{mode === 'ai' ? '，由 AI 动态推荐' : '，来自本关词库'}）
      </h4>
      <div className="space-y-3">
        {groups.map(
          ([label, list, cls]) =>
            list.length > 0 && (
              <div key={label}>
                <div className="mb-1.5 text-xs font-semibold text-slate-500">{label}</div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
                  {list.map((r) => (
                    <div key={r.word} className={cx('flex flex-col gap-1.5 rounded-xl p-3 ring-1', cls)}>
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate font-bold text-slate-800">{r.word}</span>
                        <SpeakButton text={r.word} />
                      </div>
                      <div className="text-[13px] text-slate-600">
                        <span className="text-slate-400">{r.pos}</span> {r.meaning}
                      </div>
                      <RelevanceBar value={r.relevance} />
                      <StarToggle on={collect.isOn(r.word)} busy={collect.busy === r.word} onClick={() => collect.toggle(r)} />
                    </div>
                  ))}
                </div>
              </div>
            ),
        )}
      </div>
    </div>
  );
}

function FullVocab({ level, judgments }: { level: Level; judgments: Judgment[] }) {
  const { extras } = useGame();
  const found = useMemo(() => foundEntryIds(buildIndex(level, extras), judgments), [level, extras, judgments]);
  const index = useMemo(() => buildIndex(level, extras), [level, extras]);
  const cols: [string, WordEntry[], string][] = [
    ['核心名词', level.coreWords, 'text-emerald-700'],
    ['高阶描写', level.advWords, 'text-indigo-700'],
    ['弱联想（不计分）', level.weakWords, 'text-amber-700'],
  ];
  const learned = extras.filter((w) => index.entries.some((ie) => ie.source === 'learned' && ie.entry.word === w.word));
  const total = index.entries.length;
  const hit = index.entries.filter((ie) => found.has(ie.id)).length;
  return (
    <details className="group rounded-xl bg-slate-50 ring-1 ring-slate-200">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-bold text-slate-700">
        📖 揭晓本关完整词库（共 {total} 词，你命中 {hit} 个）<span className="ml-1 text-xs font-normal text-slate-400 group-open:hidden">点击展开</span>
      </summary>
      <div className="grid gap-4 px-4 pb-4 md:grid-cols-3">
        {cols.map(([label, list, cls]) => (
          <div key={label}>
            <div className={cx('mb-1.5 text-xs font-bold', cls)}>
              {label}（{list.length}）
            </div>
            <ul className="space-y-0.5 text-[13px]">
              {list.map((w) => {
                const ok = found.has(index.entries.find((ie) => ie.entry === w)?.id ?? '');
                return (
                  <li key={w.word} className={cx('flex items-center gap-1.5', ok ? 'font-semibold text-emerald-700' : 'text-slate-600')}>
                    <span className="w-4">{ok ? '✓' : '·'}</span>
                    <span>{w.word}</span>
                    <span className="truncate text-xs text-slate-400">
                      {w.meaning} {w.relevance}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {learned.length > 0 && (
          <div className="md:col-span-3">
            <div className="mb-1.5 text-xs font-bold text-violet-700">🧠 AI 沉淀词（{learned.length}）</div>
            <div className="flex flex-wrap gap-1.5 text-[13px]">
              {learned.map((w) => (
                <span key={w.word} className="rounded-md bg-violet-50 px-2 py-0.5 text-violet-800 ring-1 ring-violet-200">
                  {w.word} <span className="text-xs text-violet-500">{w.meaning}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
