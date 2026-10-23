// ============================================================
// ☁️ 云端账号：邮箱注册 / 登录；同步存档；上传 / 下载图解词典
// ============================================================

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  autoRestore,
  cloudConfigured,
  cloudDictInfo,
  cloudErrorText,
  currentUser,
  downloadDictFromCloud,
  onAuthChange,
  signIn,
  signOut,
  signUp,
  syncDataWithCloud,
  uploadDictToCloud,
  type CloudDictManifest,
} from '../../services/cloud';
import { useDictMeta } from '../../services/dictionary';
import { requestPersistentStorage } from '../../services/githubSync';
import { Button, Modal, Spinner } from '../ui/primitives';
import { useToast } from '../ui/Toast';

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2';
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const kb = (n: number) => (n < 1024 ? '不到 1 KB' : `${(n / 1024).toFixed(0)} KB`);

function LoginForm() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'in' | 'up' | null>(null);
  const [sent, setSent] = useState(false);

  const go = async (kind: 'in' | 'up') => {
    if (!email.trim() || password.length < 6) return toast('请填写邮箱和至少 6 位的密码', 'warn');
    setBusy(kind);
    try {
      if (kind === 'in') {
        await signIn(email.trim(), password);
        // 新设备登录：自动拉取存档，本机没有词典就从云端恢复
        void autoRestore((msg, k) => toast(msg, k, k === 'error' ? 8000 : 5000));
      }
      else {
        const r = await signUp(email.trim(), password);
        if (r.needConfirm) setSent(true);
      }
    } catch (e) {
      toast(cloudErrorText(e), 'error', 7000);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-sm space-y-3">
      <p className="text-sm text-slate-600">登录后，生词本、关卡库、战绩和图解词典都能存到云端，换手机、换电脑登录就能恢复。</p>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="邮箱" autoComplete="email" className={input} />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && void go('in')}
        placeholder="密码（至少 6 位）"
        autoComplete="current-password"
        className={input}
      />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="primary" onClick={() => void go('in')} disabled={!!busy}>
          {busy === 'in' ? <Spinner /> : null} 登录
        </Button>
        <Button onClick={() => void go('up')} disabled={!!busy}>
          {busy === 'up' ? <Spinner /> : null} 注册新账号
        </Button>
      </div>
      {sent && (
        <p className="rounded-lg bg-emerald-50 p-2.5 text-sm text-emerald-800">
          📧 验证邮件已发送到 {email}。点开邮件里的链接完成验证，再回来登录。（没收到看看垃圾邮件箱）
        </p>
      )}
      <p className="text-xs text-slate-400">数据只有你自己的账号能读写。国内访问云端可能需要开代理。</p>
    </div>
  );
}

function Account({ user }: { user: User }) {
  const toast = useToast();
  const localDict = useDictMeta();
  const [busy, setBusy] = useState<string | null>(null);
  const [cloudDict, setCloudDict] = useState<CloudDictManifest | null | undefined>(undefined);

  useEffect(() => {
    void cloudDictInfo().then(setCloudDict, () => setCloudDict(null));
  }, []);

  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(label);
    try {
      toast(await fn(), 'success', 6000);
      await requestPersistentStorage();
    } catch (e) {
      toast(cloudErrorText(e), 'error', 8000);
    } finally {
      setBusy(null);
    }
  };

  const syncData = () =>
    run('同步存档中…', async () => {
      const r = await syncDataWithCloud();
      const p = r.pulled;
      const st = r.settings === 'pulled' ? '；已从云端恢复设置（AI 模型、API Key 等）' : r.settings === 'pushed' ? '；设置（AI 模型、API Key 等）已存到云端' : '';
      return (p
        ? `同步完成：从云端合并了 关卡 ${p.levels} · 生词 ${p.vocab} · 记录 ${p.history}，并已上传（${kb(r.pushedBytes)}）`
        : `首次同步：已把本机存档上传到云端（${kb(r.pushedBytes)}）`) + st;
    });

  const uploadDict = () =>
    run('上传词典中…', async () => {
      const m = await uploadDictToCloud((d, t) => setBusy(`上传词典中… ${d} / ${t} 块`));
      setCloudDict(m);
      return `词典已上传到云端（${mb(m.size)}）`;
    });

  const downloadDict = () =>
    run('下载词典中…', async () => {
      const meta = await downloadDictFromCloud((stage, d, t) => setBusy(stage === 'download' ? `下载词典中… ${d} / ${t} 块` : `导入中… ${d} / ${t} 页`));
      return `已从云端恢复「${meta.name}」：${meta.pageCount} 页、${meta.entryCount} 个词条`;
    });

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
        <span>
          已登录：<b>{user.email}</b>
        </span>
        <Button size="sm" variant="ghost" onClick={() => void signOut()} disabled={!!busy}>
          退出登录
        </Button>
      </div>

      <section className="space-y-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
        <h3 className="font-bold text-slate-800">💾 存档（生词本 / 关卡库 / 战绩 / AI 设置）</h3>
        <p className="text-xs text-slate-500">先把云端的存档合并进这台设备，再把合并后的结果传回云端。两台设备各点一次就互相同步了。</p>
        <Button variant="success" onClick={() => void syncData()} disabled={!!busy}>
          🔄 同步存档
        </Button>
      </section>

      <section className="space-y-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
        <h3 className="font-bold text-slate-800">📖 图解词典</h3>
        <p className="text-xs text-slate-500">
          本机：{localDict ? `${localDict.name}（${localDict.pageCount} 页、${localDict.entryCount} 词）` : '没有词典'}
          <br />
          云端：{cloudDict === undefined ? '查询中…' : cloudDict ? `${cloudDict.name}（${mb(cloudDict.size)}，${new Date(cloudDict.uploadedAt).toLocaleString()} 上传）` : '没有词典'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => void uploadDict()} disabled={!!busy || !localDict}>
            ⬆️ 上传词典到云端
          </Button>
          <Button onClick={() => void downloadDict()} disabled={!!busy || !cloudDict}>
            ⬇️ 从云端下载词典
          </Button>
        </div>
      </section>

      {busy && (
        <p className="flex items-center gap-2 text-indigo-700">
          <Spinner /> {busy}
        </p>
      )}
    </div>
  );
}

export function CloudModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    if (!open || !cloudConfigured()) return;
    let off: (() => void) | undefined;
    let alive = true;
    void currentUser().then((u) => alive && setUser(u), () => alive && setUser(null));
    void onAuthChange((u) => setUser(u)).then((f) => (alive ? (off = f) : f()));
    return () => {
      alive = false;
      off?.();
    };
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="☁️ 云端账号" subtitle="存档和图解词典存到你自己的账号里" width="max-w-lg">
      {!cloudConfigured() ? (
        <p className="text-sm text-slate-600">云端账号还没有配置。</p>
      ) : user === undefined ? (
        <div className="grid place-items-center py-10">
          <Spinner className="text-indigo-600" />
        </div>
      ) : user ? (
        <Account user={user} />
      ) : (
        <LoginForm />
      )}
    </Modal>
  );
}
