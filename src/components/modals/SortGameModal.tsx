// ============================================================
// 🎯 场景分拣（关卡复习）：3~5 张通关过的场景照片 + 传送带上的英文单词，
// 在倒计时内把单词扔回它所属的照片（点照片 / 按数字键 / 拖拽）。全程不出中文，结算复盘时才显示。
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting, setSetting } from '../../services/db';
import { scheduleCloudSync } from '../../services/cloudConfig';
import { SEED_BY_ID } from '../../data/seedLevels';
import { speak } from '../../services/tts';
import {
  MIN_PASSED_LEVELS,
  SORT_STAGES,
  buildQueue,
  emptyProgress,
  isStageUnlocked,
  pickScenes,
  recordResult,
  summarize,
  uniqueWords,
  type SortAnswer,
  type SortProgress,
  type SortResult,
  type SortStage,
  type SortWord,
} from '../../engine/sortGame';
import type { Level } from '../../types';
import { SceneImage } from '../game/PlayArea';
import { Button, Modal, SpeakButton, cx } from '../ui/primitives';

const PROGRESS_KEY = 'sortGame';
const SPEAK_KEY = 'picword.sort.speak';
const speakOn = () => {
  try {
    return localStorage.getItem(SPEAK_KEY) !== '0';
  } catch {
    return true;
  }
};

/** 闯关及格过的关卡（内置关卡 + 关卡库里的），去重 */
function usePassedLevels(): Level[] | undefined {
  return useLiveQuery(async () => {
    const ids = [...new Set((await db.history.toArray()).filter((h) => h.passed).map((h) => h.levelId))];
    const out: Level[] = [];
    for (const id of ids) {
      const l = SEED_BY_ID.get(id) ?? (await db.levels.get(id));
      if (l) out.push(l);
    }
    return out;
  }, []);
}

interface Round {
  id: number;
  stage: SortStage;
  scenes: Level[];
  queue: SortWord[];
}

