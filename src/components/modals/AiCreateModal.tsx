// ============================================================
// ✨ AI 自动联网搜图造关（PRD 模块一.2）
//   ① AI 构思：标题 / 检索词 / 画面描述 / 分级词库
//   ② 检索真实摄影照片（严禁 AI 绘图）+ 词库命中度排序，可换图
//   ③ 【新增】视觉模型看图校准：按照片真实内容重写画面描述与词库
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../game/GameContext';
import { getSetting, setSetting } from '../../services/db';
import { useSettings } from '../../services/settings';
import { canSeeImages, resolveAiConfig } from '../../services/llm/client';
import { designLevel, levelFromJson, visionVocab, type Difficulty } from '../../services/llm/ai';
import type { AiLevelJson } from '../../services/llm/json';
import { PROVIDER_LABEL, searchImages, type ImageCandidate } from '../../services/imageSearch';
import { toChatImage } from '../../services/imageStore';
import { AI_FOLDER, collectLevel } from '../../services/collections';
import { Button, Modal, Spinner, cx } from '../ui/primitives';
import { useToast } from '../ui/Toast';

type StepState = 'todo' | 'doing' | 'done' | 'skip' | 'error';
interface Steps {
  design: StepState;
  search: StepState;
  vision: StepState;
}

const THEME_IDEAS = ['机场安检', '热闹的夜市', '医院候诊室', '超市收银台', '雨天的公交站', '生日派对', '宠物医院', '理发店', '消防演练', '农贸市场', '图书馆自习', '自行车维修铺'];

