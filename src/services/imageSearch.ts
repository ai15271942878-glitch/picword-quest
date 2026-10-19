// ============================================================
// 真实摄影图库检索（严禁 AI 绘图，PRD 模块一）
//   · Wikimedia Commons（免 Key，origin=* 跨域）
//   · Openverse（免 Key，聚合 Flickr / StockSnap / WordPress 等 CC 图）
//   · Pexels / Unsplash（填 Key 后启用，国内直连更快）
//
// 【新增】词库命中度排序：AI 先写词库、后搜图，图不一定和词对得上。
// 这里把每张候选图的标题 / 描述 / 标签与关卡词库做匹配，命中越多排得越前，
// 让“搜到的图”尽量真的包含“词库里的东西”。
// ============================================================

import { request } from './net';
import type { AppSettings } from './settings';

export type ImageProvider = 'wikimedia' | 'openverse' | 'pexels' | 'unsplash';

export interface ImageCandidate {
  id: string;
  provider: ImageProvider;
  /** 展示 / 保存用的大图（≈1280px） */
  url: string;
  /** 候选列表缩略图 */
  thumb: string;
  width: number;
  height: number;
  title: string;
  description: string;
  tags: string[];
  author: string;
  license: string;
  pageUrl: string;
  /** 精选标记（Commons 优质/特色图片、Pexels/Unsplash 库存图） */
  curated: boolean;
  score: number;
}

export const PROVIDER_LABEL: Record<ImageProvider, string> = {
  wikimedia: 'Wikimedia Commons',
  openverse: 'Openverse',
  pexels: 'Pexels',
  unsplash: 'Unsplash',
};

const BAD_TITLE = /\b(map|logo|diagram|chart|graph|icon|flag of|coat of arms|seal|plan|drawing|illustration|painting|poster|stamp|coin|scan|vector|clipart|render|3d|sketch|cartoon|infographic|screenshot)\b/i;

