import { describe, expect, it } from 'vitest';
import { swSource } from '../server/swPlugin';

describe('Service Worker 生成', () => {
  const src = swSource(['./', 'assets/index-abc.js', 'seed/park.jpg'], 'v123');
  it('缓存名带版本号，预缓存列表完整', () => {
    expect(src).toContain("const CACHE = 'picword-v123'");
    expect(src).toContain('["./","assets/index-abc.js","seed/park.jpg"]');
  });
  it('是合法的 JavaScript', () => {
    expect(() => new Function(src)).not.toThrow();
  });
  it('跨域请求不拦截（Supabase / GitHub / 图库照常走网络）', () => {
    expect(src).toContain('url.origin !== self.location.origin');
  });
});
