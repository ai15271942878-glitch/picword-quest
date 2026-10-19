// ============================================================
// ➕ 玩家自定义上传本地图片造关（PRD 模块一.3）
//   · 选择 / 拖拽 / 粘贴图片 → Canvas 自动压缩
//   · ✨ AI 生成本图专属词库：视觉模型直接看图；纯文本模型根据一句话描述
//   · 【新增】没有 API Key 也能玩：手动编写词库（表格编辑 + 批量粘贴）
//   · 保存后图片与词库永久绑定在该关卡里（IndexedDB）
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../game/GameContext';
import { useSettings } from '../../services/settings';
import { canSeeImages, resolveAiConfig } from '../../services/llm/client';
import { levelFromJson, textVocab, visionVocab, type Difficulty } from '../../services/llm/ai';
import { coerceWords, type AiLevelJson } from '../../services/llm/json';
import { compressImage, saveImage, toChatImage } from '../../services/imageStore';
import { collectLevel, useFolders } from '../../services/collections';
import { Button, Modal, Spinner, cx } from '../ui/primitives';
import { useToast } from '../ui/Toast';
import type { Tier, WordEntry } from '../../types';
import { defaultFullCount } from '../../engine/scoring';

type Vocab = Record<Tier, WordEntry[]>;
const EMPTY: Vocab = { core: [], adv: [], weak: [] };
const TIER_META: [Tier, string, string, number][] = [
  ['core', '核心名词（图中清晰可见）', 'text-emerald-700', 88],
  ['adv', '高阶描写（动作 / 状态 / 形容词）', 'text-indigo-700', 78],
  ['weak', '弱联想（不计分）', 'text-amber-700', 50],
];

