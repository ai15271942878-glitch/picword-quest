import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteDict, importDictPack, pinyinPrefix, plainPinyin, readPackHeader, searchDict, searchDictRanked } from '../src/services/dictionary';
import { lookupGameVocab, onlineDictLinks } from '../src/services/vocabLookup';
import { db, getSetting } from '../src/services/db';
import type { DictEntry, DictMeta } from '../src/types';

const ENTRIES: DictEntry[] = [
  { id: 1, en: 'blazer', zh: '休闲上衣', py: 'xiūxián shàngyī', page: 3 },
  { id: 2, en: 'sports jacket', zh: '粗呢夹克', py: 'cūnījiákè', page: 3 },
  { id: 3, en: 'jacket', zh: '夹克', page: 7 },
  { id: 4, en: 'windcheater', zh: '防风夹克', py: 'fángfēngjiákè', page: 3 },
  { id: 5, en: 'boxer shorts', zh: '短衬裤', page: 3 },
  { id: 6, en: 'shorts', zh: '短裤', page: 3 },
];
const en = (q: string) => searchDict(ENTRIES, q).map((e) => e.en);

describe('searchDict 搜索排序', () => {
  it('完全命中排第一，再按开头匹配、整词包含', () => expect(en('jacket')).toEqual(['jacket', 'sports jacket']));
  it('复数 / 大小写还原', () => {
    expect(en('Jackets')[0]).toBe('jacket');
    expect(en('blazers')).toEqual(['blazer']);
  });
  it('词组里的单词', () => expect(en('shorts')).toEqual(['shorts', 'boxer shorts']));
  it('中文：完全命中在前，其余按包含匹配', () => {
    const zh = searchDict(ENTRIES, '夹克').map((e) => e.zh);
    expect(zh[0]).toBe('夹克');
    expect(zh.slice(1).sort()).toEqual(['粗呢夹克', '防风夹克'].sort());
    expect(searchDict(ENTRIES, '短').map((e) => e.zh)).toEqual(['短裤', '短衬裤']);
  });
  it('拼音（不带声调）', () => expect(en('xiuxian')).toEqual(['blazer']));
  it('空查询 / 无匹配', () => {
    expect(en('  ')).toEqual([]);
    expect(en('zebra')).toEqual([]);
  });
  it('plainPinyin 去声调', () => expect(plainPinyin('Xiūxián shàngyī')).toBe('xiuxianshangyi'));
});

function makePack(name: string, pages: { page: number; bytes: number[] }[], entries: DictEntry[]): Blob {
  let offset = 0;
  const meta = pages.map((p) => {
    const m = { page: p.page, offset, length: p.bytes.length, mime: 'image/jpeg', width: 10, height: 20 };
    offset += p.bytes.length;
    return m;
  });
  const header = new TextEncoder().encode(JSON.stringify({ name, pages: meta, entries }));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, header.length, true);
  return new Blob([new TextEncoder().encode('PWDICT1\n'), len, header, ...pages.map((p) => new Uint8Array(p.bytes))]);
}

describe('.pwdict 词典包', () => {
  beforeEach(() => deleteDict());

  it('读取头部', async () => {
    const { header, dataStart } = await readPackHeader(makePack('测试', [{ page: 1, bytes: [1, 2, 3] }], []));
    expect(header.name).toBe('测试');
    expect(dataStart).toBeGreaterThan(12);
  });

  it('不是词典包 / 文件不完整 → 报错', async () => {
    await expect(readPackHeader(new Blob(['hello world, not a pack']))).rejects.toThrow('不是有效的词典包');
    const pack = makePack('x', [{ page: 1, bytes: [1, 2, 3, 4, 5] }], []);
    await expect(importDictPack(pack.slice(0, pack.size - 2), 'x.pwdict')).rejects.toThrow('不完整');
  });

  it('导入：按页切出图片、写入词条与元信息；再次导入会覆盖', async () => {
    const pack = makePack('', [{ page: 3, bytes: [9, 8, 7] }, { page: 5, bytes: [6, 5] }], [
      { en: ' blazer ', zh: '休闲上衣', page: 3, box: [0.1, 0.2, 0.3, 0.05] },
      { en: 'vest', zh: '背心', page: 5 },
    ]);
    const progress: number[] = [];
    const meta = await importDictPack(pack, '我的词典.pwdict', (d) => progress.push(d));
    expect(meta).toMatchObject({ name: '我的词典', pageCount: 2, entryCount: 2 });
    expect(progress.at(-1)).toBe(2);
    const p5 = await db.dictPages.get(5);
    expect([...new Uint8Array(await p5!.blob.arrayBuffer())]).toEqual([6, 5]);
    const rows = await db.dictEntries.toArray();
    expect(rows.map((r) => r.en)).toEqual(['blazer', 'vest']);
    expect(rows[0].box).toEqual([0.1, 0.2, 0.3, 0.05]);

    await importDictPack(makePack('新词典', [{ page: 1, bytes: [1] }], [{ en: 'socks', zh: '袜子', page: 1 }]), 'n.pwdict');
    expect(await db.dictPages.count()).toBe(1);
    expect((await db.dictEntries.toArray()).map((r) => r.en)).toEqual(['socks']);
    expect((await getSetting<DictMeta | null>('dict', null))?.name).toBe('新词典');
  });

  it('删除词典', async () => {
    await importDictPack(makePack('x', [{ page: 1, bytes: [1] }], [{ en: 'a', zh: '一', page: 1 }]), 'x.pwdict');
    await deleteDict();
    expect(await db.dictPages.count()).toBe(0);
    expect(await db.dictEntries.count()).toBe(0);
    expect(await getSetting('dict', null)).toBeNull();
  });
});

