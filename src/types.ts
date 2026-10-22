// ============================================================
// PicWord Quest 全局类型定义
// 字段命名尽量与 PRD 保持一致（title / searchKeyword / sceneDesc /
// passCount / coreWords / advWords / weakWords），方便与 AI 输出 JSON 直接对接。
// ============================================================

/** 词汇分级：core 核心名词 / adv 高阶动作·状态·形容词 / weak 弱联想词 */
export type Tier = 'core' | 'adv' | 'weak';

/** 一个预设词条 */
export interface WordEntry {
  /** 标准英文写法（小写；可以是短语，如 "traffic light"） */
  word: string;
  /** 词性缩写：n. / v. / adj. / adv. / phr. … */
  pos: string;
  /** 简体中文释义 */
  meaning: string;
  /** 画面关联度 0~100 */
  relevance: number;
  /** 视为同一词条的同义词 / 变体（如 taxi 的 cab），离线判卷时按同一个词计 */
  alts?: string[];
}

/** 带分级标签的词条（AI 补充词、推荐词等需要显式标注分级的场合） */
export interface TieredWord extends WordEntry {
  tier: Tier;
}

export type LevelSource = 'seed' | 'ai' | 'custom';

/** 图片署名信息（CC 协议要求署名时展示） */
export interface ImageCredit {
  provider?: string; // Wikimedia Commons / Openverse / Pexels / Unsplash / 玩家上传
  author?: string;
  license?: string;
  pageUrl?: string; // 原图页面
  title?: string;
}

/** 关卡 */
export interface Level {
  id: string;
  source: LevelSource;
  /** 中文标题 */
  title: string;
  /** 英文标题（可选） */
  titleEn?: string;
  /** 主题分类 key（seed 关卡用于推荐收藏文件夹） */
  theme?: string;
  /** 图库检索用英文关键词 */
  searchKeyword?: string;
  /** 画面视觉描述（供文本大模型“看图”判卷） */
  sceneDesc: string;
  /** 及格要求达标词数 N_pass */
  passCount: number;
  /** 满分目标词数 N_full（默认 ≈ 1.45 × N_pass） */
  fullCount: number;
  coreWords: WordEntry[];
  advWords: WordEntry[];
  weakWords: WordEntry[];
  /** 图片地址：内置关卡为站内静态路径，AI 关卡为远程 URL */
  imageUrl?: string;
  /** 图片已固化进 IndexedDB 时的图片 ID（优先于 imageUrl） */
  imageId?: string;
  credit?: ImageCredit;
  createdAt: number;
}

/** 关卡库中的关卡（= 关卡 + 收藏信息） */
export interface StoredLevel extends Level {
  folder: string;
  collectedAt: number;
  plays: number;
  bestScore: number | null;
}

// ------------------------------------------------------------
// 判卷
// ------------------------------------------------------------

/**
 * 单词判定状态
 * - correct   拼写正确（含合理单复数/时态变形）
 * - typo      轻微拼写错误（离线：编辑距离 1；AI：判定为 typo）
 * - unknown   离线词库未收录（无法判断关联度，按 0 计）
 * - invalid   无法识别的拼写 / 非英文单词
 * - duplicate 与前面某个输入是同一个词条（不重复计分）
 */
export type JudgeStatus = 'correct' | 'typo' | 'unknown' | 'invalid' | 'duplicate';

export interface Judgment {
  /** 玩家原始输入 */
  input: string;
  /** 标准/纠正后的写法 */
  word: string;
  status: JudgeStatus;
  /** 分级：词库词为 core/adv/weak，AI 判定也会给出；none = 无关或未收录 */
  tier: Tier | 'none';
  pos: string;
  meaning: string;
  /** 画面关联度 0~100 */
  relevance: number;
  /** 补充说明（如“正确拼写：passport”“你是不是想写 xxx？”） */
  note?: string;
  /** 判定来源：本关词库 / AI 沉淀词 / AI 实时判定 */
  source: 'vocab' | 'learned' | 'ai';
}

/** 计分结果（全部由前端公式算出，AI 只提供 status + relevance） */
export interface ScoreResult {
  total: number;
  passed: boolean;
  /** A = 未达及格词数，按比例给分；B = 达到及格词数，60 + 超额 + 质量 */
  case: 'A' | 'B';
  nPass: number;
  nFull: number;
  nValid: number;
  unitScore: number;
  /** 每个输入对应的折算权重 w_i（与 judgments 同序） */
  weights: number[];
  correctCount: number;
  typoCount: number;
  /** 达标词平均关联度（无达标词时为 0） */
  avgRel: number;
  extraScore: number;
  qualityBonus: number;
  /** 距离及格还差的达标词数（已及格为 0） */
  missingToPass: number;
  /** 公式拆解文本（逐行） */
  breakdown: string[];
}

/** 本关推荐（拓展）词 */
export interface Recommendation extends TieredWord {}

/** 一次判卷的完整结果 */
export interface RoundResult {
  judgments: Judgment[];
  score: ScoreResult;
  recommendations: Recommendation[];
  mode: 'ai' | 'offline';
  /** AI 失败回退离线时的说明 */
  fallbackReason?: string;
  /** AI 本次沉淀进词库的新词 */
  learned?: TieredWord[];
  judgedAt: number;
}

// ------------------------------------------------------------
// 持久化实体
// ------------------------------------------------------------

export interface ImageRecord {
  id: string;
  blob: Blob;
  mime: string;
  width: number;
  height: number;
  sourceUrl?: string;
  createdAt: number;
}

/** 视觉生词本条目：单词永远与它出现的那张图绑定 */
export interface VocabItem {
  id?: number;
  /** 去重键：levelId + 小写单词 */
  key: string;
  word: string;
  pos: string;
  meaning: string;
  relevance: number;
  tier: Tier | 'none';
  levelId: string;
  levelTitle: string;
  imageId?: string;
  imageUrl?: string;
  createdAt: number;
  // —— 间隔复习（Leitner 盒子）——
  box: number;
  due: number;
  reviews: number;
  lapses: number;
}

export interface HistoryRecord {
  id?: number;
  levelId: string;
  levelTitle: string;
  source: LevelSource;
  score: number;
  passed: boolean;
  nValid: number;
  nPass: number;
  nFull: number;
  wordCount: number;
  mode: 'ai' | 'offline';
  hintsUsed: number;
  durationSec: number;
  playedAt: number;
}

/** AI 判卷沉淀下来的“本关新词”（离线判卷时并入词库） */
export interface LevelExtras {
  levelId: string;
  words: TieredWord[];
  updatedAt: number;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

// ------------------------------------------------------------
// 图解词典（玩家从本机导入的 .pwdict 词典包，只存在本机浏览器）
// ------------------------------------------------------------

/** 词典页上的一个词条：英文 + 中文 + 拼音，指向所在页及在页面上的位置 */
export interface DictEntry {
  id?: number;
  en: string;
  zh: string;
  py?: string;
  page: number;
  /** 词条标签在页面上的位置（相对页面宽高的 0~1 比例：x, y, w, h），用于在整页图上框出 */
  box?: [number, number, number, number];
}

export interface DictPage {
  page: number;
  blob: Blob;
  width: number;
  height: number;
  /** 页眉标题（如“外表 · APPEARANCE”） */
  title?: string;
}

export interface DictMeta {
  name: string;
  pageCount: number;
  entryCount: number;
  importedAt: number;
}
