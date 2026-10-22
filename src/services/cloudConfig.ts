// 云端账号（Supabase）配置：URL 与 anon key 是公开信息（给浏览器用的），安全靠服务器端的行级安全策略。
// 单独成文件，避免顶部按钮为了判断“是否已配置”把整套云端代码拉进首屏。
export const CLOUD_URL: string = import.meta.env.VITE_SUPABASE_URL ?? '';
export const CLOUD_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
export const cloudConfigured = () => !!(CLOUD_URL && CLOUD_ANON_KEY);

/** Supabase 把登录会话存在 localStorage 的这个键里 */
export const AUTH_STORAGE_KEY = 'picword.cloud.auth';

/** 本机是否有登录记录（不加载 Supabase 库，打开页面时用来决定要不要自动恢复） */
export function hasCloudSession(): boolean {
  try {
    return !!localStorage.getItem(AUTH_STORAGE_KEY);
  } catch {
    return false;
  }
}
