// ============================================================
// 轻量配置（localStorage）：AI 开关、模型、API Key、图库 Key、发音、玩法偏好
// 用 useSyncExternalStore 做成全局响应式 store，任何组件改了都会同步刷新。
// ============================================================

import { useSyncExternalStore } from 'react';
import type { ProviderId } from './llm/providers';

export type Transport = 'auto' | 'proxy' | 'direct';

export interface AppSettings {
  aiEnabled: boolean;
  provider: ProviderId;
  /** 各家 API Key（只存本机浏览器，不进存档导出） */
  keys: Partial<Record<ProviderId, string>>;
  /** 各家模型名覆盖（留空用默认） */
  models: Partial<Record<ProviderId, string>>;
  visionModels: Partial<Record<ProviderId, string>>;
  /** 使用视觉模型（能“真看图”的模型直接传图） */
  useVision: boolean;
  /** 自定义 OpenAI 兼容端点 */
  customEndpoint: string;
  customModel: string;
  customVision: boolean;
  /** 网络通道：自动 / 本地代理 / 浏览器直连 */
  transport: Transport;
  /** 图库 */
  pexelsKey: string;
  unsplashKey: string;
  useWikimedia: boolean;
  useOpenverse: boolean;
  /** 发音 */
  ttsVoice: string;
  ttsRate: number;
  /** 玩法 */
  defaultDifficulty: 'level' | 'easy' | 'medium' | 'hard';
  hintsPerLevel: number;
  showTimer: boolean;
  confetti: boolean;
  /** GitHub 私有仓库同步（令牌只存本机浏览器，不进存档导出） */
  ghToken: string;
  /** owner/repo */
  ghRepo: string;
  /** 仓库里词典包的路径 */
  ghDictPath: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  aiEnabled: false,
  provider: 'deepseek',
  keys: {},
  models: {},
  visionModels: {},
  useVision: true,
  customEndpoint: '',
  customModel: '',
  customVision: false,
  transport: 'auto',
  pexelsKey: '',
  unsplashKey: '',
  useWikimedia: true,
  useOpenverse: true,
  ttsVoice: '',
  ttsRate: 0.9,
  defaultDifficulty: 'level',
  hintsPerLevel: 3,
  showTimer: true,
  confetti: true,
  ghToken: '',
  ghRepo: '',
  ghDictPath: 'pack/dk.pwdict',
};

const STORAGE_KEY = 'picword.settings.v1';

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let current: AppSettings = typeof localStorage === 'undefined' ? { ...DEFAULT_SETTINGS } : load();
const listeners = new Set<() => void>();

export function getSettings(): AppSettings {
  return current;
}

export function updateSettings(patch: Partial<AppSettings> | ((s: AppSettings) => Partial<AppSettings>)) {
  const p = typeof patch === 'function' ? patch(current) : patch;
  current = { ...current, ...p };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* 隐私模式等写不进去时忽略 */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // 其他标签页改了设置也同步
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      current = load();
      cb();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

export function useSettings(): AppSettings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}
