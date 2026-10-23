// ============================================================
// ☁️ GitHub 私有仓库同步：设置区块 + 词典同步按钮
// ============================================================

import { useEffect, useState } from 'react';
import { updateSettings, useSettings } from '../../services/settings';
import {
  ghConfigOf,
  isStoragePersisted,
  requestPersistentStorage,
  syncDataWithGitHub,
  syncDictFromGitHub,
  testGhConnection,
} from '../../services/githubSync';
import { Button, Spinner, cx } from '../ui/primitives';
import { useToast } from '../ui/Toast';

const LAST_SYNC_KEY = 'picword.ghLastSync';
const input = 'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5';
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const kb = (n: number) => (n < 1024 ? '不到 1 KB' : `${(n / 1024).toFixed(0)} KB`);

function readLastSync(): number | null {
  try {
    return Number(localStorage.getItem(LAST_SYNC_KEY)) || null;
  } catch {
    return null;
  }
}

/** “从 GitHub 同步词典”按钮（设置页和词典侧边栏共用） */
export function DictSyncButton({ size = 'md', label = '☁️ 从 GitHub 同步词典' }: { size?: 'xs' | 'sm' | 'md'; label?: string }) {
  const s = useSettings();
  const toast = useToast();
  const cfg = ghConfigOf(s);
  const [progress, setProgress] = useState<string | null>(null);
  if (!cfg) return null;
  const run = async () => {
    setProgress('连接中…');
    try {
      const meta = await syncDictFromGitHub(cfg, s.ghDictPath || 'pack/dk.pwdict', (stage, d, t) =>
        setProgress(stage === 'download' ? `下载中 ${mb(d)}${t ? ` / ${mb(t)}` : ''}` : `导入中 ${d} / ${t} 页`),
      );
      await requestPersistentStorage();
      toast(`已同步「${meta.name}」：${meta.pageCount} 页、${meta.entryCount} 个词条`, 'success', 5000);
    } catch (e) {
      const msg = (e as Error).name === 'QuotaExceededError' ? '浏览器存储空间不足' : (e as Error).message;
      toast(`同步词典失败：${msg}`, 'error', 8000);
    } finally {
      setProgress(null);
    }
  };
  return progress ? (
    <span className="inline-flex items-center gap-2 text-xs text-slate-600">
      <Spinner className="text-indigo-600" /> {progress}
    </span>
  ) : (
    <Button size={size} variant="primary" onClick={() => void run()}>
      {label}
    </Button>
  );
}

export function GitHubSyncSection() {
  const s = useSettings();
  const toast = useToast();
  const cfg = ghConfigOf(s);
  const [busy, setBusy] = useState<'test' | 'data' | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(readLastSync);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    void isStoragePersisted().then(setPersisted);
  }, []);

  const test = async () => {
    if (!cfg) return;
    setBusy('test');
    try {
      const r = await testGhConnection(cfg);
      if (r.private) toast(`连接成功：${r.fullName}（私有仓库）`, 'success', 5000);
      else toast(`连接成功，但 ${r.fullName} 是公开仓库！词典和存档会被所有人看到，请到 GitHub 改成 Private`, 'warn', 10000);
    } catch (e) {
      toast((e as Error).message, 'error', 8000);
    } finally {
      setBusy(null);
    }
  };

  const syncData = async () => {
    if (!cfg) return;
    setBusy('data');
    try {
      const r = await syncDataWithGitHub(cfg);
      const now = Date.now();
      try {
        localStorage.setItem(LAST_SYNC_KEY, String(now));
      } catch {
        /* ignore */
      }
      setLastSync(now);
      setPersisted(await requestPersistentStorage());
      const p = r.pulled;
      toast(
        p ? `同步完成：从云端合并了 关卡 ${p.levels} · 生词 ${p.vocab} · 记录 ${p.history}，并已上传（${kb(r.pushedBytes)}）` : `首次同步：已把本机存档上传到云端（${kb(r.pushedBytes)}）`,
        'success',
        6000,
      );
    } catch (e) {
      toast(`同步失败：${(e as Error).message}`, 'error', 8000);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 font-semibold">仓库</span>
        <input
          value={s.ghRepo}
          onChange={(e) => updateSettings({ ghRepo: e.target.value.trim() })}
          placeholder="用户名/仓库名，如 yourname/my-dictionary"
          autoCapitalize="off"
          spellCheck={false}
          className={cx(input, 'w-72 max-w-full')}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 font-semibold">访问令牌</span>
        <input
          type="password"
          value={s.ghToken}
          onChange={(e) => updateSettings({ ghToken: e.target.value.trim() })}
          placeholder="github_pat_…"
          className={cx(input, 'w-72 max-w-full')}
        />
        <a
          href="https://github.com/settings/personal-access-tokens/new"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-indigo-600 hover:underline"
        >
          生成令牌 ↗
        </a>
      </div>
      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer">怎么生成令牌？</summary>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5">
          <li>点上面「生成令牌」，用 GitHub 账号登录</li>
          <li>Token name 随便填；Expiration 选一个较长的期限</li>
          <li>Repository access 选「Only select repositories」，只勾你的私有仓库</li>
          <li>Permissions → Repository permissions → Contents 选「Read and write」</li>
          <li>点 Generate token，复制以 github_pat_ 开头的令牌粘贴到上面</li>
        </ol>
        <p className="mt-1">令牌只保存在这个浏览器里，不会进存档文件，也不会同步到云端账号；别把它发给别人。</p>
      </details>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 font-semibold">词典路径</span>
        <input
          value={s.ghDictPath}
          onChange={(e) => updateSettings({ ghDictPath: e.target.value.trim() })}
          placeholder="pack/dk.pwdict"
          autoCapitalize="off"
          spellCheck={false}
          className={cx(input, 'w-72 max-w-full')}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void test()} disabled={!cfg || !!busy}>
          {busy === 'test' ? <Spinner /> : '🔌'} 测试连接
        </Button>
        <Button variant="success" onClick={() => void syncData()} disabled={!cfg || !!busy}>
          {busy === 'data' ? <Spinner /> : '🔄'} 同步存档（生词本 / 关卡库 / 战绩）
        </Button>
        <DictSyncButton />
      </div>
      <p className="text-xs text-slate-500">
        {cfg ? (lastSync ? `上次同步存档：${new Date(lastSync).toLocaleString()}` : '还没有同步过存档') : '填好仓库和令牌后即可同步'}
        {' · '}持久存储：{persisted === null ? '浏览器不支持' : persisted ? '✅ 已开启（空间紧张时浏览器不会优先清理本站数据）' : '未开启（导入词典或同步后会自动申请）'}
      </p>
    </>
  );
}