export function CustomLevelModal({ open, onClose, onOpenSettings }: { open: boolean; onClose: () => void; onOpenSettings: () => void }) {
  const settings = useSettings();
  const cfg = resolveAiConfig(settings);
  const vision = canSeeImages(cfg);
  const folders = useFolders();
  const { loadLevel } = useGame();
  const toast = useToast();

  const [img, setImg] = useState<{ blob: Blob; url: string; w: number; h: number } | null>(null);
  const [title, setTitle] = useState('');
  // 玩家手动改过标题后，AI 生成词库时不再覆盖
  const [titleTouched, setTitleTouched] = useState(false);
  const [desc, setDesc] = useState('');
  const [sceneDesc, setSceneDesc] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [passCount, setPassCount] = useState(6);
  const [folder, setFolder] = useState('我的自制');
  const [vocab, setVocab] = useState<Vocab>(EMPTY);
  const [busy, setBusy] = useState<'ai' | 'save' | 'img' | null>(null);
  const [bulk, setBulk] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    if (img) URL.revokeObjectURL(img.url);
    setImg(null);
    setTitle('');
    setTitleTouched(false);
    setDesc('');
    setSceneDesc('');
    setVocab(EMPTY);
    setBulk('');
  };

  const takeFile = async (file: File | Blob | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('请选择图片文件', 'warn');
    setBusy('img');
    try {
      const c = await compressImage(file, 1200, 0.86);
      if (img) URL.revokeObjectURL(img.url);
      setImg({ blob: c.blob, url: URL.createObjectURL(c.blob), w: c.width, h: c.height });
      if (!title && 'name' in file) setTitle(String((file as File).name).replace(/\.[^.]+$/, '').slice(0, 12));
    } catch (e) {
      toast(`图片读取失败：${(e as Error).message}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  // Ctrl+V 粘贴图片
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
      if (item) {
        e.preventDefault();
        void takeFile(item.getAsFile());
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  const applyJson = (j: AiLevelJson) => {
    setVocab({ core: j.coreWords, adv: j.advWords, weak: j.weakWords });
    setSceneDesc(j.sceneDesc);
    if (!titleTouched || !title.trim()) setTitle(j.title);
    const qualified = j.coreWords.length + j.advWords.length;
    setPassCount(Math.max(3, Math.min(j.passCount, Math.floor((qualified * 2) / 3))));
  };

  const genAI = async () => {
    if (!cfg || !img) return;
    if (!vision && desc.trim().length < 8) return toast('当前模型看不到图片，请先用一句话描述图片内容（至少 8 个字）', 'warn', 5000);
    setBusy('ai');
    try {
      const j = vision
        ? await visionVocab(cfg, (await toChatImage(img.blob))!, { title: title.trim() || undefined, userDesc: desc.trim() || undefined, difficulty })
        : await textVocab(cfg, { title: title.trim() || undefined, userDesc: desc.trim(), difficulty });
      applyJson(j);
      toast(`AI 生成了 ${j.coreWords.length + j.advWords.length + j.weakWords.length} 个分级词汇，可以再手动修改`, 'success');
    } catch (e) {
      toast(`AI 生成失败：${(e as Error).message}`, 'error', 7000);
    } finally {
      setBusy(null);
    }
  };

  const updateWord = (tier: Tier, i: number, patch: Partial<WordEntry>) =>
    setVocab((v) => ({ ...v, [tier]: v[tier].map((w, k) => (k === i ? { ...w, ...patch } : w)) }));
  const removeWord = (tier: Tier, i: number) => setVocab((v) => ({ ...v, [tier]: v[tier].filter((_, k) => k !== i) }));
  const addRow = (tier: Tier, rel: number) => setVocab((v) => ({ ...v, [tier]: [...v[tier], { word: '', pos: 'n.', meaning: '', relevance: rel }] }));

  const importBulk = () => {
    const rows = bulk
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [word, pos, meaning, rel] = l.split(/\s*[|｜\t]\s*/);
        return { word, pos: pos || 'n.', meaning: meaning || '—', relevance: Number(rel) || 85 };
      });
    const core = coerceWords(rows.filter((r) => r.relevance >= 80), 'core', 60);
    const adv = coerceWords(rows.filter((r) => r.relevance >= 70 && r.relevance < 80), 'adv', 60);
    const weak = coerceWords(rows.filter((r) => r.relevance < 70), 'weak', 30);
    setVocab((v) => ({ core: [...v.core, ...core], adv: [...v.adv, ...adv], weak: [...v.weak, ...weak] }));
    setBulk('');
    toast(`导入 ${core.length + adv.length + weak.length} 个词`, 'success');
  };

  const clean = (list: WordEntry[], tier: Tier) => coerceWords(list.filter((w) => w.word.trim()), tier, 80);
  const finalVocab = { core: clean(vocab.core, 'core'), adv: clean(vocab.adv, 'adv'), weak: clean(vocab.weak, 'weak') };
  const qualified = finalVocab.core.length + finalVocab.adv.length;
  const canSave = !!img && finalVocab.core.length >= 3 && qualified >= passCount && !!title.trim();

  const save = async () => {
    if (!img || !canSave) return;
    setBusy('save');
    try {
      const imageId = await saveImage(img.blob, { compress: false, width: img.w, height: img.h });
      const level = levelFromJson(
        {
          title: title.trim().slice(0, 20),
          titleEn: '',
          searchKeyword: '',
          altKeywords: [],
          sceneDesc: sceneDesc.trim() || desc.trim() || title.trim(),
          passCount,
          coreWords: finalVocab.core,
          advWords: finalVocab.adv,
          weakWords: finalVocab.weak,
        },
        'custom',
        { imageId, credit: { provider: '玩家上传', author: '我', license: '个人使用' } },
      );
      // 玩家手动设定的及格词数优先（只要不超过计分词数）
      level.passCount = Math.min(passCount, qualified);
      level.fullCount = defaultFullCount(level.passCount);
      await collectLevel(level, folder.trim() || '我的自制');
      loadLevel(level, { toast: `🎨 自建关卡「${level.title}」已保存到「${folder}」，开始挑战！` });
      reset();
      onClose();
    } catch (e) {
      toast(`保存失败：${(e as Error).message}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="➕ 自建关卡" subtitle="上传你自己的照片，生成专属词库，永久保存在本地关卡库" width="max-w-5xl">
      <div className="grid gap-5 lg:grid-cols-[1fr_1.25fr]">
        {/* ---- 左：图片与基本信息 ---- */}
        <div className="space-y-3">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void takeFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => fileRef.current?.click()}
            className={cx(
              'relative grid aspect-[3/2] cursor-pointer place-items-center overflow-hidden rounded-xl border-2 border-dashed transition',
              dragOver ? 'border-violet-500 bg-violet-50' : 'border-slate-300 bg-slate-50 hover:border-violet-400',
            )}
          >
            {img ? (
              <img src={img.url} alt="预览" className="h-full w-full object-contain" />
            ) : (
              <div className="p-4 text-center text-sm text-slate-500">
                {busy === 'img' ? <Spinner /> : <div className="text-4xl">🖼️</div>}
                <div className="mt-2 font-semibold">点击选择 / 拖拽图片到这里 / Ctrl+V 粘贴</div>
                <div className="text-xs">自动压缩到 1200px 以内，图片只保存在你的浏览器里</div>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void takeFile(e.target.files?.[0])} />
          </div>
          {img && <p className="text-xs text-slate-400">已压缩为 {img.w}×{img.h}，{Math.round(img.blob.size / 1024)} KB · 点图片可更换</p>}

          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-700">关卡标题</span>
            <input value={title} onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }} maxLength={20} placeholder="如：我家的书桌" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-700">一句话描述图片{vision ? '（选填：视觉模型能直接看图）' : '（纯文本模型看不到图，必填）'}</span>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              maxLength={300}
              placeholder="如：傍晚的书桌，台灯开着，桌上有笔记本电脑、咖啡杯、几本书和一盆绿萝，窗外是城市夜景"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label>
              <span className="mb-1 block font-semibold text-slate-700">难度</span>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} className="rounded-lg border border-slate-300 px-2 py-2">
                <option value="easy">🟢 入门</option>
                <option value="medium">🔵 进阶</option>
                <option value="hard">🟠 挑战</option>
              </select>
            </label>
            {cfg ? (
              <Button variant="violet" onClick={() => void genAI()} disabled={!img || busy === 'ai'} title={vision ? `用 ${cfg.visionModel} 直接看图` : `用 ${cfg.model} 根据描述生成`}>
                {busy === 'ai' ? <Spinner /> : '✨'} AI 生成本图专属词库{vision ? '（看图）' : '（按描述）'}
              </Button>
            ) : (
              <Button onClick={onOpenSettings} title="填写 API Key 后可用 AI 生成">
                ⚙️ 配置 AI 后可一键生成
              </Button>
            )}
          </div>
          {sceneDesc && (
            <details className="text-xs text-slate-600">
              <summary className="cursor-pointer font-semibold">AI 写的画面描述（判卷参考）</summary>
              <textarea value={sceneDesc} onChange={(e) => setSceneDesc(e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-slate-300 p-2" />
            </details>
          )}
        </div>

        {/* ---- 右：词库编辑 ---- */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800">📝 本图词库（可手动增删改）</h3>
            <span className="text-xs text-slate-500">
              计分词 {qualified} 个 · 联想 {finalVocab.weak.length} 个
            </span>
          </div>
          <div className="max-h-[46vh] space-y-3 overflow-y-auto pr-1">
            {TIER_META.map(([tier, label, cls, rel]) => (
              <div key={tier}>
                <div className="mb-1 flex items-center justify-between">
                  <span className={cx('text-xs font-bold', cls)}>
                    {label}（{vocab[tier].length}）
                  </span>
                  <Button size="xs" variant="ghost" onClick={() => addRow(tier, rel)}>
                    ＋ 加一行
                  </Button>
                </div>
                <div className="space-y-1">
                  {vocab[tier].map((w, i) => (
                    <div key={i} className="grid grid-cols-[1.3fr_0.55fr_1.2fr_0.6fr_auto] gap-1">
                      <input value={w.word} onChange={(e) => updateWord(tier, i, { word: e.target.value })} placeholder="english" className="min-w-0 rounded border border-slate-300 px-1.5 py-1 text-sm" />
                      <input value={w.pos} onChange={(e) => updateWord(tier, i, { pos: e.target.value })} className="min-w-0 rounded border border-slate-300 px-1.5 py-1 text-sm" />
                      <input value={w.meaning} onChange={(e) => updateWord(tier, i, { meaning: e.target.value })} placeholder="中文" className="min-w-0 rounded border border-slate-300 px-1.5 py-1 text-sm" />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={w.relevance}
                        onChange={(e) => updateWord(tier, i, { relevance: Number(e.target.value) })}
                        className="min-w-0 rounded border border-slate-300 px-1.5 py-1 text-sm"
                        title="关联度 %"
                      />
                      <button type="button" onClick={() => removeWord(tier, i)} className="cursor-pointer px-1 text-slate-400 hover:text-rose-600" aria-label="删除">
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer font-semibold text-slate-600">📋 批量粘贴（每行：word | 词性 | 中文 | 关联度）</summary>
            <textarea
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              rows={4}
              placeholder={'desk | n. | 书桌 | 95\nlamp | n. | 台灯 | 90\nstudy | v. | 学习 | 75'}
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 font-mono"
            />
            <Button size="xs" className="mt-1" onClick={importBulk} disabled={!bulk.trim()}>
              导入（≥80 归核心，70~79 归高阶，&lt;70 归联想）
            </Button>
          </details>

          <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 pt-3 text-sm">
            <label>
              <span className="mb-1 block font-semibold text-slate-700">及格词数</span>
              <input type="number" min={1} max={40} value={passCount} onChange={(e) => setPassCount(Math.max(1, Number(e.target.value) || 1))} className="w-20 rounded-lg border border-slate-300 px-2 py-1.5" />
            </label>
            <label>
              <span className="mb-1 block font-semibold text-slate-700">保存到文件夹</span>
              <input list="pwq-folders" value={folder} onChange={(e) => setFolder(e.target.value)} className="w-36 rounded-lg border border-slate-300 px-2 py-1.5" />
              <datalist id="pwq-folders">
                {folders.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </label>
            <Button variant="success" size="lg" className="ml-auto" onClick={() => void save()} disabled={!canSave || busy === 'save'}>
              {busy === 'save' ? <Spinner /> : '💾'} 保存并开始挑战
            </Button>
          </div>
          {!canSave && (
            <p className="text-xs text-slate-400">
              还差：{[!img && '选择图片', !title.trim() && '填写标题', finalVocab.core.length < 3 && '至少 3 个核心词', qualified < passCount && `计分词数（${qualified}）≥ 及格词数（${passCount}）`].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
