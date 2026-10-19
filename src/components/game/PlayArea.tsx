// ============================================================
// 主游戏工作台：左侧场景图卡片 + 右侧单词输入卡片
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../game/GameContext';
import { useImageSrc } from '../../services/imageStore';
import { useSettings } from '../../services/settings';
import { Lightbox } from '../ui/effects';
import { Button, Spinner, cx } from '../ui/primitives';
import { useToast } from '../ui/Toast';
import type { Judgment, Level } from '../../types';

const SOURCE_BADGE: Record<Level['source'], [string, string]> = {
  seed: ['📦 内置关卡', 'bg-slate-900/70 text-white'],
  ai: ['✨ AI 搜图关卡', 'bg-emerald-600/90 text-white'],
  custom: ['🎨 自建关卡', 'bg-violet-600/90 text-white'],
};

export function SceneImage({ level, className, onZoom }: { level: Pick<Level, 'imageId' | 'imageUrl' | 'title'>; className?: string; onZoom?: () => void }) {
  const src = useImageSrc(level);
  // 按 src 记录加载结果（不用 effect 在切图时重置：图片走缓存时 onLoad 可能早于 effect 触发，
  // 会被错误地重置回“加载中”而一直透明）
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [errorSrc, setErrorSrc] = useState<string | null>(null);
  const state: 'loading' | 'ok' | 'error' = !src ? 'loading' : loadedSrc === src ? 'ok' : errorSrc === src ? 'error' : 'loading';
  const setState = (s: 'ok' | 'error') => (s === 'ok' ? setLoadedSrc(src ?? null) : setErrorSrc(src ?? null));
  return (
    <div className={cx('relative overflow-hidden bg-slate-900', className)}>
      {src && <img src={src} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl" />}
      {src && (
        <img
          src={src}
          alt={level.title}
          ref={(el) => {
            // 已经在缓存里加载完的图片，挂载时直接标记为成功
            if (el?.complete && el.naturalWidth > 0 && loadedSrc !== src) setLoadedSrc(src);
          }}
          onLoad={() => setState('ok')}
          onError={() => setState('error')}
          onClick={onZoom}
          className={cx('relative h-full w-full object-contain transition-opacity duration-500', state === 'ok' ? 'opacity-100' : 'opacity-0', onZoom && 'cursor-zoom-in')}
        />
      )}
      {state === 'loading' && <div className="absolute inset-0 animate-pulse bg-slate-700/40" />}
      {state === 'error' && (
        <div className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-slate-200">
          图片加载失败
          <br />
          （远程图库可能需要网络代理）
        </div>
      )}
    </div>
  );
}

export function SceneCard() {
  const { session } = useGame();
  const [zoom, setZoom] = useState(false);
  const level = session?.level;
  const src = useImageSrc(level);
  if (!level) return <div className="aspect-[3/2] animate-pulse rounded-2xl bg-slate-200" />;
  const [badge, badgeCls] = SOURCE_BADGE[level.source];
  const total = level.coreWords.length + level.advWords.length + level.weakWords.length;
  const c = level.credit;
  return (
    <section className="card p-3 sm:p-4">
      <div className="relative">
        <SceneImage level={level} onZoom={() => setZoom(true)} className="aspect-[3/2] rounded-xl" />
        <span className={cx('absolute left-2 top-2 rounded-md px-2 py-0.5 text-xs font-semibold backdrop-blur', badgeCls)}>{badge}</span>
        <button
          type="button"
          onClick={() => setZoom(true)}
          className="absolute bottom-2 right-2 cursor-pointer rounded-lg bg-black/55 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur hover:bg-black/75"
        >
          🔍 放大看细节
        </button>
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-slate-800">{level.title}</h2>
          {level.titleEn && <p className="truncate text-xs text-slate-500">{level.titleEn}</p>}
        </div>
        <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600" title="核心 / 高阶 / 联想">
          词库 {total} 词（{level.coreWords.length}/{level.advWords.length}/{level.weakWords.length}）
        </span>
      </div>
      {c && (
        <p className="mt-1.5 truncate text-[11px] text-slate-400" title={`${c.title ?? ''} — ${c.author ?? ''}`}>
          📷 {c.author || '未知作者'} · {c.provider} · {c.license}
          {c.pageUrl && (
            <a href={c.pageUrl} target="_blank" rel="noreferrer" className="ml-1 text-indigo-500 hover:underline">
              原图 ↗
            </a>
          )}
        </p>
      )}
      {zoom && src && <Lightbox src={src} alt={level.title} onClose={() => setZoom(false)} />}
    </section>
  );
}

const STATUS_TAG: Record<string, string> = {
  correct: 'bg-emerald-100 text-emerald-800 ring-emerald-300',
  typo: 'bg-pink-100 text-pink-800 ring-pink-300',
  duplicate: 'bg-slate-100 text-slate-500 ring-slate-300 line-through',
  unknown: 'bg-slate-100 text-slate-600 ring-slate-300',
  invalid: 'bg-rose-100 text-rose-700 ring-rose-300',
};

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function InputCard() {
  const { session, phase, addWord, removeWord, takeHint, submit, replay, nextRandom } = useGame();
  const settings = useSettings();
  const toast = useToast();
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [now, setNow] = useState(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const playing = phase === 'playing';

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [playing]);

  useEffect(() => {
    if (playing) inputRef.current?.focus();
  }, [playing, session?.level.id]);

  if (!session) return <div className="h-80 animate-pulse rounded-2xl bg-slate-200" />;
  const { words, nPass, hints, result } = session;
  const judgedBy = new Map<string, Judgment>((result?.judgments ?? []).map((j) => [j.input, j]));
  const hintsLeft = settings.hintsPerLevel - hints.length;
  const elapsed = Math.max(0, Math.round(((result?.judgedAt ?? now) - session.startedAt) / 1000));

  const commit = (raw = text) => {
    const parts = raw.split(/[,，;；\n]+/).map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return;
    const errors: string[] = [];
    for (const p of parts) {
      const e = addWord(p);
      if (e) errors.push(e);
    }
    if (errors.length) {
      setErr(errors[0]);
      setShake((x) => x + 1);
    } else setErr(null);
    setText('');
  };

  const onSubmit = async () => {
    if (!words.length) return;
    if (text.trim()) commit();
    const r = await submit();
    if (r?.fallbackReason) toast(r.fallbackReason, 'warn', 7000);
  };

  const onHint = () => {
    const h = takeHint();
    if (!h) toast(hintsLeft <= 0 ? '本关提示次数已用完' : '核心词都写出来了，没有可提示的词', 'info');
  };

  return (
    <section className="card flex flex-col p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-bold text-slate-800">✍️ 观察画面，写出英文单词</h3>
        {settings.showTimer && (
          <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600" title="本局用时">
            ⏱ {fmtTime(elapsed)}
          </span>
        )}
      </div>

      <div key={shake} className={cx('flex gap-2', shake > 0 && err && 'animate-shake')}>
        <input
          ref={inputRef}
          value={text}
          disabled={!playing}
          onChange={(e) => {
            setText(e.target.value);
            if (err) setErr(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void onSubmit();
            } else if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Backspace' && !text && words.length) {
              removeWord(words.length - 1);
            }
          }}
          onPaste={(e) => {
            const t = e.clipboardData.getData('text');
            if (/[,，;；\n]/.test(t)) {
              e.preventDefault();
              commit(t);
            }
          }}
          placeholder={playing ? '输入英文单词或短语，回车添加…' : '本局已结束'}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-xl border-2 border-slate-300 px-3.5 py-2.5 text-base outline-none transition focus:border-indigo-500 disabled:bg-slate-100"
          aria-label="输入英文单词"
        />
        <Button variant="primary" size="lg" onClick={() => commit()} disabled={!playing || !text.trim()}>
          添加
        </Button>
      </div>
      <p className={cx('mt-1.5 min-h-[18px] text-xs', err ? 'font-semibold text-rose-600' : 'text-slate-400')}>
        {err ?? 'Enter 添加 · 逗号可一次加多个 · 空输入时 Backspace 删除最后一个 · Ctrl+Enter 提交'}
      </p>

      <div className="mt-2">
        <div className="mb-1 flex justify-between text-xs text-slate-600">
          <span>
            已写 <b className="text-slate-800">{words.length}</b> 个
          </span>
          <span>
            及格要求 <b className="text-slate-800">{nPass}</b> 个达标词
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className={cx('h-2 rounded-full transition-all duration-500', words.length >= nPass ? 'bg-emerald-500' : 'bg-indigo-500')}
            style={{ width: `${Math.min(100, (words.length / Math.max(1, nPass)) * 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-3 flex min-h-[120px] flex-1 flex-wrap content-start gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
        {!words.length && <span className="m-auto text-sm text-slate-400">看看图里有什么？名词、动作、形容词都可以 ✨</span>}
        {words.map((w, i) => {
          const j = judgedBy.get(w);
          return (
            <span
              key={w}
              className={cx(
                'animate-pop inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ring-1',
                j ? STATUS_TAG[j.status] : 'bg-indigo-100 text-indigo-800 ring-indigo-200',
              )}
              title={j ? `${j.word} · ${j.meaning || ''} · ${j.relevance}%` : undefined}
            >
              {w}
              {playing && (
                <button type="button" onClick={() => removeWord(i)} className="cursor-pointer font-bold text-indigo-400 hover:text-rose-600" aria-label={`删除 ${w}`}>
                  ×
                </button>
              )}
            </span>
          );
        })}
      </div>

      {(hints.length > 0 || playing) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {playing && settings.hintsPerLevel > 0 && (
            <Button size="sm" onClick={onHint} disabled={hintsLeft <= 0} title="揭示一个你还没写出的核心词：中文 + 首字母">
              💡 提示（剩 {Math.max(0, hintsLeft)} 次）
            </Button>
          )}
          {hints.map((h) => (
            <span key={h.word} className="rounded-lg bg-yellow-50 px-2 py-1 text-xs text-yellow-900 ring-1 ring-yellow-200">
              {h.meaning} <span className="text-yellow-700/70">{h.pos}</span> · <b className="font-mono tracking-wider">{phase === 'result' ? h.word : h.mask}</b>
            </span>
          ))}
        </div>
      )}

      <div className="mt-4">
        {phase === 'result' ? (
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" onClick={replay}>
              🔁 再玩一次
            </Button>
            <Button size="lg" variant="primary" onClick={() => void nextRandom()}>
              ➡️ 随机下一关
            </Button>
          </div>
        ) : (
          <Button size="lg" variant="success" className="w-full py-3" onClick={() => void onSubmit()} disabled={!words.length || phase === 'judging'}>
            {phase === 'judging' ? (
              <>
                <Spinner /> {settings.aiEnabled ? 'AI 判卷中…' : '判卷中…'}
              </>
            ) : (
              '🎯 提交判卷'
            )}
          </Button>
        )}
      </div>
    </section>
  );
}
