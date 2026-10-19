// ============================================================
// 私人主题关卡库（PRD 模块四.2）
//   · 收藏对话框：指定已有文件夹或新建文件夹
//   · 关卡库：按文件夹分类浏览、重玩、移动、删除；文件夹改名/删除
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../services/db';
import { collectLevel, deleteFolder, moveLevel, removeLevel, renameFolder, useFolders } from '../../services/collections';
import { THEME_FOLDERS } from '../../data/seedLevels';
import { useGame } from '../../game/GameContext';
import { SceneImage } from '../game/PlayArea';
import { Button, Empty, Modal, Spinner, cx } from '../ui/primitives';
import { useToast } from '../ui/Toast';
import { useDialog } from '../ui/Dialog';
import type { Level, StoredLevel } from '../../types';

export function suggestFolder(level: Level): string {
  if (level.source === 'custom') return '我的自制';
  if (level.source === 'ai') return 'AI 生成';
  return (level.theme && THEME_FOLDERS[level.theme]) || '未分类';
}

export function CollectLevelDialog({ level, open, onClose }: { level: Level | null; open: boolean; onClose: () => void }) {
  const folders = useFolders();
  const toast = useToast();
  const existing = useLiveQuery(() => (level ? db.levels.get(level.id) : undefined), [level?.id]);
  const [folder, setFolder] = useState('');
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && level) {
      setFolder(existing?.folder ?? suggestFolder(level));
      setNewName('');
    }
  }, [open, level, existing?.folder]);

  if (!level) return null;
  const list = [...new Set([...folders, folder].filter(Boolean))];
  const target = newName.trim() || folder;

  const save = async () => {
    if (!target) return;
    setSaving(true);
    try {
      await collectLevel(level, target);
      toast(
        level.source === 'seed' ? `已收藏到「${target}」` : `已收藏到「${target}」，图片与完整词库已固化到本地，可离线重玩`,
        'success',
        4000,
      );
      onClose();
    } catch (e) {
      toast(`收藏失败：${(e as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={existing ? '⭐ 修改收藏文件夹' : '⭐ 收藏本关到关卡库'} subtitle={level.title} width="max-w-lg">
      <div className="space-y-4">
        <div>
          <div className="mb-2 text-sm font-semibold text-slate-700">选择分类文件夹</div>
          <div className="flex flex-wrap gap-2">
            {list.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFolder(f);
                  setNewName('');
                }}
                className={cx(
                  'cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold transition',
                  !newName && folder === f ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-amber-100',
                )}
              >
                📁 {f}
              </button>
            ))}
          </div>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-slate-700">或新建文件夹</span>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
            placeholder="如：机场出行、我的旅行照片…"
            maxLength={20}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        {level.source !== 'seed' && <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-500">收藏时会把图片下载并压缩存进浏览器的 IndexedDB，以后断网也能重玩；AI 判卷沉淀的新词也会一起写进关卡词库。</p>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>取消</Button>
          <Button variant="warning" onClick={() => void save()} disabled={!target || saving}>
            {saving && <Spinner />} 保存到「{target || '…'}」
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const SOURCE_TAG: Record<Level['source'], string> = { seed: '📦 内置', ai: '✨ AI', custom: '🎨 自建' };

export function LibraryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const levels = useLiveQuery(() => db.levels.orderBy('collectedAt').reverse().toArray(), []) ?? [];
  const folders = useFolders();
  const { loadLevel } = useGame();
  const toast = useToast();
  const dialog = useDialog();
  const [active, setActive] = useState<string>('全部');
  const [moving, setMoving] = useState<StoredLevel | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    levels.forEach((l) => m.set(l.folder, (m.get(l.folder) ?? 0) + 1));
    return m;
  }, [levels]);
  const allFolders = [...new Set([...folders, ...levels.map((l) => l.folder)])];
  const shown = active === '全部' ? levels : levels.filter((l) => l.folder === active);
  const grouped = active === '全部' ? allFolders.filter((f) => counts.get(f)).map((f) => [f, levels.filter((l) => l.folder === f)] as const) : [[active, shown] as const];

  const play = (l: StoredLevel) => {
    const { folder: _f, collectedAt: _c, plays: _p, bestScore: _b, ...level } = l;
    void _f;
    void _c;
    void _p;
    void _b;
    loadLevel(level, { toast: `从关卡库载入「${l.title}」` });
    onClose();
  };

  const onRename = async (f: string) => {
    const name = await dialog.prompt(`重命名文件夹「${f}」`, { defaultValue: f, okText: '重命名' });
    if (name && name.trim() && name.trim() !== f) {
      await renameFolder(f, name.trim());
      setActive(name.trim());
    }
  };
  const onDeleteFolder = async (f: string) => {
    if (!(await dialog.confirm(`删除文件夹「${f}」？`, { message: `其中 ${counts.get(f) ?? 0} 个关卡会移到「未分类」，关卡本身不会被删除。`, danger: true, okText: '删除文件夹' }))) return;
    await deleteFolder(f);
    setActive('全部');
  };
  const onDelete = async (l: StoredLevel) => {
    if (!(await dialog.confirm(`从关卡库移除「${l.title}」？`, { message: '已收藏到视觉生词本的单词不受影响。', danger: true, okText: '移除' }))) return;
    await removeLevel(l.id);
    toast('已移除', 'info');
  };

  return (
    <Modal open={open} onClose={onClose} title="📚 我的关卡库" subtitle={`共 ${levels.length} 个关卡 · 内置 / AI / 自建关卡都可以收藏，按文件夹分类`}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {['全部', ...allFolders].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setActive(f)}
            className={cx(
              'cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold transition',
              active === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-indigo-50',
            )}
          >
            {f === '全部' ? '🗂️ 全部' : `📁 ${f}`} <span className="opacity-70">{f === '全部' ? levels.length : counts.get(f) ?? 0}</span>
          </button>
        ))}
        {active !== '全部' && (
          <span className="ml-auto flex gap-1">
            <Button size="xs" onClick={() => void onRename(active)}>
              ✏️ 重命名
            </Button>
            <Button size="xs" variant="ghost" onClick={() => void onDeleteFolder(active)}>
              🗑 删除文件夹
            </Button>
          </span>
        )}
      </div>

      {!levels.length && (
        <Empty icon="📭" title="关卡库还是空的">
          玩完一关后，在结算页点「⭐ 收藏本关到关卡库」。AI 生成和自建的关卡收藏后会把图片与词库固化到本地，随时离线重玩。
        </Empty>
      )}
      {levels.length > 0 && !shown.length && <Empty icon="📂" title="这个文件夹是空的" />}

      <div className="space-y-6">
        {grouped.map(([f, list]) => (
          <div key={f}>
            {active === '全部' && (
              <h3 className="mb-2 flex items-center gap-2 border-b-2 border-indigo-100 pb-1 text-base font-bold text-indigo-700">
                📁 {f} <span className="text-xs font-normal text-slate-400">{list.length} 关</span>
              </h3>
            )}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4">
              {list.map((l) => (
                <div key={l.id} className="group overflow-hidden rounded-xl bg-white ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-indigo-300">
                  <button type="button" onClick={() => play(l)} className="block w-full cursor-pointer text-left">
                    <SceneImage level={l} className="aspect-[4/3]" />
                  </button>
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-bold text-slate-800" title={l.title}>
                        {l.title}
                      </span>
                      <span className="shrink-0 text-[11px] text-slate-500">{SOURCE_TAG[l.source]}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      及格 {l.passCount} 词 · 词库 {l.coreWords.length + l.advWords.length + l.weakWords.length} · 玩过 {l.plays} 次
                      {l.bestScore != null && <> · 最高 <b className="text-emerald-600">{l.bestScore}</b></>}
                    </div>
                    <div className="mt-2 flex gap-1.5">
                      <Button size="xs" variant="primary" onClick={() => play(l)}>
                        ▶ 开玩
                      </Button>
                      <Button size="xs" onClick={() => setMoving(l)}>
                        📁 移动
                      </Button>
                      <Button size="xs" variant="ghost" className="ml-auto" onClick={() => void onDelete(l)}>
                        🗑
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {moving && (
        <Modal open onClose={() => setMoving(null)} title="📁 移动到文件夹" subtitle={moving.title} width="max-w-md">
          <div className="flex flex-wrap gap-2">
            {allFolders.map((f) => (
              <Button
                key={f}
                size="sm"
                variant={f === moving.folder ? 'warning' : 'secondary'}
                onClick={async () => {
                  await moveLevel(moving.id, f);
                  setMoving(null);
                  toast(`已移动到「${f}」`, 'success');
                }}
              >
                📁 {f}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                const name = (await dialog.prompt('新文件夹名称', { okText: '新建并移动' }))?.trim();
                if (name) {
                  await moveLevel(moving.id, name);
                  setMoving(null);
                  toast(`已移动到新文件夹「${name}」`, 'success');
                }
              }}
            >
              ＋ 新建文件夹
            </Button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