function Menu({ passed, progress, onStart }: { passed: Level[]; progress: SortProgress; onStart: (s: SortStage) => void }) {
  const [speakEnabled, setSpeakEnabled] = useState(speakOn);
  if (passed.length < MIN_PASSED_LEVELS) {
    return (
      <div className="py-10 text-center text-slate-600">
        <div className="text-5xl">🔒</div>
        <p className="mt-3 text-base font-semibold text-slate-800">
          已通关 {passed.length} / {MIN_PASSED_LEVELS} 关
        </p>
        <p className="mt-1 text-sm">再闯关及格 {MIN_PASSED_LEVELS - passed.length} 个不同的场景，就能解锁场景分拣复习。</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        从你通关过的 {passed.length} 个场景里挑出几张照片，传送带上滑出英文单词，<b>在倒计时内把它扔回所属的照片</b>：点照片、按数字键或直接拖过去都行。全程不显示中文，练“看到单词就想到画面”。
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {SORT_STAGES.map((s) => {
          const unlocked = isStageUnlocked(progress, s.stage) && passed.length >= s.scenes;
          const best = progress.best[s.stage];
          return (
            <div key={s.stage} className={cx('rounded-xl p-4 ring-1', unlocked ? 'bg-white ring-slate-200' : 'bg-slate-50 ring-slate-200 opacity-60')}>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">第 {s.stage} 阶</span>
                <span className="text-amber-500">{'★'.repeat(best?.stars ?? 0) + '☆'.repeat(3 - (best?.stars ?? 0))}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {s.scenes} 张照片 · {s.words} 个词 · 每词 {s.wordMs / 1000} 秒
              </p>
              <p className="mt-1 text-xs text-slate-500">{best ? `最高分 ${best.score}` : '还没玩过'}</p>
              <Button className="mt-3 w-full" variant={unlocked ? 'primary' : 'secondary'} disabled={!unlocked} onClick={() => onStart(s)}>
                {unlocked ? '▶ 开始' : passed.length < s.scenes ? `需通关 ${s.scenes} 关` : '上一阶拿 ⭐⭐ 解锁'}
              </Button>
            </div>
          );
        })}
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={speakEnabled}
          onChange={(e) => {
            setSpeakEnabled(e.target.checked);
            try {
              localStorage.setItem(SPEAK_KEY, e.target.checked ? '1' : '0');
            } catch {
              /* ignore */
            }
          }}
          className="accent-indigo-600"
        />
        出词时朗读单词（练“听音 → 画面”）
      </label>
    </div>
  );
}

function Play({ round, onDone }: { round: Round; onDone: (answers: SortAnswer[]) => void }) {
  const { stage, scenes, queue } = round;
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<SortAnswer[]>([]);
  const [flash, setFlash] = useState<{ chosen: number | null; correct: number; ok: boolean; key: number } | null>(null);
  const [now, setNow] = useState(() => performance.now());
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const startRef = useRef(performance.now());
  const doneRef = useRef(false);
  const current = queue[idx];

  const combo = useMemo(() => {
    let c = 0;
    for (let i = answers.length - 1; i >= 0 && answers[i].outcome === 'correct'; i--) c++;
    return c;
  }, [answers]);
  const score = useMemo(() => summarize(answers, stage.wordMs).total, [answers, stage.wordMs]);

  const answer = useCallback(
    (chosen: number | null) => {
      if (!current || doneRef.current) return;
      const ms = Math.round(performance.now() - startRef.current);
      const outcome: SortAnswer['outcome'] = chosen === null ? 'miss' : chosen === current.scene ? 'correct' : 'wrong';
      const next = [...answers, { word: current, outcome, chosen, ms }];
      setAnswers(next);
      setFlash({ chosen, correct: current.scene, ok: outcome === 'correct', key: next.length });
      startRef.current = performance.now();
      if (idx + 1 >= queue.length) {
        doneRef.current = true;
        setTimeout(() => onDone(next), 500);
      }
      setIdx((i) => i + 1);
    },
    [answers, current, idx, queue.length, onDone],
  );

  // 倒计时：超时算漏掉
  useEffect(() => {
    const t = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (current && now - startRef.current > stage.wordMs) answer(null);
  }, [now, current, stage.wordMs, answer]);

  // 新词出现：朗读
  useEffect(() => {
    if (current && speakOn()) speak(current.word);
  }, [current]);

  // 数字键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= scenes.length) answer(n - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answer, scenes.length]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 450);
    return () => clearTimeout(t);
  }, [flash]);

  const left = current ? Math.max(0, 1 - (now - startRef.current) / stage.wordMs) : 0;

  return (
    <div className="select-none space-y-3" style={{ touchAction: drag ? 'none' : undefined }}>
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          {Math.min(idx + 1, queue.length)} / {queue.length}
        </span>
        <span className="font-bold tabular-nums text-indigo-700">{score} 分</span>
        <span className={cx('tabular-nums', combo >= 3 ? 'font-bold text-orange-500' : '')}>{combo >= 2 ? `🔥 连击 ×${combo}` : ' '}</span>
      </div>

      <div className={cx('grid gap-2', scenes.length <= 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3')}>
        {scenes.map((l, i) => {
          const isCorrect = flash && flash.correct === i;
          const isWrong = flash && !flash.ok && flash.chosen === i;
          return (
            <button
              key={`${l.id}-${isWrong ? flash?.key : ''}`}
              type="button"
              data-scene={i}
              onClick={() => answer(i)}
              className={cx(
                'relative cursor-pointer overflow-hidden rounded-xl ring-4 transition',
                isCorrect ? 'ring-emerald-400' : isWrong ? 'animate-shake ring-rose-500' : 'ring-transparent hover:ring-indigo-300',
              )}
            >
              <SceneImage level={l} fit="cover" className={cx('pointer-events-none', scenes.length <= 3 ? 'aspect-[3/4] sm:aspect-[4/3]' : 'aspect-[4/3]')} />
              <span className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-xs font-bold text-white">{i + 1}</span>
            </button>
          );
        })}
      </div>

      {/* 传送带 */}
      <div className="relative overflow-hidden rounded-xl bg-slate-800 p-3">
        <div className="flex items-center gap-3">
          {current && (
            <div
              key={idx}
              onPointerDown={(e) => {
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                setDrag({ x: e.clientX, y: e.clientY });
              }}
              onPointerMove={(e) => drag && setDrag({ x: e.clientX, y: e.clientY })}
              onPointerUp={(e) => {
                if (!drag) return;
                setDrag(null);
                const el = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n instanceof HTMLElement && n.dataset.scene !== undefined) as HTMLElement | undefined;
                if (el) answer(Number(el.dataset.scene));
              }}
              className="animate-pop relative shrink-0 cursor-grab touch-none rounded-lg bg-white px-4 py-2 text-xl font-extrabold text-slate-800 shadow-lg"
              style={drag ? { position: 'fixed', left: drag.x, top: drag.y, transform: 'translate(-50%, -50%) scale(1.05)', zIndex: 70 } : undefined}
            >
              {current.word}
              <div className="absolute inset-x-1 -bottom-1 h-1 overflow-hidden rounded bg-slate-200">
                <div className={cx('h-1 rounded', left < 0.3 ? 'bg-rose-500' : 'bg-emerald-500')} style={{ width: `${left * 100}%` }} />
              </div>
            </div>
          )}
          {queue.slice(idx + 1, idx + 4).map((w, i) => (
            <span key={idx + 1 + i} className="shrink-0 rounded-md bg-slate-600 px-2.5 py-1 text-sm text-slate-200" style={{ opacity: 0.8 - i * 0.25 }}>
              {w.word}
            </span>
          ))}
        </div>
      </div>
      <p className="text-center text-xs text-slate-400">点照片 / 按 1–{scenes.length} / 把单词拖到照片上</p>
    </div>
  );
}

