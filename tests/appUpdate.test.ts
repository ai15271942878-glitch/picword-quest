import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let build = '12';
vi.mock('@capacitor/app', () => ({ App: { getInfo: async () => ({ version: `1.0.${build}`, build }) } }));
const opened: string[] = [];
vi.mock('@capacitor/browser', () => ({ Browser: { open: async ({ url }: { url: string }) => void opened.push(url) } }));

import { APK_DOWNLOAD_URL, checkForUpdate, fetchLatestVersion, isSnoozed, openApkDownload, snoozeUpdate } from '../src/services/appUpdate';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  opened.length = 0;
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
});
afterEach(() => vi.unstubAllGlobals());

const remote = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('App 内检查更新', () => {
  it('线上版本号更大 → 有更新，带更新内容', async () => {
    vi.stubGlobal('fetch', remote({ versionCode: 15, versionName: '1.0.15', notes: '新增检查更新' }));
    const r = await checkForUpdate();
    expect(r).toMatchObject({ hasUpdate: true, current: { versionCode: 12 }, latest: { versionCode: 15, notes: '新增检查更新' } });
  });

  it('一样或更旧 → 没有更新', async () => {
    vi.stubGlobal('fetch', remote({ versionCode: 12, versionName: '1.0.12' }));
    expect((await checkForUpdate()).hasUpdate).toBe(false);
  });

  it('读取失败 / 格式不对 → 报错（启动时静默，手动检查会提示）', async () => {
    await expect(fetchLatestVersion(remote({}, 404))).rejects.toThrow('404');
    await expect(fetchLatestVersion(remote({ versionName: 'x' }))).rejects.toThrow('格式不对');
  });

  it('立即更新：用浏览器打开 APK 地址', async () => {
    await openApkDownload();
    expect(opened).toEqual([APK_DOWNLOAD_URL]);
    expect(APK_DOWNLOAD_URL).toBe('https://ai15271942878-glitch.github.io/picword-quest/download/picword.apk');
  });

  it('稍后再说：一天内不再提示', () => {
    const now = 1_000_000;
    expect(isSnoozed(now)).toBe(false);
    snoozeUpdate(now);
    expect(isSnoozed(now + 3600_000)).toBe(true);
    expect(isSnoozed(now + 25 * 3600_000)).toBe(false);
  });
});
