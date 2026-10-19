import { describe, expect, it } from 'vitest';
import { levenshtein, typoDistance } from '../src/engine/levenshtein';

describe('levenshtein 经典编辑距离', () => {
  it('相同 → 0', () => expect(levenshtein('kitchen', 'kitchen')).toBe(0));
  it('空串', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });
  it('kitten → sitting = 3（教科书例子）', () => expect(levenshtein('kitten', 'sitting')).toBe(3));
  it('替换 1 次', () => expect(levenshtein('pasta', 'pasto')).toBe(1));
  it('插入 1 次', () => expect(levenshtein('pasport', 'passport')).toBe(1));
  it('删除 1 次', () => expect(levenshtein('carrots', 'carots')).toBe(1));
  it('换位在经典算法里算 2 次', () => expect(levenshtein('recieve', 'receive')).toBe(2));
});

describe('OSA（换位算 1 次）', () => {
  it('recieve → receive = 1', () => expect(levenshtein('recieve', 'receive', { transpose: true })).toBe(1));
  it('typoDistance 默认带换位', () => expect(typoDistance('tabel', 'table')).toBe(1));
  it('max 提前终止', () => expect(levenshtein('abcdefgh', 'zzzzzzzz', { max: 2 })).toBe(3));
  it('长度差超过 max 直接返回 max+1', () => expect(typoDistance('a', 'abcdef', 2)).toBe(3));
});
