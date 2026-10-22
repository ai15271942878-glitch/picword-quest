import { Suspense, lazy, useCallback, useEffect, useState, type ReactNode } from 'react';
import { useGame } from './game/GameContext';
import { gcImages } from './services/db';
import { AiBar, Header, RuleBanner, type ModalKey } from './components/game/TopBars';
import { InputCard, SceneCard } from './components/game/PlayArea';
import { ResultPanel } from './components/game/ResultPanel';
import { useToast } from './components/ui/Toast';
import { cx } from './components/ui/primitives';
import { cloudConfigured, hasCloudSession } from './services/cloudConfig';

// 弹窗按需懒加载：首次打开时才下载对应代码，首屏更快
const AiCreateModal = lazy(() => import('./components/modals/AiCreateModal').then((m) => ({ default: m.AiCreateModal })));
const CustomLevelModal = lazy(() => import('./components/modals/CustomLevelModal').then((m) => ({ default: m.CustomLevelModal })));
const LibraryModal = lazy(() => import('./components/modals/LibraryModals').then((m) => ({ default: m.LibraryModal })));
const CollectLevelDialog = lazy(() => import('./components/modals/LibraryModals').then((m) => ({ default: m.CollectLevelDialog })));
const VocabAlbumModal = lazy(() => import('./components/modals/VocabModals').then((m) => ({ default: m.VocabAlbumModal })));
const ReviewModal = lazy(() => import('./components/modals/VocabModals').then((m) => ({ default: m.ReviewModal })));
const SettingsModal = lazy(() => import('./components/modals/SettingsModal').then((m) => ({ default: m.SettingsModal })));
const StatsModal = lazy(() => import('./components/modals/MiscModals').then((m) => ({ default: m.StatsModal })));
const DictDrawer = lazy(() => import('./components/modals/DictDrawer').then((m) => ({ default: m.DictDrawer })));
const CloudModal = lazy(() => import('./components/modals/CloudModal').then((m) => ({ default: m.CloudModal })));
const HelpModal = lazy(() => import('./components/modals/MiscModals').then((m) => ({ default: m.HelpModal })));

type Mountable = Exclude<ModalKey, null> | 'collect' | 'dict';

export default function App() {
  const { session, notice, clearNotice } = useGame();
  const toast = useToast();
  const [modal, setModalRaw] = useState<ModalKey>(null);
  const [collectOpen, setCollectOpenRaw] = useState(false);
  const [dictOpen, setDictOpen] = useState(false);
  // 打开过的弹窗保持挂载（保留内部状态），没打开过的不加载
  const [mounted, setMounted] = useState<Set<Mountable>>(new Set());
  const mount = (k: Mountable) => setMounted((s) => (s.has(k) ? s : new Set(s).add(k)));

  const setModal = useCallback((k: ModalKey) => {
    if (k) mount(k);
    setModalRaw(k);
  }, []);
  const openCollect = useCallback(() => {
    mount('collect');
    setCollectOpenRaw(true);
  }, []);
  const close = useCallback(() => setModalRaw(null), []);
  const toggleDict = useCallback(() => {
    mount('dict');
    setDictOpen((v) => !v);
  }, []);
  const closeDict = useCallback(() => setDictOpen(false), []);

  useEffect(() => {
    if (notice) {
      toast(notice, 'info', 4500);
      clearNotice();
    }
  }, [notice, toast, clearNotice]);

  // 启动时：登录过云端账号就自动同步存档、按需恢复词典（没登录过不加载云端代码）
  useEffect(() => {
    if (!cloudConfigured() || !hasCloudSession()) return;
    const t = setTimeout(() => {
      void import('./services/cloud').then((m) => m.autoRestore((msg, kind) => toast(msg, kind, kind === 'error' ? 8000 : 5000)));
    }, 1500);
    return () => clearTimeout(t);
  }, [toast]);

  // 启动时清理没人引用的图片
  useEffect(() => {
    const t = setTimeout(() => void gcImages(), 4000);
    return () => clearTimeout(t);
  }, []);

  const lazyModal = (k: Mountable, node: ReactNode) => (mounted.has(k) ? <Suspense fallback={null}>{node}</Suspense> : null);

  return (
    <div className={cx('mx-auto max-w-6xl space-y-4 px-3 py-4 sm:px-5 sm:py-6', dictOpen && 'xl:mr-[440px]')}>
      <Header onOpen={setModal} onToggleDict={toggleDict} />
      <AiBar onOpenSettings={() => setModal('settings')} />
      <RuleBanner />
      <main className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr] [&>*]:min-w-0">
        <SceneCard />
        <InputCard />
      </main>
      <ResultPanel onCollectLevel={openCollect} />

      <footer className="pb-2 pt-4 text-center text-xs text-slate-400">
        PicWord Quest · 数据只保存在本机浏览器（IndexedDB）· 真实照片来自 CC0 / CC 图库 ·{' '}
        <button type="button" className="cursor-pointer underline hover:text-slate-600" onClick={() => setModal('help')}>
          玩法说明
        </button>
      </footer>

      {lazyModal('ai', <AiCreateModal open={modal === 'ai'} onClose={close} onOpenSettings={() => setModal('settings')} onCollect={openCollect} />)}
      {lazyModal('custom', <CustomLevelModal open={modal === 'custom'} onClose={close} onOpenSettings={() => setModal('settings')} />)}
      {lazyModal('library', <LibraryModal open={modal === 'library'} onClose={close} />)}
      {lazyModal('vocab', <VocabAlbumModal open={modal === 'vocab'} onClose={close} onReview={() => setModal('review')} />)}
      {lazyModal('review', <ReviewModal open={modal === 'review'} onClose={() => setModal('vocab')} />)}
      {lazyModal('stats', <StatsModal open={modal === 'stats'} onClose={close} />)}
      {lazyModal('settings', <SettingsModal open={modal === 'settings'} onClose={close} />)}
      {lazyModal('cloud', <CloudModal open={modal === 'cloud'} onClose={close} />)}
      {lazyModal('help', <HelpModal open={modal === 'help'} onClose={close} />)}
      {lazyModal('dict', <DictDrawer open={dictOpen} onClose={closeDict} />)}
      {lazyModal('collect', <CollectLevelDialog level={session?.level ?? null} open={collectOpen} onClose={() => setCollectOpenRaw(false)} />)}
    </div>
  );
}
