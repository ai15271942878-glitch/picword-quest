// ============================================================
// 多模型供应商定义（PRD 模块二）
// 前 3 家是 OpenAI 兼容格式；Gemini 是 Google 自家格式；另加一个
// 【新增】“自定义 OpenAI 兼容”入口，方便接任何中转 / 新模型。
//
// 2026-10-15 实测：四家官方接口都支持浏览器跨域（预检 + 含 401 在内的
// 实际响应都带 Access-Control-Allow-Origin），所以默认浏览器直连，
// 本地代理只做兜底 —— 纯静态部署（GitHub Pages / Netlify）也能完整使用 AI。
// 自定义端点的跨域情况未知，仍是“有代理先走代理”。
// ============================================================

export type ProviderId = 'deepseek' | 'qwen' | 'glm' | 'gemini' | 'custom';

export interface ProviderDef {
  id: ProviderId;
  label: string;
  kind: 'openai' | 'gemini';
  /** openai：完整 chat/completions 地址；gemini：models 根路径 */
  endpoint: string;
  defaultModel: string;
  /** 默认视觉模型（空 = 不支持看图） */
  visionModel: string;
  modelHints: string[];
  /** 是否支持 JSON 模式（不支持时会自动去掉参数重试） */
  jsonMode: boolean;
  /** auto 通道下是否优先浏览器直连（允许 CORS 且可能需要系统代理的服务） */
  preferDirect: boolean;
  keyUrl: string;
  note: string;
}

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    kind: 'openai',
    endpoint: 'https://api.deepseek.com/chat/completions',
    defaultModel: 'deepseek-chat',
    visionModel: '',
    modelHints: ['deepseek-chat', 'deepseek-v4-flash', 'deepseek-v4-pro'],
    jsonMode: true,
    preferDirect: true,
    keyUrl: 'https://platform.deepseek.com/api_keys',
    note: '纯文本模型：靠关卡的画面描述 sceneDesc “看图”。国内直连，便宜稳定。',
  },
  qwen: {
    id: 'qwen',
    label: '通义千问',
    kind: 'openai',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    defaultModel: 'qwen-plus',
    visionModel: 'qwen-vl-plus',
    modelHints: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen-vl-plus', 'qwen-vl-max'],
    jsonMode: true,
    preferDirect: true,
    keyUrl: 'https://bailian.console.aliyun.com/',
    note: '文本用 qwen-plus；看图用 qwen-vl-plus（同一个 Key）。',
  },
  glm: {
    id: 'glm',
    label: '智谱清言',
    kind: 'openai',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    defaultModel: 'glm-4-flash',
    visionModel: 'glm-4v-flash',
    modelHints: ['glm-4-flash', 'glm-4-plus', 'glm-4v-flash', 'glm-4v-plus'],
    jsonMode: true,
    preferDirect: true,
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    note: 'glm-4-flash / glm-4v-flash 有免费额度。',
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    kind: 'gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    defaultModel: 'gemini-2.5-flash',
    visionModel: 'gemini-2.5-flash',
    modelHints: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'],
    jsonMode: true,
    preferDirect: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    note: '原生多模态，能直接看图。国内需要系统代理（浏览器直连会自动走代理）。',
  },
  custom: {
    id: 'custom',
    label: '自定义（OpenAI 兼容）',
    kind: 'openai',
    endpoint: '',
    defaultModel: '',
    visionModel: '',
    modelHints: [],
    jsonMode: true,
    preferDirect: false,
    keyUrl: '',
    note: '填完整的 …/v1/chat/completions 地址与模型名，可接任何 OpenAI 兼容服务。',
  },
};

export const PROVIDER_LIST = Object.values(PROVIDERS);
