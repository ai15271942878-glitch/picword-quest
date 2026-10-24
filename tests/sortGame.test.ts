import { describe, expect, it } from 'vitest';
import { SEED_BY_ID } from '../src/data/seedLevels';
import { normalizeWord } from '../src/engine/morph';
import {
  buildQueue, emptyProgress, isStageUnlocked, pickScenes, pointsFor, recordResult, summarize, uniqueWords,
  type SortAnswer, type SortWord,
} from '../src/engine/sortGame';
import type { Level } from '../src/types';

const lv = (k: string) => SEED_BY_ID.get(`seed-${k}`)! as Level;
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

describe('场景分拣：出词', () => {
  const scenes = [lv('kitchen'), lv('cafe'), lv('snow')];
  const per = uniqueWords(scenes);

  it('每个场景都有足够的独有词', () => {
    for (const ws of per) expect(ws.length).toBeGreaterThanOrEqual(6);
  });

  it('出的词不会出现在其他场景的词库里（含同义词）', () => {
    per.forEach((ws, i) => {
      for (const w of ws) {
        scenes.forEach((other, j) => {
          if (j === i) return;
          const forms = new Set([...other.coreWords, ...other.advWords, ...other.weakWords].flatMap((e) => [e.word, ...(e.alts ?? [])]).map(normalizeWord));
          expect(forms.has(normalizeWord(w.word)), `${w.word} 也在 ${other.title}`).toBe(false);
        });
      }
    });
  });

  it('队列：各场景平均、数量正确', () => {
    const q = buildQueue(per, 18, seeded(7));
    expect(q).toHaveLength(18);
    const counts = [0, 1, 2].map((i) => q.filter((w) => w.scene === i).length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('挑场景：从通关关卡里挑出指定数量、互不重复', () => {
    const passed = ['kitchen', 'cafe', 'snow', 'park', 'airport', 'office'].map(lv);
    const pick = pickScenes(passed, 4, seeded(3));
    expect(new Set(pick.map((l) => l.id)).size).toBe(4);
  });
});

describe('场景分拣：计分与过关', () => {
  const w: SortWord = { word: 'x', meaning: '', pos: 'n.', scene: 0 };
  const ans = (outcome: SortAnswer['outcome'], ms = 1000): SortAnswer => ({ word: w, outcome, chosen: outcome === 'miss' ? null : 0, ms });

  it('越快分越高；连击加成最多 ×2；答错 −50', () => {
    expect(pointsFor('correct', 0, 6000, 0)).toBe(200);
    expect(pointsFor('correct', 3000, 6000, 0)).toBe(150);
    expect(pointsFor('correct', 3000, 6000, 5)).toBe(225);
    expect(pointsFor('correct', 3000, 6000, 50)).toBe(300);
    expect(pointsFor('wrong', 100, 6000, 3)).toBe(-50);
    expect(pointsFor('miss', 6000, 6000, 3)).toBe(0);
  });

  it('星级：⭐⭐⭐ 要 95% 且平均 2 秒内；漏掉超过 3 个不过关', () => {
    expect(summarize(Array.from({ length: 20 }, () => ans('correct', 1500)), 6000).stars).toBe(3);
    const r90 = summarize([...Array.from({ length: 18 }, () => ans('correct', 2500)), ans('wrong'), ans('wrong')], 6000);
    expect([r90.passed, r90.stars]).toEqual([true, 2]);
    const missy = summarize([...Array.from({ length: 16 }, () => ans('correct')), ...Array.from({ length: 4 }, () => ans('miss'))], 6000);
    expect(missy.passed).toBe(false);
    expect(summarize([ans('correct'), ans('wrong'), ans('correct'), ans('correct')], 6000).maxCombo).toBe(2);
  });

  it('拿到 ⭐⭐ 解锁下一阶，最好成绩只升不降', () => {
    let p = emptyProgress();
    expect(isStageUnlocked(p, 2)).toBe(false);
    p = recordResult(p, 1, { total: 3000, stars: 2 } as never);
    expect(isStageUnlocked(p, 2)).toBe(true);
    p = recordResult(p, 1, { total: 1000, stars: 1 } as never);
    expect(p.best[1]).toEqual({ score: 3000, stars: 2 });
    expect(p.plays).toBe(2);
  });
});
