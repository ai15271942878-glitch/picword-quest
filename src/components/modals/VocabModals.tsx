// ============================================================
// 🖼️ 视觉关联生词本（PRD 模块四.1）+ 【新增】📝 间隔复习
// 设计理念：生词不能脱离图片语境单独存在 —— 按关卡图片分组展示
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../services/db';
import { SEED_BY_ID } from '../../data/seedLevels';
import { applyReview, boxLabel, isDue, type ReviewGrade } from '../../services/srs';
import { speak } from '../../services/tts';
import { useGame } from '../../game/GameContext';
import { judgeOffline, maskWord } from '../../engine/offlineJudge';
import { SceneImage } from '../game/PlayArea';
import { Button, Empty, Modal, SpeakButton, TierBadge, cx } from '../ui/primitives';
import { useToast } from '../ui/Toast';
import { useDialog } from '../ui/Dialog';
import type { Level, VocabItem } from '../../types';

type BlurMode = 'none' | 'en' | 'zh';

export function VocabAlbumModal({ open, onClose, onReview }: { open: boolean; onClose: () => void; onReview: () => void }) {
  const items = useLiveQuery(() => db.vocabBook.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const storedLevels = useLiveQuery(() => db.levels.toArray(), []) ?? [];
  const { loadLevel } = useGame();
  const toast = useToast();
  const dialog = useDialog();
  const [blur, setBlur] = useState<BlurMode>('none');
  const [q, setQ] = useState('');

  const now = Date.now();
  const due = items.filter((v) => isDue(v, now)).length;
  const filtered = q.trim() ? items.filter((v) => v.word.toLowerCase().includes(q.trim().toLowerCase()) || v.meaning.includes(q.trim())) : items;

  const groups = useMemo(() => {
    const m = new Map<string, VocabItem[]>();
    for (const v of filtered) {
      const arr = m.get(v.levelId) ?? [];
      arr.push(v);
      m.set(v.levelId, arr);
    }
    return [...m.entries()];
  }, [filtered]);

  const findLevel = (levelId: string): Level | undefined => SEED_BY_ID.get(levelId) ?? storedLevels.find((l) => l.id === levelId);

  const remove = async (v: VocabItem) => {
    await db.vocabBook.delete(v.id!);
    toast(`已删除「${v.word}」`, 'info', 1800);
  };

  const removeGroup = async (levelId: string, title: string, count: number) => {
    if (!(await dialog.confirm(`删除「${title}」下的全部 ${count} 个生词？`, { danger: true, okText: '全部删除' }))) return;
    await db.vocabBook.where('levelId').equals(levelId).delete();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="🖼️ 视觉关联生词本"
      subtitle={`${items.length} 个生词 · ${new Set(items.map((v) => v.levelId)).size} 张场景图 · 生词永远和它出现的那张图绑在一起`}
      actions={
        <Button variant="violet" size="sm" onClick={onReview} disabled={!due} title="间隔复习：看图 + 中文，拼出英文">
          📝 开始复习{due ? `（${due} 个到期）` : '（暂无到期）'}
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 搜索单词或中文…" className="w-52 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
        <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-300">
          {(
            [
              ['none', '👀 全部显示'],
              ['en', '🙈 遮住英文（看图 + 中文默写）'],
              ['zh', '🙈 遮住中文（看图 + 英文忆义）'],
            ] as [BlurMode, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setBlur(k)}
              className={cx('cursor-pointer px-3 py-1.5 text-xs font-semibold transition', blur === k ? 'bg-violet-600 text-white' : 'bg-white text-slate-600 hover:bg-violet-50')}
            >
              {label}
            </button>
          ))}
        </div>
        {blur !== 'none' && <span className="text-xs text-slate-500">鼠标悬停在模糊处即可显形</span>}
      </div>

      {!items.length && (
        <Empty icon="🖼️" title="生词本还是空的">
          判卷后，在逐词评析或拓展词卡片上点「☆ 收藏到本图」，单词就会连同那张场景图一起存进来。
        </Empty>
      )}

      <div className={cx('space-y-4', blur === 'en' && 'blur-en', blur === 'zh' && 'blur-zh')}>
        {groups.map(([levelId, list]) => {
          const first = list[0];
          const level = findLevel(levelId);
          return (
            <div key={levelId} className="grid gap-4 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 md:grid-cols-[230px_1fr]">
              <div>
                <SceneImage level={{ imageId: first.imageId, imageUrl: first.imageUrl, title: first.levelTitle }} className="aspect-[4/3] rounded-lg" />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-bold text-slate-800">{first.levelTitle}</span>
                  <span className="shrink-0 text-xs text-slate-500">{list.length} 词</span>
                </div>
                <div className="mt-1.5 flex gap-1.5">
                  {level && (
                    <Button
                      size="xs"
                      variant="primary"
                      onClick={() => {
                        loadLevel(level, { toast: `重玩「${level.title}」` });
                        onClose();
                      }}
                    >
                      ▶ 重玩此关
                    </Button>
                  )}
                  <Button size="xs" variant="ghost" onClick={() => void removeGroup(levelId, first.levelTitle, list.length)}>
                    🗑 清空
                  </Button>
                </div>
              </div>
              <div className="grid content-start gap-2 [grid-template-columns:repeat(auto-fill,minmax(170px,1fr))]">
                {list.map((v) => (
                  <div key={v.id} className="group relative rounded-lg bg-white p-2.5 ring-1 ring-slate-200">
                    <div className="flex items-center gap-1">
                      <span className="word-en truncate font-bold text-slate-800">{v.word}</span>
                      <SpeakButton text={v.word} />
                    </div>
                    <div className="word-zh mt-0.5 truncate text-[13px] text-slate-600">
                      <span className="text-slate-400">{v.pos}</span> {v.meaning}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                      <TierBadge tier={v.tier} />
                      <span>{v.relevance}%</span>
                      <span className={cx('ml-auto rounded px-1', isDue(v, now) ? 'bg-rose-100 text-rose-600' : 'bg-slate-100')}>{isDue(v, now) ? '待复习' : boxLabel(v.box)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void remove(v)}
                      className="absolute right-1.5 top-1.5 hidden h-5 w-5 cursor-pointer place-items-center rounded-full bg-slate-200 text-xs text-slate-600 hover:bg-rose-500 hover:text-white group-hover:grid"
                      aria-label={`删除 ${v.word}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------
// 📝 间隔复习：看图 + 中文 → 拼出英文
// ------------------------------------------------------------

interface Card {
  item: VocabItem;
  retry: boolean;
}

export function ReviewModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [queue, setQueue] = useState<Card[]>([]);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<{ grade: ReviewGrade; text: string } | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [stats, setStats] = useState({ good: 0, almost: 0, again: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const due = await db.vocabBook.where('due').belowOrEqual(Date.now()).toArray();
      const shuffled = due.sort(() => Math.random() - 0.5).slice(0, 20);
      setQueue(shuffled.map((item) => ({ item, retry: false })));
      setIdx(0);
      setInput('');
      setFeedback(null);
      setShowHint(false);
      setStats({ good: 0, almost: 0, again: 0 });
    })();
  }, [open]);

  useEffect(() => {
    if (open && !feedback) inputRef.current?.focus();
  }, [open, idx, feedback]);

  const card = queue[idx];
  const done = open && queue.length > 0 && idx >= queue.length;

  const check = async () => {
    if (!card || feedback || !input.trim()) return;
    const it = card.item;
    const [j] = judgeOffline([input], { coreWords: [{ word: it.word, pos: it.pos, meaning: it.meaning, relevance: 100 }], advWords: [], weakWords: [] });
    const grade: ReviewGrade = j.status === 'correct' ? 'good' : j.status === 'typo' ? 'almost' : 'again';
    const text = grade === 'good' ? `✅ 正确！${it.word}` : grade === 'almost' ? `🟡 差一点！正确拼写是 ${it.word}` : `❌ 答案是 ${it.word}`;
    setFeedback({ grade, text });
    speak(it.word);
    setStats((s) => ({ ...s, [grade]: s[grade] + 1 }));
    // 重考的卡不再改变盒子（避免同一轮里被罚两次）
    if (!card.retry) await db.vocabBook.update(it.id!, applyReview(it, grade));
    if (grade === 'again' && !card.retry) setQueue((q) => [...q, { item: it, retry: true }]);
  };

  const next = () => {
    setIdx((i) => i + 1);
    setInput('');
    setFeedback(null);
    setShowHint(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="📝 间隔复习" subtitle="看图 + 中文，拼出英文 · 答对升盒（1→2→4→7→15→30 天后再见），答错明天前回炉" width="max-w-2xl">
      {!queue.length && <Empty icon="🎉" title="没有到期要复习的词">收藏更多生词，或者明天再来～</Empty>}
      {done && (
        <div className="py-8 text-center">
          <div className="text-5xl">🏁</div>
          <h3 className="mt-2 text-lg font-bold">本轮复习完成！</h3>
          <p className="mt-1 text-sm text-slate-600">
            ✅ 答对 {stats.good} · 🟡 差一点 {stats.almost} · ❌ 答错 {stats.again}
          </p>
          <Button className="mt-4" variant="primary" onClick={onClose}>
            完成
          </Button>
        </div>
      )}
      {card && !done && (
        <div>
          <div className="mb-2 flex justify-between text-xs text-slate-500">
            <span>
              第 {idx + 1} / {queue.length} 张{card.retry && '（回炉）'}
            </span>
            <span>
              {boxLabel(card.item.box)} · 来自「{card.item.levelTitle}」
            </span>
          </div>
          <SceneImage level={{ imageId: card.item.imageId, imageUrl: card.item.imageUrl, title: card.item.levelTitle }} className="aspect-[16/9] rounded-xl" />
          <div className="mt-4 text-center">
            <div className="text-2xl font-bold text-slate-800">{card.item.meaning}</div>
            <div className="text-sm text-slate-500">
              {card.item.pos} · {card.item.word.split(' ').length > 1 ? `${card.item.word.split(' ').length} 个单词的短语` : `${card.item.word.length} 个字母`}
              {showHint && <span className="ml-2 font-mono tracking-widest text-indigo-600">{maskWord(card.item.word)}</span>}
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <input
              ref={inputRef}
              value={input}
              disabled={!!feedback}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                if (feedback) next();
                else void check();
              }}
              placeholder="拼出英文，回车确认"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 rounded-xl border-2 border-slate-300 px-3.5 py-2.5 text-lg outline-none focus:border-violet-500"
            />
            {!feedback ? (
              <>
                <Button onClick={() => setShowHint(true)} disabled={showHint}>
                  💡 首字母
                </Button>
                <Button variant="violet" onClick={() => void check()} disabled={!input.trim()}>
                  确认
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={next} autoFocus>
                下一个 →
              </Button>
            )}
          </div>
          {feedback && (
            <div
              className={cx(
                'animate-pop mt-3 rounded-xl px-4 py-3 text-center font-semibold',
                feedback.grade === 'good' ? 'bg-emerald-50 text-emerald-700' : feedback.grade === 'almost' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700',
              )}
            >
              {feedback.text} <SpeakButton text={card.item.word} />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
