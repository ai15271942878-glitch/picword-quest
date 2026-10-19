import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { coerceJudgeJson, coerceLevelJson, extractJson, toRelevance } from '../src/services/llm/json';
import { chat, resolveAiConfig, type AiConfig } from '../src/services/llm/client';
import { PROVIDERS } from '../src/services/llm/providers';
import { judgeWithAI, safePassCount } from '../src/services/llm/ai';
import { rankCandidates, type ImageCandidate } from '../src/services/imageSearch';
import { applyReview, initialSrs } from '../src/services/srs';
import { isAllowedTarget, parseWinProxy } from '../server/proxyPlugin';
import { DEFAULT_SETTINGS } from '../src/services/settings';
import { SEED_BY_ID } from '../src/data/seedLevels';

// ------------------------------------------------------------
describe('extractJson 容错解析', () => {
  it('```json 代码块', () => expect(extractJson('好的：\n```json\n{"a":1}\n```\n以上')).toEqual({ a: 1 }));
  it('前后有解释文字', () => expect(extractJson('结果如下 {"a":[1,2]} 希望有帮助')).toEqual({ a: [1, 2] }));
  it('字符串里有括号', () => expect(extractJson('{"note":"用 {大括号} 和 ]"}')).toEqual({ note: '用 {大括号} 和 ]' }));
  it('末尾多余逗号', () => expect(extractJson('{"a":[1,2,],}')).toEqual({ a: [1, 2] }));
  it('没有 JSON → 抛错', () => expect(() => extractJson('抱歉我不知道')).toThrow());
});

describe('字段清洗', () => {
  it('关联度：0.85 → 85、"90%" → 90、越界夹紧', () => {
    expect(toRelevance(0.85)).toBe(85);
    expect(toRelevance('90%')).toBe(90);
    expect(toRelevance(150)).toBe(100);
    expect(toRelevance('abc')).toBe(0);
  });
  it('生成关卡：分级区间夹紧、去重、小写、及格词数夹紧', () => {
    const j = coerceLevelJson({
      title: '机场安检',
      searchKeyword: 'airport security',
      passCount: 99,
      coreWords: [
        { word: 'Passport', pos: 'n.', meaning: '护照', relevance: 50 },
        { word: 'passport', pos: 'n.', meaning: '护照', relevance: 90 },
        { word: '安检', pos: 'n.', meaning: 'x', relevance: 90 },
      ],
      advWords: [{ word: 'scan', pos: 'v.', meaning: '扫描', relevance: 99 }],
      weakWords: [{ word: 'travel', pos: 'v.', meaning: '旅行', relevance: 95 }],
    });
    expect(j.coreWords).toHaveLength(1); // 去重 + 非英文剔除
    expect(j.coreWords[0]).toMatchObject({ word: 'passport', relevance: 75 }); // core 下限 75
    expect(j.advWords[0].relevance).toBe(95); // adv 上限 95
    expect(j.weakWords[0].relevance).toBe(69); // weak 上限 69
    expect(j.passCount).toBe(40);
  });
  it('判卷输出：status 规范化', () => {
    const r = coerceJudgeJson({ judgments: [{ input: 'x', status: 'TYPO', relevance: 0.9 }, { input: 'y', status: 'wrong' }] });
    expect(r.items[0]).toMatchObject({ status: 'typo', relevance: 90 });
    expect(r.items[1].status).toBe('invalid');
  });
  it('及格词数不超过可达上限的 2/3', () => {
    expect(safePassCount({ passCount: 25, coreWords: new Array(15).fill(0) as any, advWords: new Array(10).fill(0) as any })).toBe(16);
  });
});

// ------------------------------------------------------------
type FetchCall = { url: string; init: RequestInit };
let calls: FetchCall[] = [];
function mockFetch(responder: (call: FetchCall) => { status?: number; body: unknown }) {
  calls = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const call = { url: String(url), init };
    if (String(url).includes('api/health')) throw new TypeError('no proxy in tests');
    calls.push(call);
    const { status = 200, body } = responder(call);
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  });
}

const cfgOf = (id: 'deepseek' | 'gemini'): AiConfig => ({
  provider: PROVIDERS[id],
  apiKey: 'test-key',
  model: PROVIDERS[id].defaultModel,
  visionModel: PROVIDERS[id].visionModel,
  endpoint: PROVIDERS[id].endpoint,
  transport: 'direct',
});

