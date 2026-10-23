// ============================================================
// “安装到手机桌面”（PWA）：捕获浏览器的安装事件，给顶部按钮用
// 安卓 Chrome / Edge 支持一键安装；iOS Safari 只能手动“添加到主屏幕”（见玩法说明）
// ============================================================

import { useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // 不让浏览器自己弹，由我们的按钮触发
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

/** 已经以 App 方式打开（从桌面图标进来） */
export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);

export function useCanInstall(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => !!deferred && !isStandalone(),
    () => false,
  );
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  await e.prompt();
  const { outcome } = await e.userChoice;
  deferred = null;
  emit();
  return outcome === 'accepted';
}

/** 安卓 APK 下载地址（由 GitHub Actions 打包后随网站一起发布） */
export const APK_URL = './download/picword.apk';

/** 用安卓手机浏览器打开网页（不是已经装好的 App）时，提示下载 APK */
export const shouldOfferApk = () =>
  typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent) && !Capacitor.isNativePlatform() && !isStandalone();
