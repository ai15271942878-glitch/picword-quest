// ============================================================
// ⚙️ 设置：AI 模型（全部供应商）/ 网络通道 / 图库 / 发音 / 玩法 / GitHub 同步 / 数据存档
// ============================================================

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, updateSettings, useSettings, type Transport } from '../../services/settings';
import { PROVIDER_LIST, PROVIDERS, type ProviderId } from '../../services/llm/providers';
import { resolveAiConfig, testConnection } from '../../services/llm/client';
import { probeProxy } from '../../services/net';
import { englishVoices, speak, webSpeechSupported } from '../../services/tts';
import { clearAllData, downloadBackup, importBackup } from '../../services/backup';
import { Button, Modal, Spinner, cx } from '../ui/primitives';
import { useToast } from '../ui/Toast';
import { useDialog } from '../ui/Dialog';
import { GitHubSyncSection } from './GitHubSync';
import { AppVersionSection } from './UpdateModal';
import { isNativeApp } from '../../services/appUpdate';

function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <section className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <h3 className="mb-1 font-bold text-slate-800">{title}</h3>
      {hint && <p className="mb-3 text-xs text-slate-500">{hint}</p>}
      <div className="space-y-3 text-sm">{children}</div>
    </section>
  );
}

const input = 'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5';

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSettings();
  const toast = useToast();
  const dialog = useDialog();
  const [proxy, setProxy] = useState<{ ok: boolean; envProxy?: string | null } | null>(null);
  const [testing, setTesting] = useState<ProviderId | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [usage, setUsage] = useState<string>('');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const ok = await probeProxy(true);
      let envProxy: string | null | undefined;
      if (ok) {
        try {
          envProxy = (await (await fetch(`${import.meta.env.BASE_URL}api/health`, { headers: { 'X-PicWord-Proxy': '1' } })).json()).envProxy;
        } catch {
          /* ignore */
        }
      }
      setProxy({ ok, envProxy });
      const est = await navigator.storage?.estimate?.();
      if (est?.usage != null) setUsage(`${(est.usage / 1024 / 1024).toFixed(1)} MB`);
    })();
    setVoices(englishVoices());
    const t = setTimeout(() => setVoices(englishVoices()), 800);
    return () => clearTimeout(t);
  }, [open]);

  const test = async (id: ProviderId) => {
    const cfg = resolveAiConfig({ ...s, provider: id });
    if (!cfg) return toast('请先填写 Key（自定义端点还需要地址和模型名）', 'warn');
    setTesting(id);
    try {
      toast(await testConnection(cfg), 'success', 5000);
    } catch (e) {
      toast(`连接失败：${(e as Error).message}`, 'error', 8000);
    } finally {
      setTesting(null);
    }
  };

  const doExport = async () => {
    setBusy(true);
    try {
      const r = await downloadBackup();
      toast(`已导出 ${r.filename}（${(r.bytes / 1024).toFixed(0)} KB）`, 'success', 5000);
    } catch (e) {
      toast(`导出失败：${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    if (importMode === 'replace' && !(await dialog.confirm('覆盖导入会清空当前所有关卡库、生词本和记录', { message: '建议先导出一份当前存档。确定继续？', danger: true, okText: '覆盖导入' }))) return;
    setBusy(true);
    try {
      const sum = await importBackup(await file.text(), importMode);
      toast(`导入完成：关卡 ${sum.levels} · 图片 ${sum.images} · 生词 ${sum.vocab} · 记录 ${sum.history}`, 'success', 6000);
    } catch (e) {
      toast(`导入失败：${(e as Error).message}`, 'error', 7000);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const doClear = async () => {
    if (!(await dialog.confirm('清空全部本地数据？', { message: '关卡库、生词本、通关记录、AI 沉淀词都会被删除，且无法恢复（API Key 等设置保留）。', danger: true, okText: '全部清空' }))) return;
    await clearAllData();
    toast('本地数据已清空', 'info');
  };

  return (
    <Modal open={open} onClose={onClose} title="⚙️ 设置" subtitle="配置和 Key 保存在本机；登录「☁️ 账号」后会同步到你的账号（GitHub 令牌除外），换设备不用重填" width="max-w-4xl">
      <div className="space-y-4">
        <Section
          title="🤖 AI 模型"
          hint="AI 只负责判定每个词的拼写状态和画面关联度；总分永远由前端公式计算。DeepSeek 等纯文本模型靠关卡的“画面描述”看图；Gemini / 通义 VL / 智谱 4V 能直接看图。"
        >
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={s.aiEnabled} onChange={(e) => updateSettings({ aiEnabled: e.target.checked })} className="accent-indigo-600" />
              启用 AI 判卷与动态荐词
            </label>
            <label className="flex items-center gap-2">
              当前使用
              <select value={s.provider} onChange={(e) => updateSettings({ provider: e.target.value as ProviderId })} className={input}>
                {PROVIDER_LIST.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2" title="能看图的模型直接把图片发过去（更准，但更慢、更费 token）">
              <input type="checkbox" checked={s.useVision} onChange={(e) => updateSettings({ useVision: e.target.checked })} className="accent-indigo-600" />
              允许使用视觉模型看图
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="py-1 pr-2">供应商</th>
                  <th className="py-1 pr-2">API Key</th>
                  <th className="py-1 pr-2">文本模型</th>
                  <th className="py-1 pr-2">视觉模型</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {PROVIDER_LIST.filter((p) => p.id !== 'custom').map((p) => (
                  <tr key={p.id} className={cx(s.provider === p.id && 'bg-indigo-50')}>
                    <td className="py-1 pr-2 font-semibold">
                      {p.label}
                      {p.keyUrl && (
                        <a href={p.keyUrl} target="_blank" rel="noreferrer" className="ml-1 text-xs font-normal text-indigo-600 hover:underline">
                          获取 ↗
                        </a>
                      )}
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        type="password"
                        autoComplete="off"
                        value={s.keys[p.id] ?? ''}
                        onChange={(e) => updateSettings({ keys: { ...s.keys, [p.id]: e.target.value.trim() } })}
                        placeholder="sk-… / AIza…"
                        className={cx(input, 'w-48')}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        value={s.models[p.id] ?? ''}
                        onChange={(e) => updateSettings({ models: { ...s.models, [p.id]: e.target.value.trim() } })}
                        placeholder={p.defaultModel}
                        list={`hints-${p.id}`}
                        className={cx(input, 'w-40')}
                      />
                      <datalist id={`hints-${p.id}`}>
                        {p.modelHints.map((m) => (
                          <option key={m} value={m} />
                        ))}
                      </datalist>
                    </td>
                    <td className="py-1 pr-2">
                      {p.visionModel ? (
                        <input
                          value={s.visionModels[p.id] ?? ''}
                          onChange={(e) => updateSettings({ visionModels: { ...s.visionModels, [p.id]: e.target.value.trim() } })}
                          placeholder={p.visionModel}
                          className={cx(input, 'w-36')}
                        />
                      ) : (
                        <span className="text-xs text-slate-400">不支持看图</span>
                      )}
                    </td>
                    <td className="py-1">
                      <Button size="xs" onClick={() => void test(p.id)} disabled={testing === p.id}>
                        {testing === p.id ? <Spinner /> : '🔌'} 测试
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
            <div className="mb-2 font-semibold">{PROVIDERS.custom.label}</div>
            <div className="flex flex-wrap items-center gap-2">
              <input value={s.customEndpoint} onChange={(e) => updateSettings({ customEndpoint: e.target.value.trim() })} placeholder="https://api.example.com/v1/chat/completions" className={cx(input, 'min-w-[280px] flex-1')} />
              <input value={s.customModel} onChange={(e) => updateSettings({ customModel: e.target.value.trim() })} placeholder="模型名，如 gpt-4o-mini" className={cx(input, 'w-44')} />
              <input type="password" value={s.keys.custom ?? ''} onChange={(e) => updateSettings({ keys: { ...s.keys, custom: e.target.value.trim() } })} placeholder="API Key" className={cx(input, 'w-44')} />
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={s.customVision} onChange={(e) => updateSettings({ customVision: e.target.checked })} className="accent-indigo-600" />
                该模型能看图
              </label>
              <Button size="xs" onClick={() => void test('custom')} disabled={testing === 'custom'}>
                {testing === 'custom' ? <Spinner /> : '🔌'} 测试
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">可接 OpenAI、各类中转站，或本机的 Ollama（http://localhost:11434/v1/chat/completions）。</p>
          </div>
        </Section>

        <Section
          title="🌐 网络通道"
          hint={
            <>
              四家官方接口和图库都支持浏览器跨域，默认<b>浏览器直连</b>（会自动使用系统代理）；<b>本地代理</b>只在直连失败时兜底（自定义端点则优先走代理）。纯静态部署到网上时没有本地代理，也能正常使用。
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            {(
              [
                ['auto', '自动（推荐）'],
                ['proxy', '只走本地代理'],
                ['direct', '只走浏览器直连'],
              ] as [Transport, string][]
            ).map(([k, label]) => (
              <label key={k} className="flex items-center gap-1.5">
                <input type="radio" name="transport" checked={s.transport === k} onChange={() => updateSettings({ transport: k })} className="accent-indigo-600" />
                {label}
              </label>
            ))}
          </div>
          <p className="text-xs">
            本地代理状态：
            {proxy === null ? (
              '检测中…'
            ) : proxy.ok ? (
              <span className="font-semibold text-emerald-600">✅ 可用{proxy.envProxy ? `（Node 侧经系统代理 ${proxy.envProxy} 出网，代理没开时自动直连）` : '（Node 侧直连出网）'}</span>
            ) : (
              <span className="font-semibold text-slate-600">
                ➖ 未启用（线上静态部署时属正常）—— 不影响 AI 判卷与搜图（全部浏览器直连）；只影响自定义端点的跨域兜底，以及少数不允许跨域的图源无法把图片存进本地
              </span>
            )}
          </p>
        </Section>

        <Section title="🖼️ 真实照片图库（AI 搜图造关用）" hint="Wikimedia Commons 与 Openverse 免 Key，但在国内需要翻墙；Pexels / Unsplash 国内可直连、图片质量更高，填免费 Key 即自动启用（不翻墙的玩家建议填一个）。">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={s.useWikimedia} onChange={(e) => updateSettings({ useWikimedia: e.target.checked })} className="accent-indigo-600" />
              Wikimedia Commons
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={s.useOpenverse} onChange={(e) => updateSettings({ useOpenverse: e.target.checked })} className="accent-indigo-600" />
              Openverse
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-20 font-semibold">Pexels</span>
            <input type="password" value={s.pexelsKey} onChange={(e) => updateSettings({ pexelsKey: e.target.value.trim() })} placeholder="Pexels API Key（选填）" className={cx(input, 'w-72')} />
            <a href="https://www.pexels.com/api/" target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">
              免费申请 ↗
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-20 font-semibold">Unsplash</span>
            <input type="password" value={s.unsplashKey} onChange={(e) => updateSettings({ unsplashKey: e.target.value.trim() })} placeholder="Unsplash Access Key（选填）" className={cx(input, 'w-72')} />
            <a href="https://unsplash.com/developers" target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">
              免费申请 ↗
            </a>
          </div>
        </Section>

        <Section title="🔊 发音（美式英语 en-US）" hint={webSpeechSupported() ? 'Edge 浏览器自带的 “Natural” 神经语音最好听。' : '使用手机系统的语音朗读；系统没有英语语音时自动改用有道在线发音（需联网）。'}>
          <div className="flex flex-wrap items-center gap-3">
            <select value={s.ttsVoice} onChange={(e) => updateSettings({ ttsVoice: e.target.value })} className={cx(input, 'max-w-[320px]')}>
              <option value="">自动选择最佳语音</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name}（{v.lang}）
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2">
              语速
              <input type="range" min={0.5} max={1.3} step={0.05} value={s.ttsRate} onChange={(e) => updateSettings({ ttsRate: Number(e.target.value) })} />
              <span className="w-10 tabular-nums">{s.ttsRate.toFixed(2)}</span>
            </label>
            <Button size="sm" onClick={() => speak('Look at the picture and find the words.')}>
              ▶ 试听
            </Button>
          </div>
        </Section>

        <Section title="🎮 玩法">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <label className="flex items-center gap-2">
              新关卡默认难度
              <select value={s.defaultDifficulty} onChange={(e) => updateSettings({ defaultDifficulty: e.target.value as typeof s.defaultDifficulty })} className={input}>
                <option value="level">按关卡推荐</option>
                <option value="easy">入门（6 词及格）</option>
                <option value="medium">进阶（12 词）</option>
                <option value="hard">挑战（20 词）</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              每关提示次数
              <input type="number" min={0} max={10} value={s.hintsPerLevel} onChange={(e) => updateSettings({ hintsPerLevel: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })} className={cx(input, 'w-16')} />
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={s.showTimer} onChange={(e) => updateSettings({ showTimer: e.target.checked })} className="accent-indigo-600" />
              显示计时
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={s.confetti} onChange={(e) => updateSettings({ confetti: e.target.checked })} className="accent-indigo-600" />
              过关彩带
            </label>
          </div>
        </Section>

        {isNativeApp() && (
          <Section title="📱 App 版本" hint="有新版本时，打开 App 会自动提示；也可以手动检查。">
            <AppVersionSection />
          </Section>
        )}

        <Section
          title="☁️ GitHub 私有仓库同步"
          hint="把生词本、关卡库、战绩同步到你自己的 GitHub 私有仓库，换设备也不丢；也可以从仓库直接下载图解词典。浏览器直连 GitHub，国内可能需要开代理。"
        >
          <GitHubSyncSection />
        </Section>

        <Section title="💾 存档（IndexedDB）" hint={`导出包含关卡库（含图片）、生词本、通关记录、AI 沉淀词；API Key 不会导出（Key 只通过云端账号同步）。当前浏览器存储占用：${usage || '—'}`}>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => void doExport()} disabled={busy}>
              ⬇️ 导出存档 .json
            </Button>
            <select value={importMode} onChange={(e) => setImportMode(e.target.value as 'merge' | 'replace')} className={input}>
              <option value="merge">合并导入（保留现有数据）</option>
              <option value="replace">覆盖导入（先清空）</option>
            </select>
            <Button onClick={() => fileRef.current?.click()} disabled={busy}>
              ⬆️ 从 .json 导入
            </Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void doImport(e.target.files?.[0])} />
            {busy && <Spinner className="text-indigo-600" />}
            <Button variant="ghost" className="ml-auto text-rose-600" onClick={() => void doClear()}>
              🗑 清空本地数据
            </Button>
          </div>
          <div className="flex justify-end">
            <Button
              size="xs"
              variant="ghost"
              onClick={async () => {
                if (await dialog.confirm('恢复默认设置？', { message: 'API Key 也会被清除。' })) updateSettings({ ...DEFAULT_SETTINGS });
              }}
            >
              恢复默认设置
            </Button>
          </div>
        </Section>
      </div>
    </Modal>
  );
}
