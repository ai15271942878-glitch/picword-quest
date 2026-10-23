import { describe, expect, it, vi } from 'vitest';
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
import { closeTopLayer, createExitGuard, pushBackHandler } from '../src/services/backButton';

describe('安卓返回键', () => {
  it('先关最上层，层层往下；都关完返回 false', () => {
    const closed: string[] = [];
    const offDrawer = pushBackHandler(() => closed.push('词典'));
    const offDetail = pushBackHandler(() => closed.push('单词详情'));
    pushBackHandler(() => closed.push('看大图'))();  // 已关闭的层不再响应
    expect(closeTopLayer()).toBe(true);
    offDetail();
    expect(closeTopLayer()).toBe(true);
    offDrawer();
    expect(closeTopLayer()).toBe(false);
    expect(closed).toEqual(['单词详情', '词典']);
  });

  it('主页：第一次提示，2 秒内再按退出，超过 2 秒重新提示', () => {
    const guard = createExitGuard(2000);
    expect(guard(10_000)).toBe('hint');
    expect(guard(11_500)).toBe('exit');
    const g2 = createExitGuard(2000);
    expect(g2(10_000)).toBe('hint');
    expect(g2(13_000)).toBe('hint');
  });
});
