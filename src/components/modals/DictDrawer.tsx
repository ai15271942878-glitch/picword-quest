// ============================================================
// 📖 图解词典侧边栏：搜英文 / 中文 / 拼音 → 释义 + 整页图（框出词条位置）
// 不遮挡游戏（电脑上可以边查边玩）；手机上占满屏幕。
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../../game/GameContext';
import { db } from '../../services/db';
import { deleteDict, importDictPack, searchDict, useDictEntries, useDictMeta } from '../../services/dictionary';
import { levelEntries } from '../../engine/offlineJudge';
import { normalizeWord } from '../../engine/morph';
import type { DictEntry, DictPage } from '../../types';
import { Button, Empty, SpeakButton, Spinner, cx } from '../ui/primitives';
import { Lightbox } from '../ui/effects';
import { useDialog } from '../ui/Dialog';
import { useToast } from '../ui/Toast';

function usePage(page: number | undefined): { rec: DictPage | null; url: string | null } {
  const [state, setState] = useState<{ rec: DictPage | null; url: string | null }>({ rec: null, url: null });
  useEffect(() => {
    if (page === undefined) return;
    let url: string | null = null;
    let alive = true;
    db.dictPages.get(page).then((rec) => {
      if (!alive) return;
      url = rec ? URL.createObjectURL(rec.blob) : null;
      setState({ rec: rec ?? null, url });
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [page]);
  return page === undefined ? { rec: null, url: null } : state;
}

function PageView({ entry, onPick }: { entry: DictEntry; onPick: (e: DictEntry) => void }) {
  const { rec, url } = usePage(entry.page);
  const [zoom, setZoom] = useState(false);
  const entries = useDictEntries() ?? [];
  const samePage = useMemo(() => entries.filter((e) => e.page === entry.page && e.id !== entry.id), [entries, entry]);
  const b = entry.box;
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
        <span className="truncate">{rec?.title ?? ''}</span>
        <span className="shrink-0">第 {entry.page} 页 · 点图放大</span>
      </div>
      {!url ? (
        <div className="aspect-[3/4] animate-pulse rounded-xl bg-slate-200" />
      ) : (
        <div className="relative cursor-zoom-in overflow-hidden rounded-xl ring-1 ring-slate-200" onClick={() => setZoom(true)}>
          <img src={url} alt={`第 ${entry.page} 页`} className="block w-full" />
          {b && (
            <div
              className="pointer-events-none absolute animate-pulse rounded-md ring-4 ring-rose-500/80"
              style={{ left: `${b[0] * 100}%`, top: `${b[1] * 100}%`, width: `${b[2] * 100}%`, height: `${b[3] * 100}%` }}
            />
          )}
        </div>
      )}
      {samePage.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-xs font-semibold text-slate-500">本页还有（{samePage.length}）</div>
          <div className="flex flex-wrap gap-1.5">
            {samePage.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onPick(e)}
                className="cursor-pointer rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-indigo-100 hover:text-indigo-800"
              >
                {e.en} <span className="text-slate-400">{e.zh}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {zoom && url && <Lightbox src={url} alt={`第 ${entry.page} 页`} onClose={() => setZoom(false)} />}
    </div>
  );
}

function ImportBox({ compact }: { compact?: boolean }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setProgress([0, 1]);
    try {
      const meta = await importDictPack(f, f.name, (d, t) => setProgress([d, t]));
      toast(`已导入「${meta.name}」：${meta.pageCount} 页、${meta.entryCount} 个词条`, 'success', 5000);
    } catch (e) {
      const msg = (e as Error).name === 'QuotaExceededError' ? '浏览器存储空间不足，导入失败' : (e as Error).message;
      toast(`导入失败：${msg}`, 'error', 7000);
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };
  return (
    <>
      <input ref={inputRef} type="file" accept=".pwdict,application/octet-stream" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
      {progress ? (
        <div className="w-full">
          <div className="mb-1 flex items-center gap-2 text-xs text-slate-600">
            <Spinner /> 正在导入… {progress[0]} / {progress[1]} 页
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div className="h-2 rounded-full bg-indigo-500 transition-all" style={{ width: `${(progress[0] / Math.max(1, progress[1])) * 100}%` }} />
          </div>
        </div>
      ) : (
        <Button size={compact ? 'xs' : 'md'} variant={compact ? 'secondary' : 'primary'} onClick={() => inputRef.current?.click()}>
          {compact ? '更换词典' : '📥 导入词典包（.pwdict）'}
        </Button>
      )}
    </>
  );
}

export function DictDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const meta = useDictMeta();
  const entries = useDictEntries();
  const { session } = useGame();
  const dialog = useDialog();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<DictEntry | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[role="dialog"]') && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const results = useMemo(() => searchDict(entries ?? [], q), [entries, q]);

  // 本关词库里能在词典中查到的词（搜索框为空时作为快捷入口）
  const levelHits = useMemo(() => {
    if (!session || !entries?.length) return [];
    const byEn = new Map<string, DictEntry>();
    for (const e of entries) {
      const k = normalizeWord(e.en);
      if (!byEn.has(k)) byEn.set(k, e);
    }
    return levelEntries(session.level)
      .map((ie) => byEn.get(ie.id))
      .filter((e): e is DictEntry => !!e);
  }, [session, entries]);

  const levelMeaning = useMemo(() => {
    if (!picked || !session) return null;
    const k = normalizeWord(picked.en);
    return levelEntries(session.level).find((ie) => ie.id === k)?.entry ?? null;
  }, [picked, session]);

  if (!open) return null;

  const remove = async () => {
    if (!(await dialog.confirm('删除本机的图解词典？', { message: '只删除这个浏览器里的词典数据，以后可以重新导入。', danger: true, okText: '删除' }))) return;
    await deleteDict();
    setPicked(null);
    setQ('');
  };

  return createPortal(
    <aside
      aria-label="图解词典"
      className="animate-slide-in fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-slate-200 bg-white shadow-2xl sm:w-[440px]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-bold text-slate-800">📖 图解词典</h2>
          {meta && (
            <p className="truncate text-xs text-slate-500">
              {meta.name} · {meta.pageCount} 页 · {meta.entryCount} 词
            </p>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="关闭词典">
          ✕ 关闭
        </Button>
      </div>

      {meta === undefined ? (
        <div className="grid flex-1 place-items-center">
          <Spinner />
        </div>
      ) : meta === null ? (
        <div className="flex-1 overflow-y-auto px-4">
          <Empty icon="📖" title="还没有导入词典">
            <p className="mb-4">
              导入一个 <b>.pwdict</b> 词典包（由 PDF 图解词典转换而来），之后就能边玩边查：显示中文释义、拼音、发音，并展示单词所在的整页插图。
            </p>
            <p className="mb-4 text-xs text-slate-400">词典只保存在这个浏览器里，不会上传，别人也看不到。</p>
            <ImportBox />
          </Empty>
        </div>
      ) : (
        <>
          <div className="border-b border-slate-100 px-4 py-3">
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPicked(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && results[0] && setPicked(results[0])}
              placeholder="搜英文、中文或拼音，如 jacket / 夹克"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full rounded-xl border-2 border-slate-300 px-3 py-2 outline-none focus:border-indigo-500"
              aria-label="搜索词典"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {picked ? (
              <div>
                {(q || results.length > 0) && (
                  <button type="button" onClick={() => setPicked(null)} className="mb-2 cursor-pointer text-xs text-indigo-600 hover:underline">
                    ← 返回结果
                  </button>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-slate-800">{picked.en}</span>
                  <SpeakButton text={picked.en} size="md" />
                </div>
                <div className="mt-0.5 text-lg text-slate-700">
                  {picked.zh}
                  {picked.py && <span className="ml-2 text-sm text-slate-400">{picked.py}</span>}
                </div>
                {levelMeaning && (
                  <p className="mt-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800">
                    本关词库：{levelMeaning.pos} {levelMeaning.meaning}
                  </p>
                )}
                <PageView key={picked.id} entry={picked} onPick={setPicked} />
              </div>
            ) : q.trim() ? (
              results.length ? (
                <ul className="divide-y divide-slate-100">
                  {results.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => setPicked(e)}
                        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-2 text-left hover:bg-indigo-50"
                      >
                        <span className="min-w-0">
                          <span className="font-semibold text-slate-800">{e.en}</span>
                          <span className="ml-2 text-sm text-slate-600">{e.zh}</span>
                        </span>
                        <span className="shrink-0 text-xs text-slate-400">p.{e.page}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty icon="🔎" title="词典里没找到">
                  换个说法试试（单数 / 原形 / 中文）
                </Empty>
              )
            ) : (
              <div>
                {levelHits.length > 0 ? (
                  <>
                    <div className="mb-2 text-xs font-semibold text-slate-500">本关词库中能查到的词（{levelHits.length}）</div>
                    <div className="flex flex-wrap gap-1.5">
                      {levelHits.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => setPicked(e)}
                          className="cursor-pointer rounded-full bg-indigo-50 px-2.5 py-1 text-sm text-indigo-800 ring-1 ring-indigo-200 hover:bg-indigo-100"
                        >
                          {e.en}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-slate-400">提示：这些词就是本关答案的一部分，想挑战自己就先别点 😉</p>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">输入单词开始查询。</p>
                )}
              </div>
            )}
          </div>
          <div className={cx('flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-2.5')}>
            <ImportBox compact />
            <Button size="xs" variant="ghost" className="text-rose-600" onClick={() => void remove()}>
              删除词典
            </Button>
          </div>
        </>
      )}
    </aside>,
    document.body,
  );
}
