import { describe, expect, it } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { SEED_LEVELS } from '../src/data/seedLevels';
import { buildIndex, judgeOffline, qualifiedEntryCount } from '../src/engine/offlineJudge';
import { normalizeWord } from '../src/engine/morph';

describe('种子关卡池数据质量', () => {
  it('至少 20 关，id 唯一', () => {
    expect(SEED_LEVELS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(SEED_LEVELS.map((l) => l.id)).size).toBe(SEED_LEVELS.length);
  });

  for (const level of SEED_LEVELS) {
    describe(`${level.title}（${level.id}）`, () => {
      it('词数：core ≥ 15、adv ≥ 10、weak ≥ 5', () => {
        expect(level.coreWords.length).toBeGreaterThanOrEqual(15);
        expect(level.advWords.length).toBeGreaterThanOrEqual(10);
        expect(level.weakWords.length).toBeGreaterThanOrEqual(5);
      });

      it('关联度分档：core/adv ≥ 70，weak < 70，字段完整', () => {
        for (const w of [...level.coreWords, ...level.advWords]) {
          expect(w.relevance, w.word).toBeGreaterThanOrEqual(70);
          expect(w.relevance, w.word).toBeLessThanOrEqual(100);
        }
        for (const w of level.weakWords) expect(w.relevance, w.word).toBeLessThan(70);
        for (const w of [...level.coreWords, ...level.advWords, ...level.weakWords]) {
          expect(w.word, JSON.stringify(w)).toBeTruthy();
          expect(w.pos, w.word).toBeTruthy();
          expect(w.meaning, w.word).toBeTruthy();
          expect(Number.isFinite(w.relevance), w.word).toBe(true);
        }
      });

      it('词条与同义词互不“撞车”（每个写法都命中自己的词条）', () => {
        const index = buildIndex(level);
        const clashes: string[] = [];
        for (const e of [...level.coreWords, ...level.advWords, ...level.weakWords]) {
          for (const form of [e.word, ...(e.alts ?? [])]) {
            const hit = index.exact.get(normalizeWord(form));
            if (!hit || hit.ie.entry !== e) clashes.push(`${form} → ${hit?.ie.entry.word}`);
          }
        }
        expect(clashes).toEqual([]);
      });

      it('满分可在离线词库内达成：≥70 的词条数 ≥ N_full', () => {
        expect(qualifiedEntryCount(level)).toBeGreaterThanOrEqual(level.fullCount);
      });

      it('自测：写出全部词条原形 → 全部判为 correct 且满分', () => {
        const words = [...level.coreWords, ...level.advWords].map((w) => w.word);
        const js = judgeOffline(words, level);
        expect(js.filter((j) => j.status !== 'correct').map((j) => j.input)).toEqual([]);
      });

      it('图片文件存在且大小合理', () => {
        const file = resolve(__dirname, '../public', level.imageUrl!.replace(/^\//, ''));
        expect(existsSync(file), file).toBe(true);
        expect(statSync(file).size).toBeGreaterThan(30_000);
      });
    });
  }
});
