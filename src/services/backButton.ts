// ============================================================
// 安卓返回键：先关最上层（弹窗 / 看大图 / 词典侧边栏 / 词典详情），都关完了在主页
// 按一次提示“再按一次退出”，2 秒内再按退出 App。网页里没有返回键事件，不受影响。
// ============================================================

import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';

const stack: (() => void)[] = [];

/** 登记一层；返回取消登记的函数 */
export function pushBackHandler(fn: () => void): () => void {
  stack.push(fn);
  return () => {
    const i = stack.lastIndexOf(fn);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** 打开期间登记“按返回键时怎么关”；后打开的在上层，先被关掉 */
export function useBackClose(active: boolean, onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => (active ? pushBackHandler(() => ref.current()) : undefined), [active]);
}

/** 关掉最上层；没有可关的返回 false */
export function closeTopLayer(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top();
  return true;
}

export const EXIT_WINDOW_MS = 2000;

/** 主页上的“按两次退出”：第一次返回 'hint'，窗口期内第二次返回 'exit' */
export function createExitGuard(windowMs = EXIT_WINDOW_MS) {
  let last = 0;
  return (now = Date.now()): 'hint' | 'exit' => {
    if (now - last < windowMs) return 'exit';
    last = now;
    return 'hint';
  };
}

/** 只在安卓 App 里接管返回键 */
export async function initNativeBackButton(hint: (msg: string) => void): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {};
  const { App } = await import('@capacitor/app');
  const guard = createExitGuard();
  const handle = await App.addListener('backButton', () => {
    if (closeTopLayer()) return;
    if (guard() === 'exit') void App.exitApp();
    else hint('再按一次返回退出 PicWord');
  });
  return () => void handle.remove();
}