function ResultView({ round, answers, result, newlyUnlocked, canNext, onAgain, onNext, onMenu }: {
  round: Round;
  answers: SortAnswer[];
  result: SortResult;
  newlyUnlocked: boolean;
  canNext: boolean;
  onAgain: () => void;
  onNext: () => void;
  onMenu: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="text-4xl text-amber-500">{'★'.repeat(result.stars) + '☆'.repeat(3 - result.stars)}</div>
        <p className="mt-1 text-2xl font-extrabold text-slate-800">{result.total} 分</p>
        <p className={cx('text-sm font-semibold', result.passed ? 'text-emerald-600' : 'text-rose-600')}>
          {result.passed ? `第 ${round.stage.stage} 阶复习过关！` : '还差一点：正确率要 ≥ 80%，漏掉不超过 3 个'}
          {newlyUnlocked && ' 🎉 解锁了下一阶'}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-4">
        {[
          ['正确率', `${Math.round(result.accuracy * 100)}%`],
          ['平均反应', `${(result.avgMs / 1000).toFixed(1)} 秒`],
          ['最高连击', `×${result.maxCombo}`],
          ['对 / 错 / 漏', `${result.correct} / ${result.wrong} / ${result.missed}`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
            <div className="text-xs text-slate-500">{k}</div>
            <div className="font-bold text-slate-800">{v}</div>
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {round.scenes.map((l, i) => {
          const list = answers.filter((a) => a.word.scene === i);
          return (
            <div key={l.id} className="overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-200">
              <div className="relative">
                <SceneImage level={l} fit="cover" className="aspect-[2/1] w-full" />
                <span className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-1.5 pt-6 text-sm font-bold text-white">
                  {i + 1} 号 · {l.title}
                </span>
              </div>
              <ul className="divide-y divide-slate-200/70 px-3 py-1 text-sm">
                {list.map((a) => (
                  <li key={a.word.word} className="py-1.5">
                    <div className="flex items-start gap-1.5">
                      <span className="shrink-0">{a.outcome === 'correct' ? '✅' : a.outcome === 'wrong' ? '❌' : '⏱'}</span>
                      <span className="shrink-0 font-semibold text-slate-800">{a.word.word}</span>
                      <SpeakButton text={a.word.word} />
                      <span className="min-w-0 flex-1 break-words text-slate-600">
                        {a.word.pos} {a.word.meaning}
                      </span>
                    </div>
                    {a.outcome === 'wrong' && a.chosen !== null && (
                      <div className="pl-6 text-xs text-rose-500">↳ 扔进了「{round.scenes[a.chosen]?.title ?? `${a.chosen + 1} 号`}」</div>
                    )}
                    {a.outcome === 'miss' && <div className="pl-6 text-xs text-amber-600">↳ 超时没扔</div>}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={onMenu}>返回</Button>
        <Button variant="primary" onClick={onAgain}>
          🔁 再来一局
        </Button>
        {canNext && (
          <Button variant="success" onClick={onNext}>
            ➡️ 挑战下一阶
          </Button>
        )}
      </div>
    </div>
  );
}

export function SortGameModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const passed = usePassedLevels();
  const [progress, setProgress] = useState<SortProgress>(emptyProgress());
  const [round, setRound] = useState<Round | null>(null);
  const [done, setDone] = useState<{ answers: SortAnswer[]; result: SortResult; newlyUnlocked: boolean; canNext: boolean } | null>(null);
  const roundId = useRef(0);

  useEffect(() => {
    if (open) void getSetting<SortProgress>(PROGRESS_KEY, emptyProgress()).then(setProgress);
  }, [open]);

  const start = (stage: SortStage) => {
    if (!passed) return;
    const scenes = pickScenes(passed, stage.scenes);
    setRound({ id: ++roundId.current, stage, scenes, queue: buildQueue(uniqueWords(scenes), stage.words) });
    setDone(null);
  };

  const finish = async (answers: SortAnswer[]) => {
    if (!round) return;
    const result = summarize(answers, round.stage.wordMs);
    const next = recordResult(progress, round.stage.stage, result);
    const nextStage = SORT_STAGES.find((s) => s.stage === round.stage.stage + 1);
    const newlyUnlocked = !!nextStage && !isStageUnlocked(progress, nextStage.stage) && isStageUnlocked(next, nextStage.stage);
    const canNext = !!nextStage && isStageUnlocked(next, nextStage.stage) && (passed?.length ?? 0) >= nextStage.scenes;
    setProgress(next);
    setDone({ answers, result, newlyUnlocked, canNext });
    await setSetting(PROGRESS_KEY, next);
    scheduleCloudSync();
  };

  const close = () => {
    setRound(null);
    setDone(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title="🎯 场景分拣" subtitle="关卡复习：把英文单词扔回它所属的照片" width="max-w-4xl">
      {!passed ? null : !round ? (
        <Menu passed={passed} progress={progress} onStart={start} />
      ) : done ? (
        <ResultView
          round={round}
          answers={done.answers}
          result={done.result}
          newlyUnlocked={done.newlyUnlocked}
          canNext={done.canNext}
          onAgain={() => start(round.stage)}
          onNext={() => start(SORT_STAGES.find((s) => s.stage === round.stage.stage + 1) ?? round.stage)}
          onMenu={() => setRound(null)}
        />
      ) : (
        <Play key={round.id} round={round} onDone={(a) => void finish(a)} />
      )}
    </Modal>
  );
}
