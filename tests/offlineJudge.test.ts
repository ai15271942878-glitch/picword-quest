import { describe, expect, it } from 'vitest';
import { judgeOffline, makeHint, maskWord, recommendOffline } from '../src/engine/offlineJudge';
import { computeWeightedScore } from '../src/engine/scoring';
import type { Level } from '../src/types';

const level: Pick<Level, 'coreWords' | 'advWords' | 'weakWords'> = {
  coreWords: [
    { word: 'tomato', pos: 'n.', meaning: '番茄', relevance: 95 },
    { word: 'knife', pos: 'n.', meaning: '刀', relevance: 92 },
    { word: 'cutting board', pos: 'n.', meaning: '砧板', relevance: 90, alts: ['chopping board'] },
    { word: 'taxi', pos: 'n.', meaning: '出租车', relevance: 88, alts: ['cab'] },
    { word: 'passport', pos: 'n.', meaning: '护照', relevance: 86 },
    { word: 'ice cream', pos: 'n.', meaning: '冰淇淋', relevance: 85 },
    { word: 'person', pos: 'n.', meaning: '人', relevance: 80 },
  ],
  advWords: [
    { word: 'chop', pos: 'v.', meaning: '切碎', relevance: 85 },
    { word: 'boarding', pos: 'v.', meaning: '登机', relevance: 78 },
    { word: 'busy', pos: 'adj.', meaning: '繁忙的', relevance: 75 },
  ],
  weakWords: [{ word: 'recipe', pos: 'n.', meaning: '食谱', relevance: 55 }],
};

const judge = (words: string[]) => judgeOffline(words, level);

describe('离线判卷：精确与变形', () => {
  it('原形精确命中', () => {
    const [j] = judge(['Tomato']);
    expect(j.status).toBe('correct');
    expect(j.tier).toBe('core');
    expect(j.relevance).toBe(95);
    expect(j.meaning).toBe('番茄');
  });
  it('复数 / 不规则复数', () => {
    expect(judge(['tomatoes'])[0].status).toBe('correct');
    expect(judge(['knives'])[0].status).toBe('correct');
    expect(judge(['people'])[0].status).toBe('correct');
  });
  it('动词变形：chopping / chopped', () => {
    expect(judge(['chopping'])[0].status).toBe('correct');
    expect(judge(['chopped'])[0].word).toBe('chop');
  });
  it('词库是 -ing 形式，玩家写原形也算', () => {
    const [j] = judge(['board']);
    expect(j.status).toBe('correct');
    expect(j.word).toBe('boarding');
  });
  it('比较级：busier', () => expect(judge(['busier'])[0].status).toBe('correct'));
  it('短语：连字符 / 连写 / 复数', () => {
    expect(judge(['cutting-boards'])[0].status).toBe('correct');
    expect(judge(['icecream'])[0].status).toBe('correct');
  });
  it('同义词 alts 按同一个词条计', () => {
    const [j] = judge(['cab']);
    expect(j.status).toBe('correct');
    expect(j.word).toBe('taxi');
    expect(j.note).toContain('同义词');
  });
});

describe('离线判卷：拼写纠错', () => {
  it('编辑距离 1 → typo，给出正确拼写', () => {
    const [j] = judge(['pasport']);
    expect(j.status).toBe('typo');
    expect(j.word).toBe('passport');
    expect(j.note).toContain('passport');
  });
  it('错误的复数拼法 tomatos → typo（而不是被剥成 tomato 判对）', () => {
    const [j] = judge(['tomatos']);
    expect(j.status).toBe('typo');
    expect(j.word).toBe('tomatoes');
  });
  it('相邻换位 knfie → typo', () => expect(judge(['knfie'])[0].status).toBe('typo'));
  it('短词（< 4 个字母）不做模糊匹配', () => expect(judge(['cav'])[0].status).toBe('unknown'));
  it('编辑距离 2 → 未收录 + 你是不是想写', () => {
    const [j] = judge(['pasprt']);
    expect(j.status).toBe('unknown');
    expect(j.note).toContain('passport');
  });
  it('完全无关词 → unknown, relevance 0', () => {
    const [j] = judge(['elephant']);
    expect(j.status).toBe('unknown');
    expect(j.relevance).toBe(0);
  });
});

describe('离线判卷：重复与计分联动', () => {
  it('taxi + cab 只计一次', () => {
    const js = judge(['taxi', 'cab']);
    expect(js[0].status).toBe('correct');
    expect(js[1].status).toBe('duplicate');
  });
  it('先 typo 后写对：保留正确的那个', () => {
    const js = judge(['pasport', 'passport']);
    expect(js[0].status).toBe('duplicate');
    expect(js[1].status).toBe('correct');
  });
  it('端到端：5 个达标词，N_pass=6 → 50 分', () => {
    const js = judge(['tomato', 'knife', 'taxi', 'passport', 'chop', 'recipe', 'cab']);
    const s = computeWeightedScore(js, 6);
    expect(s.nValid).toBe(5); // recipe 关联度 55 不计，cab 与 taxi 重复
    expect(s.total).toBe(50);
  });
});

describe('拓展词与提示', () => {
  it('推荐词不含已写出的词，也不含弱联想词', () => {
    const js = judge(['tomato', 'cab']);
    const rec = recommendOffline(level, [], js);
    const words = rec.map((r) => r.word);
    expect(words).not.toContain('tomato');
    expect(words).not.toContain('taxi');
    expect(words).not.toContain('recipe');
    expect(words.length).toBeGreaterThan(0);
  });
  it('掩码：traffic light → t______ l____', () => expect(maskWord('traffic light')).toBe('t______ l____'));
  it('提示只给没写出的核心词', () => {
    const h = makeHint(level, [], ['tomato', 'knife', 'cutting board', 'taxi', 'passport', 'ice cream'], [], () => 0);
    expect(h?.word).toBe('person');
  });
});
