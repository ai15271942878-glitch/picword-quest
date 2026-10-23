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
  /** 发音来源：online = 有道真人发音（联网，失败自动改用系统语音）；system = 系统 / 浏览器语音合成 */
  ttsSource: 'online' | 'system';
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
  ttsSource: 'online',
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

/** 本机设置最后一次被修改的时间（云端同步时“以最后修改的设备为准”） */
const UPDATED_AT_KEY = 'picword.settings.updatedAt';

export function getSettingsUpdatedAt(): number {
  try {
    return Number(localStorage.getItem(UPDATED_AT_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** 只记修改时间、不改设置（首次上传旧设置到云端时，让两边时间一致） */
export function setSettingsUpdatedAt(ts: number) {
  try {
    localStorage.setItem(UPDATED_AT_KEY, String(ts));
  } catch {
    /* ignore */
  }
}

function save(updatedAt: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    localStorage.setItem(UPDATED_AT_KEY, String(updatedAt));
  } catch {
    /* 隐私模式等写不进去时忽略 */
  }
  listeners.forEach((l) => l());
}

export function updateSettings(patch: Partial<AppSettings> | ((s: AppSettings) => Partial<AppSettings>)) {
  const p = typeof patch === 'function' ? patch(current) : patch;
  current = { ...current, ...p };
  save(Date.now());
}

/** 只属于本机、不跟着云端账号同步的设置：GitHub 令牌权限大（能读写私有仓库），留在本机 */
export const LOCAL_ONLY_SETTINGS: (keyof AppSettings)[] = ['ghToken', 'ghRepo', 'ghDictPath'];

/** 可同步到云端账号的设置（去掉本机专属项） */
export function syncableSettings(): Partial<AppSettings> {
  const out: Partial<AppSettings> = { ...current };
  for (const k of LOCAL_ONLY_SETTINGS) delete out[k];
  return out;
}

/** 应用云端设置：保留本机专属项，修改时间记为云端的时间（不算本机修改） */
export function applyCloudSettings(remote: Partial<AppSettings>, updatedAt: number) {
  const keep = Object.fromEntries(LOCAL_ONLY_SETTINGS.map((k) => [k, current[k]]));
  current = { ...DEFAULT_SETTINGS, ...remote, ...keep };
  save(updatedAt);
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
