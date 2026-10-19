// ============================================================
// 顶部：标题导航 / AI 开关条（PRD 模块二）/ 难度规则条（PRD 模块三.1）
// ============================================================

import { useEffect, useState } from 'react';
import { useGame } from '../../game/GameContext';
import { updateSettings, useSettings } from '../../services/settings';
import { PROVIDERS, PROVIDER_LIST, type ProviderId } from '../../services/llm/providers';
import { resolveAiConfig, testConnection } from '../../services/llm/client';
import { useDueCount, useVocabCount } from '../../services/collections';
import { difficultyOf } from '../../engine/scoring';
import { Button, Spinner, cx } from '../ui/primitives';
import { useToast } from '../ui/Toast';

export type ModalKey = 'ai' | 'custom' | 'library' | 'vocab' | 'review' | 'stats' | 'settings' | 'help' | null;

export function Header({ onOpen }: { onOpen: (m: ModalKey) => void }) {
  const { nextRandom, phase } = useGame();
  const vocabCount = useVocabCount();
  const due = useDueCount();
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-2xl shadow-lg shadow-indigo-500/30">🔍</div>
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-800 sm:text-2xl">
            PicWord <span className="text-indigo-600">Quest</span>
          </h1>
          <p className="text-xs text-slate-500">看真实照片 · 写英文单词 · 闯关拿高分</p>
        </div>
      </div>
      <nav className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => void nextRandom()} disabled={phase === 'judging'} title="从内置关卡池随机抽一个没玩过的">
          🎲 随机下一关
        </Button>
        <Button variant="success" onClick={() => onOpen('ai')} title="AI 构思场景 + 检索真实照片">
          ✨ AI 搜图造关
        </Button>
        <Button onClick={() => onOpen('custom')} title="上传自己的照片做关卡">
          ➕ 自建关卡
        </Button>
        <Button variant="warning" onClick={() => onOpen('library')}>
          📚 关卡库
        </Button>
        <Button variant="violet" onClick={() => onOpen('vocab')}>
          🖼️ 生词本
          <span className="rounded-full bg-white/25 px-1.5 text-xs tabular-nums">{vocabCount}</span>
          {due > 0 && <span className="rounded-full bg-rose-500 px-1.5 text-[11px]">{due} 待复习</span>}
        </Button>
        <Button onClick={() => onOpen('stats')}>📈 战绩</Button>
        <Button onClick={() => onOpen('settings')} title="设置">
          ⚙️
        </Button>
        <Button variant="ghost" className="hidden sm:inline-flex" onClick={() => onOpen('help')} title="玩法说明">
          ❔
        </Button>
      </nav>
    </header>
  );
}