export function AiCreateModal({ open, onClose, onOpenSettings, onCollect }: { open: boolean; onClose: () => void; onOpenSettings: () => void; onCollect: (levelId: string) => void }) {
  const settings = useSettings();
  const cfg = resolveAiConfig(settings);
  const vision = canSeeImages(cfg);
  const { loadLevel } = useGame();
  const toast = useToast();

  const [theme, setTheme] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [autoVision, setAutoVision] = useState(true);
  const [steps, setSteps] = useState<Steps | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [json, setJson] = useState<AiLevelJson | null>(null);
  const [cands, setCands] = useState<ImageCandidate[]>([]);
  const [chosen, setChosen] = useState(0);
  const [calibratedFor, setCalibratedFor] = useState<string | null>(null);
  const [kw, setKw] = useState('');
  const [searchNote, setSearchNote] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) abortRef.current?.abort();
  }, [open]);

  const running = !!steps && Object.values(steps).includes('doing');
  const pick = cands[chosen];

  const reset = () => {
    abortRef.current?.abort();
    setSteps(null);
    setError(null);
    setJson(null);
    setCands([]);
    setChosen(0);
    setCalibratedFor(null);
    setSearchNote('');
  };

  async function runSearch(base: AiLevelJson, queries: string[], signal: AbortSignal) {
    setSteps((s) => ({ ...s!, search: 'doing' }));
    const out = await searchImages(queries, settings, { core: base.coreWords.map((w) => w.word), adv: base.advWords.map((w) => w.word) }, signal);
    if (!out.candidates.length) {
      setSteps((s) => ({ ...s!, search: 'error' }));
      // 实测：国内不翻墙时 Wikimedia / Openverse 连不上，而 Pexels / Unsplash 可以直连
      const noKeys = !settings.pexelsKey.trim() && !settings.unsplashKey.trim();
      const netFail = out.errors.length > 0 && out.errors.every((e) => /Failed to fetch|网络|超时|NetworkError|fetch/i.test(e));
      const hint =
        noKeys && netFail
          ? '\n💡 Wikimedia / Openverse 在国内需要翻墙。不翻墙的话，到「⚙️ 设置 → 真实照片图库」填一个 Pexels 或 Unsplash 的免费 Key（国内可直连），再重试。'
          : '\n可以换个检索词重试。';
      throw new Error(`没有检索到合适的真实照片${out.errors.length ? `（${out.errors.slice(0, 2).join('；')}）` : ''}。${hint}`);
    }
    setCands(out.candidates);
    setChosen(0);
    setKw(out.usedQuery);
    setSearchNote(`检索词「${out.usedQuery}」找到 ${out.candidates.length} 张候选图${out.errors.length ? `（部分图库失败：${out.errors.length} 个）` : ''}`);
    setSteps((s) => ({ ...s!, search: 'done' }));
    return out.candidates;
  }

  async function runVision(base: AiLevelJson, cand: ImageCandidate, signal: AbortSignal) {
    if (!cfg) return;
    setSteps((s) => ({ ...s!, vision: 'doing' }));
    try {
      const img = await toChatImage({ imageUrl: cand.url });
      if (!img) throw new Error('图片下载失败，无法发给视觉模型');
      const refined = await visionVocab(cfg, img, { title: base.title, difficulty, draftDesc: base.sceneDesc, signal });
      setJson({ ...refined, searchKeyword: base.searchKeyword, altKeywords: base.altKeywords });
      setCalibratedFor(cand.id);
      setSteps((s) => ({ ...s!, vision: 'done' }));
    } catch (e) {
      if (signal.aborted) throw e;
      setSteps((s) => ({ ...s!, vision: 'error' }));
      toast(`看图校准失败，先用 AI 构思的词库：${(e as Error).message}`, 'warn', 6000);
    }
  }

  const generate = async (blind = false) => {
    if (!cfg) return;
    reset();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const t = blind ? '' : theme;
    setSteps({ design: 'doing', search: 'todo', vision: vision && autoVision ? 'todo' : 'skip' });
    try {
      const avoid = await getSetting<string[]>('aiTitles', []);
      const base = await designLevel(cfg, { theme: t, difficulty, avoid, signal: ctrl.signal });
      setJson(base);
      setSteps((s) => ({ ...s!, design: 'done' }));
      await setSetting('aiTitles', [...avoid, base.title].slice(-20));
      const list = await runSearch(base, [base.searchKeyword, ...base.altKeywords, base.titleEn], ctrl.signal);
      if (vision && autoVision) await runVision(base, list[0], ctrl.signal);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError((e as Error).message);
      setSteps((s) => (s ? { design: s.design === 'doing' ? 'error' : s.design, search: s.search === 'doing' ? 'error' : s.search, vision: s.vision === 'doing' ? 'error' : s.vision } : s));
    }
  };

  const research = async () => {
    if (!json || !kw.trim()) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);
    setCalibratedFor(null);
    try {
      await runSearch(json, [kw.trim()], ctrl.signal);
    } catch (e) {
      if (!ctrl.signal.aborted) setError((e as Error).message);
    }
  };

  const recalibrate = async () => {
    if (!json || !pick) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    await runVision(json, pick, ctrl.signal);
  };

  /** AI 造的关卡自动存进关卡库「AI 生成」（连照片一起存，离线也能再玩；登录了云端会同步到账号）。chooseFolder：存好后弹出选文件夹 */
  const start = (chooseFolder: boolean) => {
    if (!json || !pick) return;
    const level = levelFromJson(json, 'ai', {
      imageUrl: pick.url,
      credit: { provider: PROVIDER_LABEL[pick.provider], author: pick.author, license: pick.license, pageUrl: pick.pageUrl, title: pick.title },
    });
    loadLevel(level, { toast: `✨ AI 关卡「${level.title}」已就绪，并已存进关卡库「${AI_FOLDER}」` });
    onClose();
    void collectLevel(level, AI_FOLDER).then(
      () => chooseFolder && onCollect(level.id),
      () => {
        /* 保存失败不影响游戏；结果页还能手动收藏 */
      },
    );
    reset();
  };

  const StepRow = ({ state, label }: { state: StepState; label: string }) => (
    <li className={cx('flex items-center gap-2 text-sm', state === 'todo' && 'text-slate-400', state === 'skip' && 'text-slate-400 line-through', state === 'error' && 'text-rose-600')}>
      <span className="grid w-5 place-items-center">{state === 'doing' ? <Spinner className="text-indigo-600" /> : state === 'done' ? '✅' : state === 'error' ? '⚠️' : state === 'skip' ? '—' : '○'}</span>
      {label}
    </li>
  );

  return (
    <Modal open={open} onClose={onClose} title="✨ AI 自动搜图造关" subtitle="AI 构思场景 → 检索真实摄影照片（不用 AI 绘图）→ 看图校准词库" width="max-w-4xl">
      {!cfg ? (
        <div className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900 ring-1 ring-amber-200">
          <p className="font-bold">需要先配置大模型 API Key</p>
          <p className="mt-1">AI 造关要调用大模型构思场景与词库。DeepSeek / 通义千问 / 智谱国内可直连；Gemini、通义 VL、智谱 4V 还能“看图”校准词库。</p>
          <Button className="mt-3" variant="primary" onClick={onOpenSettings}>
            ⚙️ 去填写 API Key
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ---- 输入区 ---- */}
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[260px] flex-1 text-sm">
              <span className="mb-1 block font-semibold text-slate-700">想练习的场景主题（留空 = 盲盒）</span>
              <input
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !running && void generate()}
                disabled={running}
                placeholder="如：机场安检、热闹的夜市、医院候诊室…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold text-slate-700">难度</span>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} disabled={running} className="rounded-lg border border-slate-300 px-2 py-2">
                <option value="easy">🟢 入门（5~7 词及格）</option>
                <option value="medium">🔵 进阶（10~15 词）</option>
                <option value="hard">🟠 挑战（20~25 词）</option>
              </select>
            </label>
            <Button variant="success" size="lg" onClick={() => void generate()} disabled={running}>
              {running ? <Spinner /> : '✨'} {theme.trim() ? '生成关卡' : '盲盒生成'}
            </Button>
            {running && (
              <Button size="lg" variant="ghost" onClick={reset}>
                取消
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-400">灵感：</span>
            {THEME_IDEAS.map((t) => (
              <button key={t} type="button" disabled={running} onClick={() => setTheme(t)} className="cursor-pointer rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700">
                {t}
              </button>
            ))}
          </div>
          <label className={cx('flex items-center gap-2 text-sm', !vision && 'text-slate-400')}>
            <input type="checkbox" checked={vision && autoVision} disabled={!vision || running} onChange={(e) => setAutoVision(e.target.checked)} className="accent-emerald-600" />
            选图后让 AI 看图校准词库（推荐；需要视觉模型 —— 当前{vision ? `可用：${cfg.visionModel}` : '模型不支持看图，可在设置里切到 Gemini / 通义 VL / 智谱 4V'}）
          </label>

          {/* ---- 进度 ---- */}
          {steps && (
            <ol className="space-y-1.5 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <StepRow state={steps.design} label={`① AI 构思场景、检索词与分级词库${json ? `：「${json.title}」` : ''}`} />
              <StepRow state={steps.search} label={`② 检索真实摄影照片（${[settings.pexelsKey && 'Pexels', settings.unsplashKey && 'Unsplash', settings.useWikimedia && 'Wikimedia', settings.useOpenverse && 'Openverse'].filter(Boolean).join(' / ')}）`} />
              <StepRow state={steps.vision} label="③ 视觉模型看图，按照片真实内容校准词库" />
            </ol>
          )}
          {error && <p className="whitespace-pre-line rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">⚠️ {error}</p>}

          {/* ---- 结果 ---- */}
          {json && (cands.length > 0 || steps?.search === 'error') && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="英文检索词" className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                <Button size="sm" onClick={() => void research()} disabled={running || !kw.trim()}>
                  🔎 换检索词重搜
                </Button>
                <span className="text-xs text-slate-500">{searchNote}</span>
              </div>
              {cands.length > 0 && (
                <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
                  <div>
                    <div className="relative aspect-[3/2] overflow-hidden rounded-xl bg-slate-900">
                      {pick && <img src={pick.url} alt={pick.title} className="h-full w-full object-contain" />}
                      <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-xs text-white">
                        {chosen + 1} / {cands.length} · {pick && PROVIDER_LABEL[pick.provider]}
                      </span>
                    </div>
                    {pick && (
                      <p className="mt-1 truncate text-[11px] text-slate-400" title={pick.title}>
                        📷 {pick.author} · {pick.license} · {pick.title}
                      </p>
                    )}
                    <div className="mt-2 grid grid-cols-6 gap-1.5">
                      {cands.map((c, i) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setChosen(i)}
                          className={cx('aspect-[4/3] cursor-pointer overflow-hidden rounded-md ring-2 transition', i === chosen ? 'ring-emerald-500' : 'ring-transparent opacity-75 hover:opacity-100')}
                          title={`${c.title}（相关度 ${c.score}）`}
                        >
                          <img src={c.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3 text-sm">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">{json.title}</h3>
                      <p className="text-xs text-slate-500">{json.titleEn}</p>
                    </div>
                    <p className="text-xs text-slate-600">
                      词库：核心 {json.coreWords.length} · 高阶 {json.advWords.length} · 联想 {json.weakWords.length}
                      {calibratedFor === pick?.id ? <span className="ml-1 font-semibold text-emerald-600">· 👁 已按这张图校准</span> : <span className="ml-1 text-amber-600">· 未按这张图校准</span>}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {json.coreWords.slice(0, 12).map((w) => (
                        <span key={w.word} className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-800 ring-1 ring-emerald-200 blur-[3px] transition hover:blur-none" title="悬停偷看（建议先别看）">
                          {w.word}
                        </span>
                      ))}
                    </div>
                    <details className="text-xs text-slate-600">
                      <summary className="cursor-pointer font-semibold">画面描述 sceneDesc（判卷参考）</summary>
                      <p className="mt-1 leading-relaxed">{json.sceneDesc}</p>
                    </details>
                    {vision && calibratedFor !== pick?.id && (
                      <Button size="sm" variant="secondary" onClick={() => void recalibrate()} disabled={running}>
                        {steps?.vision === 'doing' ? <Spinner /> : '👁'} 让 AI 按这张图重写词库
                      </Button>
                    )}
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button variant="success" size="lg" onClick={() => start(false)} disabled={running} title="开始游戏；关卡自动存进关卡库「AI 生成」">
                        ▶ 开始挑战
                      </Button>
                      <Button variant="warning" size="lg" onClick={() => start(true)} disabled={running} title="开始游戏，并把关卡存到你选的文件夹">
                        📁 开始并选择文件夹
                      </Button>
                    </div>
                    <p className="text-xs text-slate-400">图不合适？点下面的缩略图换一张，或换检索词重搜。</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
