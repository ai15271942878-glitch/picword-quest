// ============================================================
// 统一 Multi-LLM 适配器：一个 chat() 吃遍 OpenAI 兼容 & Gemini
//   · 自动构造各家请求体（含图片：OpenAI 用 image_url，Gemini 用 inline_data）
//   · JSON 模式 / Gemini thinking 关闭等“可选参数”遇到 400 自动去掉重试
//   · 错误统一翻译成中文提示（Key 无效 / 额度不足 / 网络不通…）
// ============================================================

import type { AppSettings } from '../settings';
import { request, type HttpResult } from '../net';
import { PROVIDERS, type ProviderDef } from './providers';

export interface ChatImage {
  mime: string;
  /** 纯 base64（不带 data: 前缀） */
  base64: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  image?: ChatImage;
}

export interface ChatOptions {
  temperature?: number;
  json?: boolean;
  /** 本次调用是否用视觉模型 */
  vision?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface AiConfig {
  provider: ProviderDef;
  apiKey: string;
  model: string;
  visionModel: string;
  endpoint: string;
  transport: AppSettings['transport'];
}

export class LlmError extends Error {
  constructor(
    message: string,
    public status?: number,
    public detail?: string,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

/** 从设置里解析出当前 AI 配置；没配置好返回 null */
export function resolveAiConfig(s: AppSettings): AiConfig | null {
  const provider = PROVIDERS[s.provider];
  if (!provider) return null;
  const apiKey = (s.keys[s.provider] ?? '').trim();
  const isCustom = provider.id === 'custom';
  const endpoint = isCustom ? s.customEndpoint.trim() : provider.endpoint;
  const model = (isCustom ? s.customModel : s.models[provider.id] || provider.defaultModel).trim();
  let visionModel = '';
  if (s.useVision) {
    if (isCustom) visionModel = s.customVision ? model : '';
    else visionModel = (s.visionModels[provider.id] || provider.visionModel).trim();
  }
  if (!apiKey || !endpoint || !model) return null;
  return { provider, apiKey, model, visionModel, endpoint, transport: s.transport };
}

/** 当前配置能否看图 */
export const canSeeImages = (cfg: AiConfig | null) => !!cfg?.visionModel;

// ------------------------------------------------------------
// 请求体构造
// ------------------------------------------------------------

function buildOpenAI(cfg: AiConfig, messages: ChatMessage[], opts: ChatOptions, optional: boolean) {
  const model = opts.vision && cfg.visionModel ? cfg.visionModel : cfg.model;
  const body: Record<string, unknown> = {
    model,
    stream: false,
    temperature: opts.temperature ?? 0.3,
    messages: messages.map((m) => {
      if (!m.image) return { role: m.role, content: m.content };
      // 智谱官方示例用纯 base64；OpenAI / 通义用 data URL
      const url = cfg.provider.id === 'glm' ? m.image.base64 : `data:${m.image.mime};base64,${m.image.base64}`;
      return {
        role: m.role,
        content: [
          { type: 'image_url', image_url: { url } },
          { type: 'text', text: m.content },
        ],
      };
    }),
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (optional && opts.json && cfg.provider.jsonMode) body.response_format = { type: 'json_object' };
  return {
    url: cfg.endpoint,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify(body),
  };
}

function buildGemini(cfg: AiConfig, messages: ChatMessage[], opts: ChatOptions, optional: boolean) {
  const model = opts.vision && cfg.visionModel ? cfg.visionModel : cfg.model;
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [
        ...(m.image ? [{ inline_data: { mime_type: m.image.mime, data: m.image.base64 } }] : []),
        { text: m.content },
      ],
    }));
  const generationConfig: Record<string, unknown> = { temperature: opts.temperature ?? 0.3 };
  if (opts.maxTokens) generationConfig.maxOutputTokens = opts.maxTokens;
  if (optional) {
    if (opts.json) generationConfig.responseMimeType = 'application/json';
    // 2.5 Flash 默认会“思考”，判卷不需要，关掉更快更省
    if (/flash/i.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }
  const body: Record<string, unknown> = { contents, generationConfig };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  return {
    url: `${cfg.endpoint}/${encodeURIComponent(model)}:generateContent`,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey },
    body: JSON.stringify(body),
  };
}

// ------------------------------------------------------------
// 响应解析
// ------------------------------------------------------------

function parseOpenAI(json: any): string {
  const c = json?.choices?.[0]?.message?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((p: any) => p?.text ?? '').join('');
  throw new LlmError('模型没有返回内容', undefined, JSON.stringify(json).slice(0, 300));
}

function parseGemini(json: any): string {
  const cand = json?.candidates?.[0];
  const text = cand?.content?.parts?.map((p: any) => p?.text ?? '').join('');
  if (text) return text;
  const reason = json?.promptFeedback?.blockReason || cand?.finishReason;
  throw new LlmError(reason ? `Gemini 未返回内容（${reason}）` : 'Gemini 没有返回内容', undefined, JSON.stringify(json).slice(0, 300));
}

function errorFromHttp(r: HttpResult, provider: ProviderDef): LlmError {
  let msg = '';
  try {
    const j = JSON.parse(r.text);
    msg = j?.error?.message || j?.message || j?.error || '';
  } catch {
    msg = r.text.slice(0, 200);
  }
  const name = provider.label;
  if (r.status === 401 || r.status === 403) return new LlmError(`${name}：API Key 无效或没有权限（HTTP ${r.status}）`, r.status, msg);
  if (r.status === 402) return new LlmError(`${name}：账户余额不足（HTTP 402）`, r.status, msg);
  if (r.status === 429) return new LlmError(`${name}：请求太频繁或额度用完（HTTP 429）`, r.status, msg);
  if (r.status === 404) return new LlmError(`${name}：接口地址或模型名不存在（HTTP 404）`, r.status, msg);
  if (r.status >= 500) return new LlmError(`${name}：服务端错误（HTTP ${r.status}），稍后再试`, r.status, msg);
  return new LlmError(`${name}：请求被拒绝（HTTP ${r.status}）${msg ? '：' + String(msg).slice(0, 120) : ''}`, r.status, msg);
}

/** 统一对话接口，返回模型输出的纯文本 */
export async function chat(cfg: AiConfig, messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const build = cfg.provider.kind === 'gemini' ? buildGemini : buildOpenAI;
  const parse = cfg.provider.kind === 'gemini' ? parseGemini : parseOpenAI;

  // 第 1 次带可选参数（JSON 模式等），400 时去掉可选参数再试一次
  for (const optional of [true, false]) {
    const req = build(cfg, messages, opts, optional);
    const r = await request(
      { url: req.url, method: 'POST', headers: req.headers, body: req.body },
      { transport: cfg.transport, preferDirect: cfg.provider.preferDirect, timeoutMs: opts.timeoutMs ?? 90_000, signal: opts.signal },
    );
    if (r.ok) {
      let json: unknown;
      try {
        json = JSON.parse(r.text);
      } catch {
        throw new LlmError('模型返回的不是 JSON 响应', r.status, r.text.slice(0, 200));
      }
      return parse(json);
    }
    if (r.status === 400 && optional) continue;
    throw errorFromHttp(r, cfg.provider);
  }
  throw new LlmError('请求失败');
}

/** 连通性测试：让模型回一个固定 JSON */
export async function testConnection(cfg: AiConfig): Promise<string> {
  const t0 = performance.now();
  const out = await chat(
    cfg,
    [
      { role: 'system', content: 'You are a connectivity test. Reply with JSON only.' },
      { role: 'user', content: 'Reply exactly: {"ok": true, "word": "apple"}' },
    ],
    { json: true, temperature: 0, timeoutMs: 30_000 },
  );
  const ms = Math.round(performance.now() - t0);
  return `连接成功（${ms} ms）：${out.slice(0, 60)}`;
}
