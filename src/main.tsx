import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { GameProvider } from './game/GameContext';
import { ToastProvider } from './components/ui/Toast';
import { DialogProvider } from './components/ui/Dialog';
import { Capacitor } from '@capacitor/core';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <DialogProvider>
        <GameProvider>
          <App />
        </GameProvider>
      </DialogProvider>
    </ToastProvider>
  </StrictMode>,
);

// 生产环境注册 Service Worker：可“添加到主屏幕”、断网也能玩（dist/sw.js 由 server/swPlugin.ts 生成）
// 安卓 App 里不注册：游戏文件本来就在安装包里，再缓存一层反而可能拿到旧版本
if (import.meta.env.PROD && 'serviceWorker' in navigator && !Capacitor.isNativePlatform()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* 不支持或被浏览器禁用时照常在线玩 */
    });
  });
}
