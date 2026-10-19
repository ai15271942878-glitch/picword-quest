import { describe, expect, it } from 'vitest';
import { adjForms, baseCandidates, inflections, inputForms, normalizeWord, pluralForms, verbForms } from '../src/engine/morph';

describe('normalizeWord', () => {
  it('大小写 / 空格 / 连字符 / 冠词', () => {
    expect(normalizeWord('  Traffic-Light ')).toBe('traffic light');
    expect(normalizeWord('a Dog')).toBe('dog');
    expect(normalizeWord('the  sun')).toBe('sun');
    expect(normalizeWord("children's")).toBe('children');
    expect(normalizeWord('Café')).toBe('cafe');
  });
  it('去掉数字与标点', () => expect(normalizeWord('bus#42!')).toBe('bus'));
});

describe('名词复数', () => {
  it('规则变化', () => {
    expect(pluralForms('box')).toEqual(['boxes']);
    expect(pluralForms('berry')).toEqual(['berries']);
    expect(pluralForms('car')).toEqual(['cars']);
    expect(pluralForms('day')).toEqual(['days']);
  });
  it('不规则', () => {
    expect(pluralForms('person')).toContain('people');
    expect(pluralForms('knife')).toEqual(['knives']);
    expect(pluralForms('tomato')).toEqual(['tomatoes']);
  });
});

describe('动词变化', () => {
  it('双写 / 去 e / ie→ying', () => {
    expect(verbForms('run')).toContain('running');
    expect(verbForms('ride')).toContain('riding');
    expect(verbForms('lie')).toContain('lying');
    expect(verbForms('chop')).toContain('chopped');
    expect(verbForms('fry')).toContain('fried');
    expect(verbForms('cook')).toEqual(expect.arrayContaining(['cooks', 'cooking', 'cooked']));
  });
  it('多音节词不双写', () => {
    expect(verbForms('open')).toContain('opening');
    expect(verbForms('open')).not.toContain('openning');
  });
  it('不规则过去式', () => {
    expect(verbForms('eat')).toEqual(expect.arrayContaining(['ate', 'eaten', 'eating']));
    expect(verbForms('sit')).toContain('sat');
  });
});

describe('形容词比较级', () => {
  it('big / busy / large', () => {
    expect(adjForms('big')).toEqual(['bigger', 'biggest']);
    expect(adjForms('busy')).toEqual(['busier', 'busiest']);
    expect(adjForms('large')).toEqual(['larger', 'largest']);
  });
});

describe('inflections 按词性生成', () => {
  it('名词短语变最后一个词', () => expect(inflections('traffic light', 'n.')).toContain('traffic lights'));
  it('of 短语变第一个词', () => expect(inflections('cup of coffee', 'n.')).toContain('cups of coffee'));
  it('动词短语变第一个词', () => expect(inflections('wait in line', 'phr.')).toContain('waiting in line'));
  it('名词不生成 -ing', () => expect(inflections('table', 'n.')).not.toContain('tabling'));
});

describe('baseCandidates 反推原形', () => {
  it('cooking → cook', () => expect(baseCandidates('cooking')).toContain('cook'));
  it('boarding → board', () => expect(baseCandidates('boarding')).toContain('board'));
  it('chopped → chop', () => expect(baseCandidates('chopped')).toContain('chop'));
  it('glass 不剥 s', () => expect(baseCandidates('glass')).not.toContain('glas'));
});

describe('inputForms', () => {
  it('英式拼写 → 美式', () => {
    expect(inputForms('colour')).toContain('color');
    expect(inputForms('centre')).toContain('center');
    expect(inputForms('Pavement')).toContain('sidewalk');
  });
  it('复合词连写', () => expect(inputForms('ice cream')).toContain('icecream'));
});