describe('Multi-LLM 适配器', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('resolveAiConfig：没有 Key 返回 null', () => {
    expect(resolveAiConfig({ ...DEFAULT_SETTINGS })).toBeNull();
    expect(resolveAiConfig({ ...DEFAULT_SETTINGS, keys: { deepseek: 'sk' } })?.model).toBe('deepseek-chat');
  });

  it('OpenAI 兼容：Bearer 鉴权 + JSON 模式 + 解析 choices', async () => {
    mockFetch(() => ({ body: { choices: [{ message: { content: '{"ok":true}' } }] } }));
    const out = await chat(cfgOf('deepseek'), [{ role: 'user', content: 'hi' }], { json: true });
    expect(out).toBe('{"ok":true}');
    expect(calls[0].url).toBe('https://api.deepseek.com/chat/completions');
    expect((calls[0].init.headers as any).Authorization).toBe('Bearer test-key');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.model).toBe('deepseek-chat');
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('400 时去掉可选参数（JSON 模式）自动重试', async () => {
    mockFetch((c) => {
      const body = JSON.parse(String(c.init.body));
      return body.response_format
        ? { status: 400, body: { error: { message: 'response_format not supported' } } }
        : { body: { choices: [{ message: { content: 'plain' } }] } };
    });
    const out = await chat(cfgOf('deepseek'), [{ role: 'user', content: 'hi' }], { json: true });
    expect(out).toBe('plain');
    expect(calls).toHaveLength(2);
  });

  it('401 → 中文错误提示', async () => {
    mockFetch(() => ({ status: 401, body: { error: { message: 'invalid key' } } }));
    await expect(chat(cfgOf('deepseek'), [{ role: 'user', content: 'hi' }])).rejects.toThrow(/API Key 无效/);
  });

  it('Gemini：URL / 头 / systemInstruction / inline_data / 关闭 thinking', async () => {
    mockFetch(() => ({ body: { candidates: [{ content: { parts: [{ text: '{"a":' }, { text: '1}' }] } }] } }));
    const out = await chat(
      cfgOf('gemini'),
      [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'look', image: { mime: 'image/jpeg', base64: 'AAAA' } },
      ],
      { json: true, vision: true },
    );
    expect(out).toBe('{"a":1}');
    expect(calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect((calls[0].init.headers as any)['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.systemInstruction.parts[0].text).toBe('sys');
    expect(body.contents[0].parts[0].inline_data).toEqual({ mime_type: 'image/jpeg', data: 'AAAA' });
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it('智谱看图：image_url 用纯 base64；通义用 data URL', async () => {
    mockFetch(() => ({ body: { choices: [{ message: { content: 'ok' } }] } }));
    const img = { mime: 'image/jpeg', base64: 'QUJD' };
    const glm: AiConfig = { ...cfgOf('deepseek'), provider: PROVIDERS.glm, endpoint: PROVIDERS.glm.endpoint, visionModel: 'glm-4v-flash' };
    await chat(glm, [{ role: 'user', content: 'x', image: img }], { vision: true });
    let body = JSON.parse(String(calls[0].init.body));
    expect(body.model).toBe('glm-4v-flash');
    expect(body.messages[0].content[0].image_url.url).toBe('QUJD');
    const qwen: AiConfig = { ...glm, provider: PROVIDERS.qwen, endpoint: PROVIDERS.qwen.endpoint, visionModel: 'qwen-vl-plus' };
    await chat(qwen, [{ role: 'user', content: 'x', image: img }], { vision: true });
    body = JSON.parse(String(calls[1].init.body));
    expect(body.messages[0].content[0].image_url.url).toBe('data:image/jpeg;base64,QUJD');
  });
});

// ------------------------------------------------------------
describe('AI 判卷后处理', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('对齐输入、同义词去重、漏判补判、沉淀新词、推荐去重', async () => {
    const level = SEED_BY_ID.get('seed-kitchen')!;
    const aiOut = {
      judgments: [
        { input: 'tomatos', word: 'tomatoes', status: 'typo', pos: 'n.', meaning: '番茄', relevance: 95, tier: 'core' },
        { input: 'noodle', word: 'noodle', status: 'correct', pos: 'n.', meaning: '面条', relevance: 88, tier: 'core' },
        { input: 'spaghetti', word: 'spaghetti', status: 'correct', pos: 'n.', meaning: '意大利面', relevance: 95, tier: 'core' },
        { input: 'cupboard', word: 'cupboard', status: 'correct', pos: 'n.', meaning: '橱柜', relevance: 72, tier: 'core' },
        // 'basil' 被 AI 漏掉了
      ],
      recommendations: [
        { word: 'tomato', pos: 'n.', meaning: '番茄', relevance: 95, tier: 'core' },
        { word: 'knife', pos: 'n.', meaning: '刀', relevance: 92, tier: 'core' },
      ],
    };
    mockFetch(() => ({ body: { choices: [{ message: { content: JSON.stringify(aiOut) } }] } }));
    const r = await judgeWithAI(cfgOf('deepseek'), level, ['tomatos', 'noodle', 'spaghetti', 'cupboard', 'basil'], []);
    const by = Object.fromEntries(r.judgments.map((j) => [j.input, j]));
    expect(by.tomatos.status).toBe('typo');
    // noodle 是 spaghetti 的同义词 → 同为 correct 时保留先写的，后写的标重复
    expect(by.noodle.status).toBe('correct');
    expect(by.spaghetti.status).toBe('duplicate');
    // AI 漏判 basil → 离线补判
    expect(by.basil.status).toBe('correct');
    expect(by.basil.note).toContain('AI 漏判');
    // 词库外的 cupboard 被沉淀
    expect(r.learned.map((w) => w.word)).toEqual(['cupboard']);
    // 推荐里去掉了玩家已写的 tomato
    expect(r.recommendations.map((x) => x.word)).not.toContain('tomato');
    expect(r.recommendations.map((x) => x.word)).toContain('knife');
  });
});

describe('AI 判卷：模型多吐出的条目不能被沉淀', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('只从与玩家输入对齐的判定里沉淀新词', async () => {
    const level = SEED_BY_ID.get('seed-library')!;
    const aiOut = {
      judgments: [
        { input: 'chandelier', word: 'chandelier', status: 'correct', pos: 'n.', meaning: '吊灯', relevance: 74, tier: 'adv' },
        // 下面两条不对应任何玩家输入（模型把规则说明也当成了输入）
        { input: 'status：', word: 'status：', status: 'correct', pos: 'n.', meaning: '状态', relevance: 78, tier: 'adv' },
        { input: 'staircase', word: 'staircase', status: 'correct', pos: 'n.', meaning: '楼梯', relevance: 80, tier: 'core' },
      ],
      recommendations: [],
    };
    mockFetch(() => ({ body: { choices: [{ message: { content: JSON.stringify(aiOut) } }] } }));
    const r = await judgeWithAI(cfgOf('deepseek'), level, ['chandelier'], []);
    expect(r.judgments).toHaveLength(1);
    expect(r.learned.map((w) => w.word)).toEqual(['chandelier']);
  });
});

// ------------------------------------------------------------
describe('图库候选排序', () => {
  const mk = (id: string, title: string, tags: string[] = [], curated = false): ImageCandidate => ({
    id, provider: 'openverse', url: id, thumb: id, width: 1500, height: 1000, title, description: '', tags, author: '', license: '', pageUrl: '', curated, score: 0,
  });
  it('词库命中多的排前面', () => {
    const ranked = rankCandidates(
      [mk('a', 'Sunset over sea'), mk('b', 'Airport security checkpoint', ['passport', 'tray', 'scanner'])],
      ['airport security'],
      { core: ['passport', 'tray', 'scanner', 'officer'], adv: [] },
    );
    expect(ranked[0].id).toBe('b');
  });
});

describe('代理白名单', () => {
  it('放行已知大模型 / 图库', () => {
    expect(isAllowedTarget('https://api.deepseek.com/chat/completions', 'POST').ok).toBe(true);
    expect(isAllowedTarget('https://api.openverse.org/v1/images/?q=a', 'GET').ok).toBe(true);
  });
  it('放行自定义 chat/completions 端点（含本机 Ollama）', () => {
    expect(isAllowedTarget('https://my-relay.example.com/v1/chat/completions', 'POST').ok).toBe(true);
    expect(isAllowedTarget('http://localhost:11434/v1/chat/completions', 'POST').ok).toBe(true);
  });
  it('拒绝任意网址 / 非 http 协议', () => {
    expect(isAllowedTarget('https://evil.example.com/steal', 'GET').ok).toBe(false);
    expect(isAllowedTarget('file:///etc/passwd', 'GET').ok).toBe(false);
    expect(isAllowedTarget('https://evil.example.com/v1/chat/completions', 'GET').ok).toBe(false);
  });
});

describe('Windows 系统代理解析', () => {
  const reg = (enable: string, server: string) =>
    `\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\r\n    ProxyEnable    REG_DWORD    ${enable}\r\n    ProxyServer    REG_SZ    ${server}\r\n`;
  it('Clash 系统代理：127.0.0.1:7890 → http://127.0.0.1:7890', () => expect(parseWinProxy(reg('0x1', '127.0.0.1:7890'))).toBe('http://127.0.0.1:7890'));
  it('分协议写法优先取 https', () => expect(parseWinProxy(reg('0x1', 'http=127.0.0.1:7890;https=127.0.0.1:7891'))).toBe('http://127.0.0.1:7891'));
  it('ProxyEnable = 0 → 无代理', () => expect(parseWinProxy(reg('0x0', '127.0.0.1:7890'))).toBeNull());
  it('ProxyEnable = 0x10 不能被误判为开启', () => expect(parseWinProxy(reg('0x10', '127.0.0.1:7890'))).toBeNull());
});

describe('间隔复习（Leitner）', () => {
  it('答对升盒、拼错留盒、答错回 1 号盒', () => {
    const now = 1_000_000;
    let s = initialSrs(now);
    s = applyReview(s, 'good', now);
    expect(s.box).toBe(1);
    expect(s.due).toBe(now + 86_400_000);
    s = applyReview(s, 'good', now);
    expect(s.box).toBe(2);
    s = applyReview(s, 'almost', now);
    expect(s.box).toBe(2);
    s = applyReview(s, 'again', now);
    expect(s).toMatchObject({ box: 1, due: now, lapses: 1, reviews: 4 });
  });
});
