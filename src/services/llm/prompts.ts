// ============================================================
// Prompt 模板
// 核心约束（PRD 模块三）：模型只判定每个词的 status 与 relevance，绝不输出总分。
// 文本模型“看图”：把关卡标题 + 详尽画面描述 sceneDesc 注入 Prompt。
// ============================================================

import type { Level, TieredWord } from '../../types';

const wordsLine = (arr: { word: string; relevance: number }[]) => arr.map((w) => `${w.word}(${w.relevance})`).join(', ');

export const JUDGE_SYSTEM = `你是英语看图词汇游戏 "PicWord Quest" 的判卷官。
玩家观察一张真实照片，写出与画面相关的英文单词或短语。
你只负责逐词判定【拼写状态 status】和【与画面的视觉关联度 relevance】，绝对不要计算或输出总分。
只输出一个 JSON 对象，不要任何解释文字。`;

export function buildJudgePrompt(level: Level, inputs: string[], extras: TieredWord[], withImage: boolean): string {
  const ref = [
    `核心名词 core: ${wordsLine(level.coreWords)}`,
    `高阶描写 adv: ${wordsLine(level.advWords)}`,
    `弱联想 weak: ${wordsLine(level.weakWords)}`,
    extras.length ? `历史补充词: ${wordsLine(extras)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return `【关卡】${level.title}${level.titleEn ? ` / ${level.titleEn}` : ''}
【画面描述】${level.sceneDesc || '（无）'}${withImage ? '\n【图片】已随消息附上，请以图片实际内容为准。' : ''}
【参考词库（括号内为关联度，可作校准依据；词库外的词同样要认真判断）】
${ref}

【玩家输入（共 ${inputs.length} 个，按顺序）】
${inputs.map((w, i) => `${i + 1}. ${w}`).join('\n')}

判定规则：
1. status：
   - "correct"：拼写正确的英文词/短语（允许合理的单复数、时态、比较级变形，以及英式拼写）
   - "typo"：明显想写某个词但有轻微拼写错误（1~2 个字母），word 填正确拼写
   - "invalid"：无法识别的拼写、非英文、乱码
2. relevance（0~100 的整数）：
   - 画面中清晰可见的主体/物件：85~100
   - 画面中可见的动作、状态、颜色、氛围：70~90
   - 合理联想但画面没有直接呈现：30~69
   - 与画面无关：0~29
   - 若与参考词库中的词相同或同义，relevance 与参考值保持一致（±5）
3. tier："core"（可见的具体名词）/ "adv"（动作、状态、形容词等描写）/ "weak"（联想词）/ "none"（无关）
4. pos：词性缩写（n. v. adj. adv. phr.）；meaning：简体中文释义（≤ 12 字）；note：可选的一句中文点评（如拼写提示、用法区别）
5. 另给出 recommendations：8~10 个玩家【没有写出】、与画面高度相关（relevance ≥ 75）的词，约 5 个 core + 4 个 adv，用美式拼写。

只输出如下 JSON（judgments 必须与玩家输入一一对应、顺序一致）：
{"judgments":[{"input":"玩家原词","word":"正确写法","status":"correct","pos":"n.","meaning":"中文","relevance":90,"tier":"core","note":""}],
 "recommendations":[{"word":"...","pos":"n.","meaning":"中文","relevance":88,"tier":"core"}]}`;
}

export const LEVEL_SYSTEM = `你是英语看图词汇游戏 "PicWord Quest" 的关卡设计师。
你设计的关卡会配上一张从免费真实摄影图库（Wikimedia Commons / Openverse / Pexels / Unsplash）检索来的照片，
所以场景必须是现实中常见、容易拍到、画面物件丰富的场景；词汇必须是这类照片里大概率真实可见的东西。
只输出一个 JSON 对象，不要任何解释文字。`;

export const DIFFICULTY_GUIDE: Record<string, { label: string; pass: string }> = {
  easy: { label: '入门', pass: '5~7' },
  medium: { label: '进阶', pass: '10~15' },
  hard: { label: '挑战', pass: '20~25' },
};

const VOCAB_SPEC = `- coreWords：18 个，画面中最可能清晰可见的具体名词（relevance 80~100）
- advWords：12 个，动作 / 状态 / 形容词 / 短语（relevance 70~90）
- weakWords：6 个，合理联想但不一定可见的词（relevance 30~65）
- 每个词：{"word":"英文（小写，美式拼写）","pos":"n./v./adj./phr.","meaning":"简体中文释义","relevance":整数,"alts":["可选：同义词或常见替代写法"]}
- 不要重复，不要生僻词，优先选学习者真正用得上的词`;

export function buildLevelPrompt(theme: string, difficulty: string, avoid: string[], seedHint: string): string {
  const d = DIFFICULTY_GUIDE[difficulty] ?? DIFFICULTY_GUIDE.medium;
  const themeLine = theme.trim()
    ? `玩家想练习的场景主题：「${theme.trim()}」。请把它落实成一个具体、典型、适合拍照的画面。`
    : `玩家选择了“盲盒”：请你自己构思一个日常生活中常见、物件丰富、适合拍照的场景。灵感方向：${seedHint}。${avoid.length ? `避免与这些已出现过的关卡重复：${avoid.join('、')}。` : ''}`;
  return `${themeLine}
难度：${d.label}（passCount 建议 ${d.pass}）

请输出关卡 JSON：
- title：简洁的中文标题（≤ 10 字）；titleEn：英文标题
- searchKeyword：2~3 个英文单词，用来在真实摄影图库检索照片，要具体、可视，如 "airport security checkpoint"、"night market food stall"
- altKeywords：再给 2 组备选检索词（数组）
- sceneDesc：用英文写 80~150 词，描述这类照片的典型画面（主体、物件、人物动作、环境、光线、颜色），作为判卷参考
- passCount：整数
${VOCAB_SPEC}

JSON 结构：{"title":"","titleEn":"","searchKeyword":"","altKeywords":["",""],"sceneDesc":"","passCount":10,"coreWords":[],"advWords":[],"weakWords":[]}`;
}

export const VISION_SYSTEM = `你是英语看图词汇游戏 "PicWord Quest" 的关卡设计师，现在你能直接看到关卡使用的真实照片。
你的词库必须基于照片中【真实可见】的内容，不要臆测照片里没有的东西。只输出一个 JSON 对象。`;

/** 视觉模型看图校准（AI 搜图造关后）/ 给玩家上传图生成专属词库 */
export function buildVisionVocabPrompt(opts: { title?: string; userDesc?: string; difficulty?: string; draftDesc?: string }): string {
  const d = DIFFICULTY_GUIDE[opts.difficulty ?? 'medium'] ?? DIFFICULTY_GUIDE.medium;
  return `请仔细观察附上的照片${opts.title ? `（关卡标题暂定：「${opts.title}」）` : ''}。
${opts.userDesc ? `玩家对这张图的说明：${opts.userDesc}\n` : ''}${opts.draftDesc ? `检索这张图时的预期描述（仅供参考，以照片为准）：${opts.draftDesc}\n` : ''}
请输出：
- title：中文标题（≤ 10 字，描述照片主题）；titleEn：英文标题
- sceneDesc：用英文写 80~150 词，忠实描述【这张照片】的实际画面（主体、物件、位置关系、人物动作、颜色、光线）
- passCount：整数，难度 ${d.label}，建议 ${d.pass}（不能超过你给出的 core + adv 词数的 2/3）
${VOCAB_SPEC}

JSON 结构：{"title":"","titleEn":"","sceneDesc":"","passCount":8,"coreWords":[],"advWords":[],"weakWords":[]}`;
}

/** 纯文本模型：根据玩家的一句话描述生成自建关卡词库 */
export function buildTextVocabPrompt(opts: { title?: string; userDesc: string; difficulty?: string }): string {
  const d = DIFFICULTY_GUIDE[opts.difficulty ?? 'medium'] ?? DIFFICULTY_GUIDE.medium;
  return `玩家上传了一张自己的照片，但你看不到图片，只能根据玩家的描述来设计词库。
${opts.title ? `标题：「${opts.title}」\n` : ''}玩家描述：${opts.userDesc}

请输出：
- title：中文标题（≤ 10 字）；titleEn：英文标题
- sceneDesc：把玩家描述扩写成 80~150 词的英文画面描述（只写描述中提到或必然存在的东西，不要编造）
- passCount：整数，难度 ${d.label}，建议 ${d.pass}
${VOCAB_SPEC}

JSON 结构：{"title":"","titleEn":"","sceneDesc":"","passCount":8,"coreWords":[],"advWords":[],"weakWords":[]}`;
}

/** 盲盒灵感：客户端随机抽一个方向，避免模型总想到同几个场景 */
export const BLIND_BOX_IDEAS = [
  '城市交通与出行', '厨房与烹饪', '菜市场与超市', '校园与课堂', '办公室与职场', '医院与诊所', '机场与火车站',
  '海边与沙滩', '山林与露营', '农场与田园', '公园与游乐场', '咖啡馆与餐厅', '街头小吃与夜市', '体育运动与比赛',
  '节日与庆典', '动物园与宠物', '图书馆与书店', '建筑工地与维修', '雪景与冬季运动', '家居与家务', '音乐会与演出',
  '理发店与美容', '洗车与加油站', '花店与园艺', '博物馆与展览', '港口与渔船', '婚礼与派对', '实验室与科学',
  '消防与救援', '自行车与骑行', '雨天的街道', '早餐桌', '露天集市', '烘焙坊', '游泳池', '健身房', '洗衣房', '邮局与快递',
];