export function AiBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const s = useSettings();
  const toast = useToast();
  const cfg = resolveAiConfig(s);
  const p = PROVIDERS[s.provider];
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const isCustom = s.provider === 'custom';
  const model = isCustom ? s.customModel : s.models[s.provider] ?? '';

  const test = async () => {
    if (!cfg) return;
    setTesting(true);
    try {
      toast(await testConnection(cfg), 'success', 5000);
    } catch (e) {
      toast(`连接失败：${(e as Error).message}`, 'error', 7000);
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-indigo-200 bg-indigo-50/70 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-2 font-bold text-indigo-900">
          <input type="checkbox" className="h-[18px] w-[18px] cursor-pointer accent-indigo-600" checked={s.aiEnabled} onChange={(e) => updateSettings({ aiEnabled: e.target.checked })} />
          🤖 启用 AI 智能判卷与动态荐词
        </label>
        <span className="text-xs text-slate-600">
          {!s.aiEnabled && '📴 离线模式：本关词库 + 编辑距离纠错，零延迟、零费用'}
          {s.aiEnabled && cfg && (
            <span className="font-semibold text-emerald-700">
              ✅ AI 就绪：{p.label} · {cfg.model}
              {cfg.visionModel ? ' · 👁 能看图' : ' · 📝 读画面描述'}
            </span>
          )}
          {s.aiEnabled && !cfg && <span className="font-semibold text-amber-700">⚠️ 填好 API Key 后生效（未填时自动用离线判卷）</span>}
        </span>
      </div>

      {s.aiEnabled && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-indigo-200 pt-3 text-sm">
          <select
            value={s.provider}
            onChange={(e) => updateSettings({ provider: e.target.value as ProviderId })}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5"
            aria-label="选择模型供应商"
          >
            {PROVIDER_LIST.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
          {isCustom && (
            <input
              value={s.customEndpoint}
              onChange={(e) => updateSettings({ customEndpoint: e.target.value })}
              placeholder="https://…/v1/chat/completions"
              className="min-w-[240px] flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
            />
          )}
          <input
            list="pwq-model-hints"
            value={model}
            onChange={(e) =>
              isCustom ? updateSettings({ customModel: e.target.value }) : updateSettings({ models: { ...s.models, [s.provider]: e.target.value } })
            }
            placeholder={p.defaultModel || '模型名'}
            className="w-44 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
            aria-label="模型名"
            title="留空使用默认模型"
          />
          <datalist id="pwq-model-hints">
            {p.modelHints.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <div className="relative min-w-[240px] flex-1">
            <input
              type={showKey ? 'text' : 'password'}
              value={s.keys[s.provider] ?? ''}
              onChange={(e) => updateSettings({ keys: { ...s.keys, [s.provider]: e.target.value.trim() } })}
              placeholder={`粘贴 ${p.label} API Key（只存在本机浏览器）`}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-2.5 pr-9"
              aria-label="API Key"
            />
            <button type="button" onClick={() => setShowKey((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-slate-400 hover:text-slate-700" title={showKey ? '隐藏' : '显示'}>
              {showKey ? '🙈' : '👁'}
            </button>
          </div>
          <Button size="sm" onClick={test} disabled={!cfg || testing}>
            {testing ? <Spinner /> : '🔌'} 测试连接
          </Button>
          <Button size="sm" variant="ghost" onClick={onOpenSettings}>
            高级设置…
          </Button>
          <p className="w-full text-xs text-indigo-900/70">
            {p.note}
            {p.keyUrl && (
              <a href={p.keyUrl} target="_blank" rel="noreferrer" className="ml-1 font-semibold text-indigo-700 underline">
                获取 Key ↗
              </a>
            )}
          </p>
        </div>
      )}
    </section>
  );
}

const PRESETS: [string, number][] = [
  ['入门', 6],
  ['进阶', 12],
  ['挑战', 20],
];

const DIFF_CLS: Record<string, string> = {
  easy: 'bg-emerald-100 text-emerald-800',
  medium: 'bg-sky-100 text-sky-800',
  hard: 'bg-orange-100 text-orange-800',
  hell: 'bg-rose-100 text-rose-800',
};

export function RuleBanner() {
  const { session, setNPass, nFull, qualifiedCount, phase } = useGame();
  const s = useSettings();
  const [draft, setDraft] = useState('');
  const nPass = session?.nPass ?? 0;
  useEffect(() => setDraft(String(nPass || '')), [nPass]);
  if (!session) return <div className="h-12 animate-pulse rounded-2xl bg-amber-50" />;
  const d = difficultyOf(nPass);
  const unit = 60 / nPass;
  const capWarn = !s.aiEnabled && nFull > qualifiedCount;
  const passWarn = !s.aiEnabled && nPass > qualifiedCount;

  const commit = (v: string) => {
    const n = parseInt(v, 10);
    if (Number.isFinite(n) && n >= 1) setNPass(n);
  };

  return (
    <section className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cx('rounded-md px-2 py-0.5 text-xs font-bold', DIFF_CLS[d.key])}>{d.label}</span>
        <span className="text-amber-950">
          写出 <b className="text-base">{nPass}</b> 个达标词（关联度 ≥ 70%）即及格 60 分 · 写满 <b>{nFull}</b> 个冲刺 100 分
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-amber-900">
        <label className="flex items-center gap-1.5">
          ⚙️ 及格词数
          <input
            type="number"
            min={1}
            max={40}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              commit(e.target.value);
            }}
            onBlur={() => setDraft(String(nPass))}
            className="w-14 rounded-md border border-amber-400 bg-white px-1.5 py-0.5 text-center font-bold"
            aria-label="及格词数"
          />
        </label>
        <div className="flex gap-1">
          {PRESETS.map(([label, n]) => (
            <button
              key={label}
              type="button"
              onClick={() => setNPass(n)}
              className={cx('cursor-pointer rounded-md px-2 py-0.5 text-xs font-semibold transition', nPass === n ? 'bg-amber-500 text-white' : 'bg-white text-amber-800 ring-1 ring-amber-300 hover:bg-amber-100')}
            >
              {label} {n}
            </button>
          ))}
        </div>
        <span className="text-xs">
          每个达标词 = <b>{unit.toFixed(unit < 10 ? 2 : 1)}</b> 分{phase === 'result' && '（已按新要求重新计分）'}
        </span>
      </div>
      {(capWarn || passWarn) && (
        <p className="w-full text-xs text-amber-700">
          ⚠️ 本关离线词库里关联度 ≥ 70% 的词共 {qualifiedCount} 个，
          {passWarn ? '及格要求已超出离线上限，离线模式无法过关' : `满分目标 ${nFull} 个在离线模式下达不到`}；开启 AI 判卷可识别词库外的词。
        </p>
      )}
    </section>
  );
}
