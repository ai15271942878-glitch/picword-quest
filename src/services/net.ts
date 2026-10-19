// ============================================================
// 统一网络通道：浏览器直连 / 本地 Node 代理（Vite 中间件）自动切换
//
// 为什么要两条路？
//   · 国内大模型（DeepSeek / 通义 / 智谱）的接口不一定允许浏览器跨域（CORS），
//     走本地代理最稳；且国内直连不需要翻墙。
//   · Gemini、Wikimedia、Openverse 允许跨域，而且浏览器会自动使用系统代理
//     （Clash 等），国内访问它们反而是“浏览器直连”更容易通。
// 所以 auto 模式下：各服务按“偏好”先试一条路，网络层失败（含 CORS 拦截）再换另一条。
// HTTP 层的错误（401 / 429 / 500…）是真实的接口报错，不会触发换路。
// ============================================================

const BASE = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
export const PROXY_HEADER = 'X-PicWord-Proxy';

export type NetErrorKind = 'network' | 'timeout' | 'aborted' | 'proxy_unavailable';

export class NetError extends Error {
  constructor(
    public kind: NetErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'NetError';
  }
}

export interface HttpRequest {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
}

export interface HttpResult {
  status: number;
  ok: boolean;
  text: string;
  via: 'direct' | 'proxy';
}

export interface RequestOptions {
  transport?: 'auto' | 'proxy' | 'direct';
  /** auto 模式下是否优先直连 */
  preferDirect?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

let proxyState: boolean | null = null;

/** 探测本地代理是否存在（npm run dev / preview 时存在；纯静态部署时不存在） */
export async function probeProxy(force = false): Promise<boolean> {
  if (proxyState !== null && !force) return proxyState;
  try {
    const r = await fetch(`${BASE}api/health`, { headers: { [PROXY_HEADER]: '1' } });
    const j = r.ok ? await r.json() : null;
    proxyState = j?.ok === true;
  } catch {
    proxyState = false;
  }
  return proxyState;
}

function combineSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const t = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, t]) : t;
}

function wrapFetchError(e: unknown, signal: AbortSignal | undefined): NetError {
  const err = e as Error;
  if (signal?.aborted) return new NetError('aborted', '已取消');
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return new NetError('timeout', '请求超时');
  return new NetError('network', err?.message || '网络错误');
}

async function viaDirect(req: HttpRequest, signal: AbortSignal): Promise<HttpResult> {
  try {
    const r = await fetch(req.url, { method: req.method ?? 'GET', headers: req.headers, body: req.body, signal });
    return { status: r.status, ok: r.ok, text: await r.text(), via: 'direct' };
  } catch (e) {
    throw wrapFetchError(e, signal);
  }
}

async function viaProxy(req: HttpRequest, signal: AbortSignal): Promise<HttpResult> {
  let r: Response;
  try {
    r = await fetch(`${BASE}api/proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [PROXY_HEADER]: '1' },
      body: JSON.stringify(req),
      signal,
    });
  } catch (e) {
    throw wrapFetchError(e, signal);
  }
  // 代理不存在（静态托管时 /api/proxy 会 404 或返回 index.html）
  if (r.headers.get(PROXY_HEADER) !== 'ok') {
    proxyState = false;
    throw new NetError('proxy_unavailable', '本地代理不可用');
  }
  const proxyErr = r.headers.get('X-PicWord-Proxy-Error');
  if (proxyErr) throw new NetError('network', `代理转发失败：${decodeURIComponent(proxyErr)}`);
  return { status: r.status, ok: r.ok, text: await r.text(), via: 'proxy' };
}

/** 发请求：按 transport 选路，网络层失败自动换路 */
export async function request(req: HttpRequest, opts: RequestOptions = {}): Promise<HttpResult> {
  const { transport = 'auto', preferDirect = false, timeoutMs = 60_000 } = opts;
  const signal = combineSignals(opts.signal, timeoutMs);

  let order: ('direct' | 'proxy')[];
  if (transport === 'direct') order = ['direct'];
  else if (transport === 'proxy') order = ['proxy'];
  else {
    const hasProxy = await probeProxy();
    order = preferDirect ? ['direct', 'proxy'] : ['proxy', 'direct'];
    if (!hasProxy) order = ['direct'];
  }

  const errors: string[] = [];
  for (const way of order) {
    try {
      return way === 'direct' ? await viaDirect(req, signal) : await viaProxy(req, signal);
    } catch (e) {
      const ne = e as NetError;
      if (ne.kind === 'aborted' || ne.kind === 'timeout') throw ne;
      errors.push(`${way === 'direct' ? '直连' : '代理'}：${ne.message}`);
    }
  }
  throw new NetError('network', errors.join('；'));
}

/** 取图片二进制：先直连（CORS），失败走本地代理 /api/image */
export async function fetchImageBlob(url: string, signal?: AbortSignal): Promise<Blob> {
  if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('/') || url.startsWith(location.origin)) {
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(`图片读取失败 HTTP ${r.status}`);
    return r.blob();
  }
  try {
    const r = await fetch(url, { mode: 'cors', signal });
    if (r.ok) {
      const b = await r.blob();
      if (b.type.startsWith('image/') || b.size > 0) return b;
    }
  } catch {
    /* 跨域被拦截 → 走代理 */
  }
  if (await probeProxy()) {
    const r = await fetch(`${BASE}api/image?url=${encodeURIComponent(url)}`, { headers: { [PROXY_HEADER]: '1' }, signal });
    if (r.ok && r.headers.get(PROXY_HEADER) === 'ok') return r.blob();
    throw new Error(`图片代理下载失败 HTTP ${r.status}`);
  }
  throw new Error('图片无法跨域下载，且本地代理不可用');
}
