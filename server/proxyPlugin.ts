// ============================================================
// 本地跨域代理（Vite 插件中间件；npm run dev 与 npm run preview 都生效）
//
//   GET  /api/health          探活
//   POST /api/proxy           转发 JSON 请求（大模型 / 图库 API）
//   GET  /api/image?url=...   转发图片下载（用于把远程图固化进 IndexedDB）
//
// 安全措施（防止被别的网页当成开放代理）：
//   1. 必须带自定义请求头 X-PicWord-Proxy: 1 —— 跨站页面带它会触发 CORS 预检，
//      而本中间件不响应预检，浏览器会直接拦下；
//   2. 有 Origin 头时必须与本站同源；
//   3. 目标地址白名单：已知大模型 / 图库域名，或路径以 /chat/completions 结尾的自定义端点；
//      图片代理禁止访问内网地址，且只放行 image/* 响应、≤ 15 MB。
//
// 系统代理（国内访问 Wikimedia / Openverse / Gemini 需要）：
//   1. 环境变量 HTTP(S)_PROXY（undici EnvHttpProxyAgent，支持 NO_PROXY）
//   2. 没有环境变量时，Windows 上读取注册表里的“系统代理”（Clash / v2rayN 开启
//      “系统代理”后写在 HKCU\...\Internet Settings 的 ProxyServer），每 30 秒刷新一次
//   3. 代理连不上（Clash 没开）自动改直连
// ============================================================

import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { execFileSync } from 'node:child_process';
import { Agent, EnvHttpProxyAgent, ProxyAgent, fetch as ufetch, type Dispatcher } from 'undici';

const LLM_HOSTS = new Set(['api.deepseek.com', 'dashscope.aliyuncs.com', 'open.bigmodel.cn', 'generativelanguage.googleapis.com']);
const API_HOSTS = new Set(['commons.wikimedia.org', 'api.openverse.org', 'api.pexels.com', 'api.unsplash.com']);
const FORWARD_HEADERS = ['authorization', 'x-goog-api-key', 'content-type', 'accept', 'accept-version'];
const UA = 'PicWordQuest/1.0 (local web game; https://github.com/)';
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const envProxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || '';
const directAgent = new Agent();

interface ProxyInfo {
  url: string;
  source: 'env' | 'system';
  agent: Dispatcher;
}

/** 解析 Windows 注册表里的系统代理（ProxyEnable=1 时） */
export function parseWinProxy(regOutput: string): string | null {
  if (!/ProxyEnable\s+REG_DWORD\s+0x0*1\s/i.test(regOutput + ' ')) return null;
  let server = regOutput.match(/ProxyServer\s+REG_SZ\s+(\S+)/i)?.[1];
  if (!server) return null;
  // 形如 "http=127.0.0.1:7890;https=127.0.0.1:7890"
  if (server.includes('=')) {
    const pairs = server.split(';').map((x) => x.split('=') as [string, string]);
    server = (pairs.find(([k]) => k === 'https') ?? pairs.find(([k]) => k === 'http') ?? pairs[0])?.[1];
    if (!server) return null;
  }
  return /^[a-z]+:\/\//i.test(server) ? server : `http://${server}`;
}

let cached: { at: number; info: ProxyInfo | null } | null = null;