const stripHtml = (s: string) =>
  (s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

function okShape(w: number, h: number) {
  if (!w || !h) return false;
  const ar = w / h;
  return w >= 900 && ar >= 1.2 && ar <= 2.1;
}

async function getJson(url: string, headers: Record<string, string> | undefined, signal?: AbortSignal) {
  const r = await request({ url, method: 'GET', headers }, { preferDirect: true, timeoutMs: 25_000, signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return JSON.parse(r.text);
}

// ------------------------------------------------------------
// 各图源
// ------------------------------------------------------------

async function searchWikimedia(q: string, signal?: AbortSignal): Promise<ImageCandidate[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: `${q} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: '30',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '1280',
    iiextmetadatafilter: 'ImageDescription|Artist|LicenseShortName|Categories|ObjectName',
  });
  const d = await getJson(`https://commons.wikimedia.org/w/api.php?${params}`, undefined, signal);
  const pages = Object.values(d?.query?.pages ?? {}) as any[];
  const out: ImageCandidate[] = [];
  for (const p of pages) {
    const ii = p?.imageinfo?.[0];
    if (!ii || ii.mime !== 'image/jpeg' || !okShape(ii.width, ii.height)) continue;
    const title = String(p.title || '').replace(/^File:/, '').replace(/\.[a-z]+$/i, '');
    if (BAD_TITLE.test(title)) continue;
    const md = ii.extmetadata ?? {};
    const cats = String(md.Categories?.value ?? '');
    const url: string = ii.thumburl || ii.url;
    out.push({
      id: `wm-${p.pageid}`,
      provider: 'wikimedia',
      url,
      thumb: url.includes('/1280px-') ? url.replace('/1280px-', '/330px-') : url,
      width: ii.width,
      height: ii.height,
      title,
      description: stripHtml(md.ImageDescription?.value ?? '').slice(0, 400),
      tags: cats.split('|').slice(0, 20),
      author: stripHtml(md.Artist?.value ?? '').slice(0, 80) || '未知',
      license: md.LicenseShortName?.value ?? 'CC',
      pageUrl: ii.descriptionurl,
      curated: /Quality images|Featured pictures|Valued images/i.test(cats),
      score: 0,
    });
  }
  return out;
}

async function searchOpenverse(q: string, signal?: AbortSignal): Promise<ImageCandidate[]> {
  const run = async (photoOnly: boolean) => {
    const params = new URLSearchParams({ q, page_size: '20', aspect_ratio: 'wide', mature: 'false' });
    if (photoOnly) params.set('category', 'photograph');
    const d = await getJson(`https://api.openverse.org/v1/images/?${params}`, undefined, signal);
    return (d?.results ?? []) as any[];
  };
  let results = await run(true);
  if (results.length < 5) results = [...results, ...(await run(false))];
  const out: ImageCandidate[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (seen.has(r.id) || !okShape(r.width, r.height)) continue;
    seen.add(r.id);
    const title = String(r.title || '');
    const tags = (r.tags ?? []).map((t: any) => t?.name).filter(Boolean);
    if (BAD_TITLE.test(title) || tags.some((t: string) => /illustration|vector|clipart|drawing/i.test(t))) continue;
    out.push({
      id: `ov-${r.id}`,
      provider: 'openverse',
      url: r.url,
      thumb: r.thumbnail || r.url,
      width: r.width,
      height: r.height,
      title,
      description: '',
      tags: tags.slice(0, 30),
      author: r.creator || '未知',
      license: `${String(r.license || 'cc').toUpperCase()} ${r.license_version ?? ''}`.trim(),
      pageUrl: r.foreign_landing_url || '',
      curated: ['stocksnap', 'wordpress', 'nappy'].includes(r.source),
      score: 0,
    });
  }
  return out;
}

async function searchPexels(q: string, key: string, signal?: AbortSignal): Promise<ImageCandidate[]> {
  const params = new URLSearchParams({ query: q, orientation: 'landscape', per_page: '20' });
  const d = await getJson(`https://api.pexels.com/v1/search?${params}`, { Authorization: key }, signal);
  return ((d?.photos ?? []) as any[])
    .filter((p) => okShape(p.width, p.height))
    .map((p) => ({
      id: `px-${p.id}`,
      provider: 'pexels' as const,
      url: p.src?.large2x || p.src?.large || p.src?.original,
      thumb: p.src?.medium || p.src?.small,
      width: p.width,
      height: p.height,
      title: p.alt || '',
      description: p.alt || '',
      tags: [],
      author: p.photographer || '未知',
      license: 'Pexels License',
      pageUrl: p.url,
      curated: true,
      score: 0,
    }));
}

async function searchUnsplash(q: string, key: string, signal?: AbortSignal): Promise<ImageCandidate[]> {
  const params = new URLSearchParams({ query: q, orientation: 'landscape', per_page: '20' });
  const d = await getJson(`https://api.unsplash.com/search/photos?${params}`, { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' }, signal);
  return ((d?.results ?? []) as any[])
    .filter((p) => okShape(p.width, p.height))
    .map((p) => ({
      id: `us-${p.id}`,
      provider: 'unsplash' as const,
      url: p.urls?.regular,
      thumb: p.urls?.small,
      width: p.width,
      height: p.height,
      title: p.alt_description || p.description || '',
      description: [p.description, p.alt_description].filter(Boolean).join(' '),
      tags: (p.tags ?? []).map((t: any) => t?.title).filter(Boolean),
      author: p.user?.name || '未知',
      license: 'Unsplash License',
      pageUrl: p.links?.html || '',
      curated: true,
      score: 0,
    }));
}

// ------------------------------------------------------------
// 排序 + 编排
// ------------------------------------------------------------

/** 给候选图打分：检索词命中 + 词库命中 + 精选加分 + 比例/分辨率 */
export function rankCandidates(cands: ImageCandidate[], keywords: string[], vocab: { core: string[]; adv: string[] }): ImageCandidate[] {
  const kwTokens = [...new Set(keywords.join(' ').toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 2))];
  return cands
    .map((c) => {
      const text = ` ${[c.title, c.description, c.tags.join(' ')].join(' ').toLowerCase()} `;
      const has = (w: string) => text.includes(` ${w.toLowerCase()}`) || text.includes(`${w.toLowerCase()} `);
      let score = 0;
      kwTokens.forEach((t) => has(t) && (score += 3));
      vocab.core.slice(0, 25).forEach((w) => has(w) && (score += 2));
      vocab.adv.slice(0, 15).forEach((w) => has(w) && (score += 1));
      if (c.curated) score += 3;
      if (c.width >= 1600) score += 1;
      score -= Math.abs(c.width / c.height - 1.5) * 2;
      return { ...c, score: Math.round(score * 10) / 10 };
    })
    .sort((a, b) => b.score - a.score);
}

export interface SearchOutcome {
  candidates: ImageCandidate[];
  errors: string[];
  usedQuery: string;
}

/**
 * 依次尝试多组检索词（主关键词 → 备选），每组并发查询所有已启用图源，
 * 凑够 6 张以上就停；最后合并去重并按相关度排序。
 */
export async function searchImages(
  queries: string[],
  settings: Pick<AppSettings, 'useWikimedia' | 'useOpenverse' | 'pexelsKey' | 'unsplashKey'>,
  vocab: { core: string[]; adv: string[] },
  signal?: AbortSignal,
): Promise<SearchOutcome> {
  const errors: string[] = [];
  const all = new Map<string, ImageCandidate>();
  let usedQuery = '';
  const qs = [...new Set(queries.map((q) => q.trim()).filter(Boolean))];
  for (const q of qs) {
    usedQuery = usedQuery || q;
    const jobs: [string, Promise<ImageCandidate[]>][] = [];
    if (settings.pexelsKey.trim()) jobs.push(['Pexels', searchPexels(q, settings.pexelsKey.trim(), signal)]);
    if (settings.unsplashKey.trim()) jobs.push(['Unsplash', searchUnsplash(q, settings.unsplashKey.trim(), signal)]);
    if (settings.useWikimedia) jobs.push(['Wikimedia', searchWikimedia(q, signal)]);
    if (settings.useOpenverse) jobs.push(['Openverse', searchOpenverse(q, signal)]);
    if (!jobs.length) throw new Error('没有启用任何图库，请在设置里至少打开一个');
    const settled = await Promise.allSettled(jobs.map(([, p]) => p));
    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') s.value.forEach((c) => c.url && !all.has(c.url) && all.set(c.url, c));
      else errors.push(`${jobs[i][0]}「${q}」：${(s.reason as Error)?.message ?? s.reason}`);
    });
    if (all.size >= 6) {
      usedQuery = q;
      break;
    }
  }
  return { candidates: rankCandidates([...all.values()], qs, vocab).slice(0, 12), errors, usedQuery };
}
