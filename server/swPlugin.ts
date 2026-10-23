// ============================================================
// 构建时生成 Service Worker（dist/sw.js）：让游戏可以“添加到主屏幕”并离线游玩
//   · 预缓存 dist 里的全部文件（页面、代码、样式、21 张内置照片、图标）
//   · 页面：联网优先（总能拿到最新版），断网时用缓存
//   · 带哈希的资源：缓存优先（内容不会变）
//   · 跨域请求（Supabase、GitHub、远程图库、大模型）一律不管，照常走网络
// 不用第三方 PWA 插件：逻辑很少，也避免和 Vite 版本绑定。
// ============================================================

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

export function swSource(files: string[], version: string): string {
  return `// 由 server/swPlugin.ts 在构建时生成，不要手改
const CACHE = 'picword-${version}';
const PRECACHE = ${JSON.stringify(files)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE.map((f) => new URL(f, self.registration.scope))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('picword-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;

  if (req.mode === 'navigate') {
    // 页面：联网优先，断网用缓存的首页
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(new URL('./', self.registration.scope), copy));
          return res;
        })
        .catch(() => caches.match(new URL('./', self.registration.scope)).then((r) => r || caches.match(new URL('index.html', self.registration.scope))))
    );
    return;
  }

  // 资源：缓存优先，没有再联网并顺手存起来
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
`;
}

export function picwordServiceWorker(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'picword-service-worker',
    apply: 'build',
    configResolved(c) {
      config = c;
    },
    closeBundle() {
      const outDir = config.build.outDir;
      const files = listFiles(outDir)
        .map((p) => relative(outDir, p).split(sep).join('/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map'))
        .sort();
      // 版本号 = 所有文件内容的哈希：任何文件变了，旧缓存就会被替换
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      writeFileSync(join(outDir, 'sw.js'), swSource(['./', ...files.filter((f) => f !== 'index.html')], hash.digest('hex').slice(0, 12)));
    },
  };
}
