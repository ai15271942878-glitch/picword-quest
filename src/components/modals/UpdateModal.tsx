// ============================================================
// 📱 安卓 App 更新：启动时自动检查 + 设置页手动检查
// ============================================================

import { useEffect, useState } from 'react';
import { checkForUpdate, currentAppVersion, isNativeApp, isSnoozed, openApkDownload, snoozeUpdate, type UpdateInfo } from '../../services/appUpdate';
import { Button, Modal, Spinner } from '../ui/primitives';
import { useToast } from '../ui/Toast';

export function UpdateDialog({ info, onClose }: { info: UpdateInfo; onClose: (snooze: boolean) => void }) {
  const toast = useToast();
  const update = async () => {
    try {
      await openApkDownload();
      onClose(false);
    } catch (e) {
      toast(`打开下载失败：${(e as Error).message}`, 'error', 7000);
    }
  };
  return (
    <Modal open onClose={() => onClose(true)} title={`🎉 发现新版本 ${info.latest.versionName}`} width="max-w-md">
      <div className="space-y-3 text-sm text-slate-700">
        <p>
          当前版本 {info.current.versionName}（{info.current.versionCode}）→ 最新 {info.latest.versionName}（{info.latest.versionCode}）
        </p>
        {info.latest.notes && (
          <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
            <div className="mb-1 text-xs font-semibold text-slate-500">更新内容</div>
            <p className="whitespace-pre-line">{info.latest.notes}</p>
          </div>
        )}
        <p className="text-xs text-slate-500">点「立即更新」会用浏览器下载新安装包，下载完成后点开 picword.apk 安装即可（数据会保留）。</p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => onClose(true)}>稍后再说</Button>
          <Button variant="primary" onClick={() => void update()}>
            立即更新
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** 只在安卓 App 里挂载：启动 3 秒后检查一次（“稍后再说”后一天内不打扰），网络不通时静默 */
export function AppUpdateWatcher() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  useEffect(() => {
    if (!isNativeApp() || isSnoozed()) return;
    const t = setTimeout(() => {
      checkForUpdate().then(
        (r) => r.hasUpdate && setInfo(r),
        () => {
          /* 断网等：下次启动再查 */
        },
      );
    }, 3000);
    return () => clearTimeout(t);
  }, []);
  if (!info) return null;
  return (
    <UpdateDialog
      info={info}
      onClose={(snooze) => {
        if (snooze) snoozeUpdate();
        setInfo(null);
      }}
    />
  );
}

/** 设置页里的版本信息 + 手动检查更新 */
export function AppVersionSection() {
  const toast = useToast();
  const [version, setVersion] = useState<string>('');
  const [checking, setChecking] = useState(false);
  const [info, setInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    void currentAppVersion().then((v) => setVersion(`${v.versionName}（${v.versionCode}）`));
  }, []);

  const check = async () => {
    setChecking(true);
    try {
      const r = await checkForUpdate();
      if (r.hasUpdate) setInfo(r);
      else toast(`已经是最新版本 ${r.current.versionName}`, 'success');
    } catch (e) {
      toast(`检查更新失败：${(e as Error).message}（需要联网）`, 'error', 7000);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span>当前版本：{version || '读取中…'}</span>
      <Button size="sm" onClick={() => void check()} disabled={checking}>
        {checking ? <Spinner /> : '🔄'} 检查更新
      </Button>
      {info && <UpdateDialog info={info} onClose={() => setInfo(null)} />}
    </div>
  );
}