describe('中文排序与拼音音节', () => {
  const SHEEP: DictEntry[] = [
    { id: 1, en: 'okra', zh: '羊角豆', py: 'yángjiǎodòu', page: 124 },
    { id: 2, en: 'cardigan', zh: '羊毛衫', py: 'yángmáoshān', page: 34 },
    { id: 3, en: 'sheep', zh: '绵羊', py: 'miányáng', page: 187 },
    { id: 4, en: 'goat', zh: '山羊', py: 'shānyáng', page: 187 },
    { id: 5, en: 'kid', zh: '小山羊', py: 'xiǎoshānyáng', page: 187 },
    { id: 6, en: 'flock', zh: '羊群', py: 'yángqún', page: 185 },
    { id: 7, en: 'bowl', zh: '烟锅', py: 'yānguō', page: 114 },
  ];
  it('“羊”：以羊结尾的（绵羊、山羊）排在以羊开头的（羊群、羊角豆）前面，同档中文短的优先、再按页码', () => {
    expect(searchDict(SHEEP, '羊').map((e) => e.zh)).toEqual(['绵羊', '山羊', '小山羊', '羊群', '羊毛衫', '羊角豆']);
  });
  it('拼音 yang：停在音节边界的在前，yān|guō 这种跨音节的排最后', () => {
    const zh = searchDict(SHEEP, 'yang').map((e) => e.zh);
    expect(zh.at(-1)).toBe('烟锅');
    expect(zh.slice(0, 3).sort()).toEqual(['羊群', '羊角豆', '羊毛衫'].sort());
  });
  it('pinyinPrefix', () => {
    expect(pinyinPrefix('yángjiǎodòu', 'yang')).toBe(2);
    expect(pinyinPrefix('yānguō', 'yang')).toBe(1);
    expect(pinyinPrefix('yānguō', 'yanguo')).toBe(2);
    expect(pinyinPrefix('miányáng', 'yang')).toBe(0);
  });
  it('searchDictRanked 给出档位：完全一致为 0', () => {
    expect(searchDictRanked(SHEEP, 'sheep')[0]).toMatchObject({ rank: 0 });
    expect(searchDictRanked(SHEEP, '羊')[0].rank).toBe(1);
  });
});

describe('游戏词库释义 / 在线词典', () => {
  it('英文按词形还原匹配内置关卡词库（含同义词）', async () => {
    const hits = await lookupGameVocab('tomatoes');
    expect(hits[0]).toMatchObject({ word: 'tomato', meaning: '番茄' });
    expect((await lookupGameVocab('noodle')).some((h) => h.word === 'spaghetti')).toBe(true);
  });
  it('中文按释义包含匹配；查不到返回空', async () => {
    expect((await lookupGameVocab('番茄')).some((h) => h.word === 'tomato')).toBe(true);
    expect(await lookupGameVocab('zzzqqq')).toEqual([]);
  });
  it('在线词典链接会转义', () => {
    expect(onlineDictLinks('ice cream')[0].url).toBe('https://dict.youdao.com/result?word=ice%20cream&lang=en');
    expect(onlineDictLinks('羊')[1].url).toBe('https://cn.bing.com/dict/search?q=%E7%BE%8A');
  });
});