function detectProxy(): ProxyInfo | null {
  if (cached && Date.now() - cached.at < 30_000) return cached.info;
  let info: ProxyInfo | null = null;
  if (envProxyUrl) {
    info = { url: envProxyUrl, source: 'env', agent: new EnvHttpProxyAgent() };
  } else if (process.platform === 'win32') {
    try {
      const out = execFileSync('reg', ['query', String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings`], {
        encoding: 'utf8',
        timeout: 3000,
        windowsHide: true,
      });
      const url = parseWinProxy(out);
      if (url) info = cached?.info?.url === url ? cached.info : { url, source: 'system', agent: new ProxyAgent(url) };
    } catch {
      /* 读不到注册表就当没有代理 */
    }
  }
  cached = { at: Date.now(), info };
  return info;
}

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

export function isAllowedTarget(raw: string, method: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: '目标地址不合法' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, reason: '只支持 http/https' };
  if (url.protocol === 'https:' && (LLM_HOSTS.has(url.hostname) || API_HOSTS.has(url.hostname))) return { ok: true, url };
  // 自定义 OpenAI 兼容端点（允许本机的 Ollama / LM Studio 等）
  if (method === 'POST' && /\/chat\/completions\/?$/.test(url.pathname)) return { ok: true, url };
  return { ok: false, reason: `目标不在白名单：${url.hostname}` };
}

function isConnRefused(e: unknown): boolean {
  const s = String((e as any)?.cause?.code ?? (e as any)?.code ?? (e as any)?.message ?? '');
  return /ECONNREFUSED|ECONNRESET|EHOSTUNREACH|UND_ERR_CONNECT/i.test(s);
}

async function upstream(url: string, init: Parameters<typeof ufetch>[1]) {
  // 本机 / 内网地址（如本机 Ollama）永远直连，不经系统代理
  const proxy = PRIVATE_HOST.test(new URL(url).hostname) ? null : detectProxy();
  if (proxy) {
    try {
      return await ufetch(url, { ...init, dispatcher: proxy.agent });
    } catch (e) {
      if (!isConnRefused(e)) throw e; // 代理开着但目标出错 → 如实报错
      cached = null; // 代理连不上（Clash 关了）→ 下次重新探测
    }
  }
  return ufetch(url, { ...init, dispatcher: directAgent });
}

function readBody(req: IncomingMessage, limit = 30 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('请求体过大'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, obj: unknown, extra: Record<string, string> = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-PicWord-Proxy', 'ok');
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  res.end(JSON.stringify(obj));
}

function fail(res: ServerResponse, status: number, message: string) {
  sendJson(res, status, { error: message }, { 'X-PicWord-Proxy-Error': encodeURIComponent(message) });
}

function guard(req: IncomingMessage): string | null {
  if (req.headers['x-picword-proxy'] !== '1') return '缺少 X-PicWord-Proxy 请求头';
  const origin = req.headers.origin;
  if (origin) {
    const host = req.headers.host ?? '';
    if (origin !== `http://${host}` && origin !== `https://${host}`) return '跨站请求被拒绝';
  }
  return null;
}

export function createProxyHandler() {
  return async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    const path = (req.url ?? '').split('?')[0].replace(/^.*?(\/api\/)/, '/api/');
    if (!path.startsWith('/api/')) return next();
    if (!['/api/health', '/api/proxy', '/api/image'].includes(path)) return next();

    const denied = guard(req);
    if (denied) return fail(res, 403, denied);

    try {
      if (path === '/api/health') {
        const p = detectProxy();
        return sendJson(res, 200, {
          ok: true,
          envProxy: p ? p.url.replace(/\/\/[^@]*@/, '//***@') : null,
          proxySource: p?.source ?? null,
          node: process.version,
        });
      }

      if (path === '/api/proxy') {
        if (req.method !== 'POST') return fail(res, 405, '只接受 POST');
        const payload = JSON.parse(await readBody(req)) as { url: string; method?: string; headers?: Record<string, string>; body?: string };
        const method = (payload.method ?? 'GET').toUpperCase();
        if (method !== 'GET' && method !== 'POST') return fail(res, 400, '只支持 GET/POST');
        const check = isAllowedTarget(payload.url, method);
        if (!check.ok) return fail(res, 400, check.reason);
        const headers: Record<string, string> = { 'User-Agent': UA };
        for (const [k, v] of Object.entries(payload.headers ?? {})) {
          if (FORWARD_HEADERS.includes(k.toLowerCase())) headers[k] = v;
        }
        const r = await upstream(check.url.toString(), {
          method,
          headers,
          body: method === 'POST' ? payload.body : undefined,
          signal: AbortSignal.timeout(150_000),
        });
        const text = await r.text();
        res.statusCode = r.status;
        res.setHeader('Content-Type', r.headers.get('content-type') ?? 'application/json');
        res.setHeader('X-PicWord-Proxy', 'ok');
        res.setHeader('Cache-Control', 'no-store');
        return res.end(text);
      }

      if (path === '/api/image') {
        if (req.method !== 'GET') return fail(res, 405, '只接受 GET');
        const target = new URL(req.url ?? '', 'http://x').searchParams.get('url') ?? '';
        let url: URL;
        try {
          url = new URL(target);
        } catch {
          return fail(res, 400, '图片地址不合法');
        }
        if (!/^https?:$/.test(url.protocol) || PRIVATE_HOST.test(url.hostname)) return fail(res, 400, '不允许的图片地址');
        const r = await upstream(url.toString(), { headers: { 'User-Agent': UA, Accept: 'image/*' }, signal: AbortSignal.timeout(60_000) });
        const type = r.headers.get('content-type') ?? '';
        if (!r.ok) return fail(res, 502, `图片源返回 HTTP ${r.status}`);
        if (!type.startsWith('image/')) return fail(res, 415, `不是图片（${type || '未知类型'}）`);
        const len = Number(r.headers.get('content-length') ?? 0);
        if (len > MAX_IMAGE_BYTES) return fail(res, 413, '图片超过 15 MB');
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > MAX_IMAGE_BYTES) return fail(res, 413, '图片超过 15 MB');
        res.statusCode = 200;
        res.setHeader('Content-Type', type);
        res.setHeader('X-PicWord-Proxy', 'ok');
        res.setHeader('Cache-Control', 'private, max-age=86400');
        return res.end(buf);
      }
    } catch (e) {
      const msg = (e as Error)?.name === 'TimeoutError' ? '上游请求超时' : `${(e as Error)?.message ?? e}${(e as any)?.cause?.code ? ` (${(e as any).cause.code})` : ''}`;
      return fail(res, 502, msg);
    }
    return next();
  };
}

export function picwordProxy(): Plugin {
  const handler = createProxyHandler();
  return {
    name: 'picword-proxy',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
