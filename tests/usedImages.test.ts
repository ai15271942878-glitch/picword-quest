import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { imageKeysOf, isUsedImage, normalizeImageKey, preferUnused, usedImageKeys } from '../src/services/usedImages';
import { db } from '../src/services/db';

describe('AI 造关防撞图', () => {
  it('地址规范化：去掉查询参数、大小写、结尾斜杠', () => {
    expect(normalizeImageKey('https://Images.Pexels.com/photos/123/a.jpg?w=1280&h=800')).toBe('images.pexels.com/photos/123/a.jpg');
    expect(normalizeImageKey('https://www.pexels.com/photo/123/')).toBe('www.pexels.com/photo/123');
  });

  it('按图片地址或原图页面任一相同都算用过', () => {
    const used = imageKeysOf([{ imageUrl: 'https://x.org/a.jpg?size=big', credit: { pageUrl: 'https://x.org/page/1' } }]);
    expect(isUsedImage({ url: 'https://x.org/a.jpg', pageUrl: 'https://y.org/other' }, used)).toBe(true);
    expect(isUsedImage({ url: 'https://cdn.x.org/b.jpg', pageUrl: 'https://x.org/page/1/' }, used)).toBe(true);
    expect(isUsedImage({ url: 'https://x.org/c.jpg', pageUrl: 'https://x.org/page/2' }, used)).toBe(false);
  });

  it('没用过的排前面，各自保持原顺序', () => {
    const used = new Set(['x.org/2.jpg']);
    const c = (n: number) => ({ id: String(n), url: `https://x.org/${n}.jpg`, pageUrl: `https://x.org/p/${n}` });
    const r = preferUnused([c(1), c(2), c(3)], used);
    expect(r.list.map((x) => x.id)).toEqual(['1', '3', '2']);
    expect(r.usedCount).toBe(1);
  });

  it('关卡库和内置总库都算在内', async () => {
    await db.levels.put({
      id: 'ai-1', source: 'ai', title: 't', sceneDesc: '', passCount: 3, fullCount: 5, coreWords: [], advWords: [], weakWords: [], createdAt: 1,
      imageUrl: 'https://live.staticflickr.com/1/abc.jpg', credit: { pageUrl: 'https://www.flickr.com/photos/u/1' },
      folder: 'AI 生成', collectedAt: 1, plays: 0, bestScore: null,
    });
    const used = await usedImageKeys();
    expect(used.has('live.staticflickr.com/1/abc.jpg')).toBe(true);
    expect(used.has('stocksnap.io/photo/cooking-food-cfbfe8f090')).toBe(true); // 内置关卡「厨房备菜」
  });
});
