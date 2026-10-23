// ============================================================
// 安卓 App 内检查更新：对比本机版本号（versionCode）与网站上的 download/version.json
// 有新版就提示，点“立即更新”用浏览器下载新 APK，下载完点一下安装（安卓要求安装必须用户确认）。
// version.json 由 GitHub Actions 打包 APK 时生成：{ versionCode, versionName, notes }
// ============================================================

import { Capacitor } from '@capacitor/core';
import { PUBLIC_SITE_URL } from './cloudConfig';

export const VERSION_URL = `${PUBLIC_SITE_URL}download/version.json`;
export const APK_DOWNLOAD_URL = `${PUBLIC_SITE_URL}download/picword.apk`;
const SNOOZE_KEY = 'picword.update.snoozedUntil';

export interface RemoteVersion {
  versionCode: number;
  versionName: string;
  notes?: string;
}

export interface UpdateInfo {
  current: { versionName: string; versionCode: number };
  latest: RemoteVersion;
  hasUpdate: boolean;
}

export const isNativeApp = () => Capacitor.isNativePlatform();

export async function currentAppVersion(): Promise<{ versionName: string; versionCode: number }> {
  const { App } = await import('@capacitor/app');
  const info = await App.getInfo();
  return { versionName: info.version, versionCode: Number(info.build) || 0 };
}

export async function fetchLatestVersion(fetchImpl: typeof fetch = fetch): Promise<RemoteVersion> {
  const res = await fetchImpl(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`读取版本信息失败（${res.status}）`);
  const j = (await res.json()) as RemoteVersion;
  if (!Number.isFinite(Number(j.versionCode))) throw new Error('版本信息格式不对');
  return { ...j, versionCode: Number(j.versionCode) };
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  const [current, latest] = await Promise.all([currentAppVersion(), fetchLatestVersion()]);
  return { current, latest, hasUpdate: latest.versionCode > current.versionCode };
}

/** 用系统浏览器打开 APK 下载地址（App 内的网页引擎不能直接下载安装包） */
export async function openApkDownload(): Promise<void> {
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url: APK_DOWNLOAD_URL });
}

/** “稍后再说”：一天内启动时不再提示（手动检查不受影响） */
export function snoozeUpdate(now = Date.now()) {
  try {
    localStorage.setItem(SNOOZE_KEY, String(now + 24 * 3600 * 1000));
  } catch {
    /* ignore */
  }
}

export function isSnoozed(now = Date.now()): boolean {
  try {
    return now < Number(localStorage.getItem(SNOOZE_KEY) || 0);
  } catch {
    return false;
  }
}
