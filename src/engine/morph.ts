// ============================================================
// 英文词形工具：规范化 / 词形变化生成 / 英美拼写
//
// 设计思路（与“剥后缀”相反）：
//   不去猜玩家输入的原形（"tomatos" 剥掉 s 会被误判成正确的 tomato），
//   而是从【词库原形】出发生成它所有合法变形（tomato → tomatoes），
//   玩家输入只要命中其中之一就是“拼写正确（含合理单复数/时态变形）”；
//   命中失败再做编辑距离纠错 —— 这样 "tomatos" 会被正确地判为 typo，
//   并提示正确拼写 tomatoes。
// ============================================================

/** 规范化：小写、去重音、连字符/下划线转空格、去冠词、去非字母 */
export function normalizeWord(raw: string): string {
  let s = raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // café → cafe（去掉组合重音符）
    .replace(/[’‘`]/g, "'")
    .replace(/'s\b/g, '') // 所有格 children's → children
    .replace(/[-_/]+/g, ' ')
    .replace(/[^a-z ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/^(a|an|the) (?=\S)/, ''); // a dog → dog
  return s;
}

/** 去空格形式：ice cream → icecream（玩家常把复合词连写） */
export const spaceless = (s: string) => s.replace(/ /g, '');

/** 输入是否像英文（字母开头，只含字母/空格/连字符/撇号） */
export function looksEnglish(raw: string): boolean {
  return /^[a-zA-Z][a-zA-Z\s'’\-]*$/.test(raw.trim());
}

// ------------------------------------------------------------
// 不规则变化表
// ------------------------------------------------------------

/** 不规则复数（原形 → 复数，可多个） */
const IRREGULAR_PLURAL: Record<string, string[]> = {
  person: ['people', 'persons'],
  man: ['men'],
  woman: ['women'],
  child: ['children'],
  foot: ['feet'],
  tooth: ['teeth'],
  goose: ['geese'],
  mouse: ['mice'],
  ox: ['oxen'],
  leaf: ['leaves'],
  knife: ['knives'],
  wife: ['wives'],
  life: ['lives'],
  loaf: ['loaves'],
  shelf: ['shelves'],
  half: ['halves'],
  wolf: ['wolves'],
  calf: ['calves'],
  scarf: ['scarves', 'scarfs'],
  thief: ['thieves'],
  sheep: ['sheep'],
  fish: ['fish', 'fishes'],
  deer: ['deer'],
  cactus: ['cacti', 'cactuses'],
  fungus: ['fungi'],
  bus: ['buses'],
  gas: ['gases'],
  quiz: ['quizzes'],
  photo: ['photos'],
  piano: ['pianos'],
  radio: ['radios'],
  video: ['videos'],
  zoo: ['zoos'],
  kilo: ['kilos'],
  studio: ['studios'],
  potato: ['potatoes'],
  tomato: ['tomatoes'],
  hero: ['heroes'],
  echo: ['echoes'],
  volcano: ['volcanoes', 'volcanos'],
  mango: ['mangoes', 'mangos'],
  bamboo: ['bamboos'],
  furniture: ['furniture'],
  luggage: ['luggage'],
  baggage: ['baggage'],
  equipment: ['equipment'],
  traffic: ['traffic'],
  scenery: ['scenery'],
  aircraft: ['aircraft'],
  series: ['series'],
};

/** 不规则动词（原形 → 过去式/过去分词） */
const IRREGULAR_VERB: Record<string, string[]> = {
  be: ['was', 'were', 'been', 'is', 'are', 'being'],
  have: ['had', 'has'],
  do: ['did', 'done', 'does'],
  go: ['went', 'gone', 'goes'],
  eat: ['ate', 'eaten'],
  sit: ['sat'],
  run: ['ran'],
  swim: ['swam', 'swum'],
  drink: ['drank', 'drunk'],
  drive: ['drove', 'driven'],
  ride: ['rode', 'ridden'],
  fly: ['flew', 'flown'],
  write: ['wrote', 'written'],
  stand: ['stood'],
  hold: ['held'],
  sell: ['sold'],
  buy: ['bought'],
  catch: ['caught'],
  teach: ['taught'],
  bring: ['brought'],
  think: ['thought'],
  make: ['made'],
  take: ['took', 'taken'],
  give: ['gave', 'given'],
  see: ['saw', 'seen'],
  come: ['came'],
  fall: ['fell', 'fallen'],
  grow: ['grew', 'grown'],
  throw: ['threw', 'thrown'],
  wear: ['wore', 'worn'],
  sing: ['sang', 'sung'],
  begin: ['began', 'begun'],
  break: ['broke', 'broken'],
  speak: ['spoke', 'spoken'],
  choose: ['chose', 'chosen'],
  freeze: ['froze', 'frozen'],
  hang: ['hung', 'hanged'],
  lie: ['lay', 'lain'],
  lay: ['laid'],
  lead: ['led'],
  leave: ['left'],
  light: ['lit', 'lighted'],
  meet: ['met'],
  pay: ['paid'],
  say: ['said'],
  send: ['sent'],
  shine: ['shone', 'shined'],
  sleep: ['slept'],
  spend: ['spent'],
  sweep: ['swept'],
  tell: ['told'],
  understand: ['understood'],
  win: ['won'],
  wake: ['woke', 'woken'],
  build: ['built'],
  dig: ['dug'],
  feed: ['fed'],
  fight: ['fought'],
  find: ['found'],
  hide: ['hid', 'hidden'],
  keep: ['kept'],
  kneel: ['knelt', 'kneeled'],
  lean: ['leant', 'leaned'],
  lose: ['lost'],
  shoot: ['shot'],
  sink: ['sank', 'sunk'],
  slide: ['slid'],
  spin: ['spun'],
  stick: ['stuck'],
  strike: ['struck'],
  swing: ['swung'],
  tear: ['tore', 'torn'],
  weep: ['wept'],
  wind: ['wound'],
  bend: ['bent'],
  bite: ['bit', 'bitten'],
  blow: ['blew', 'blown'],
  draw: ['drew', 'drawn'],
  dive: ['dove', 'dived'],
  forget: ['forgot', 'forgotten'],
  get: ['got', 'gotten'],
  know: ['knew', 'known'],
  rise: ['rose', 'risen'],
  shake: ['shook', 'shaken'],
  steal: ['stole', 'stolen'],
  feel: ['felt'],
  hear: ['heard'],
  put: ['put'],
  cut: ['cut'],
  hit: ['hit'],
  let: ['let'],
  set: ['set'],
  shut: ['shut'],
  spread: ['spread'],
  read: ['read'],
  cost: ['cost'],
  hurt: ['hurt'],
  bake: ['baked'],
  grind: ['ground'],
  stir: ['stirred'],
  fry: ['fried'],
  sew: ['sewed', 'sewn'],
  show: ['showed', 'shown'],
  sow: ['sowed', 'sown'],
  mow: ['mowed', 'mown'],
  bear: ['bore', 'born', 'borne'],
  smell: ['smelt', 'smelled'],
  burn: ['burnt', 'burned'],
  learn: ['learnt', 'learned'],
  dream: ['dreamt', 'dreamed'],
};

/** 不规则比较级 */
const IRREGULAR_ADJ: Record<string, string[]> = {
  good: ['better', 'best'],
  bad: ['worse', 'worst'],
  far: ['farther', 'farthest', 'further', 'furthest'],
  little: ['less', 'least'],
  many: ['more', 'most'],
};

/**
 * 英式 → 美式（显式表）：前半是拼写差异，后半是常见英美用词差异。
 * 只作为“查找候选”使用（精确命中永远优先），所以收录时刻意排除了
 * flat / lift / tap / bin / fall 这类一词多义、容易误判的词。
 */
const UK_US: Record<string, string> = {
  grey: 'gray',
  tyre: 'tire',
  kerb: 'curb',
  aeroplane: 'airplane',
  pyjamas: 'pajamas',
  jewellery: 'jewelry',
  mum: 'mom',
  aluminium: 'aluminum',
  plough: 'plow',
  cheque: 'check',
  programme: 'program',
  storey: 'story',
  doughnut: 'donut',
  moustache: 'mustache',
  draught: 'draft',
  sceptic: 'skeptic',
  catalogue: 'catalog',
  dialogue: 'dialog',
  colour: 'color',
  harbour: 'harbor',
  neighbour: 'neighbor',
  favourite: 'favorite',
  centre: 'center',
  theatre: 'theater',
  metre: 'meter',
  litre: 'liter',
  fibre: 'fiber',
  travelling: 'traveling',
  travelled: 'traveled',
  traveller: 'traveler',
  // —— 英美用词差异 ——
  trousers: 'pants',
  lorry: 'truck',
  pavement: 'sidewalk',
  motorway: 'highway',
  railway: 'railroad',
  queue: 'line',
  biscuit: 'cookie',
  rubbish: 'trash',
  football: 'soccer',
  trainers: 'sneakers',
  holiday: 'vacation',
  postman: 'mailman',
  'zebra crossing': 'crosswalk',
  underground: 'subway',
  cooker: 'stove',
  nappy: 'diaper',
  'car park': 'parking lot',
};

// ------------------------------------------------------------
// 变形生成
// ------------------------------------------------------------

const VOWELS = 'aeiou';
const isVowel = (c: string) => VOWELS.includes(c);

/** 单音节 CVC 结尾（run / sit / chop / big）→ 加后缀时双写末辅音 */
function shouldDouble(w: string): boolean {
  if (w.length < 3) return false;
  const last = w[w.length - 1];
  if ('wxy'.includes(last) || isVowel(last)) return false;
  const mid = w[w.length - 2];
  const before = w[w.length - 3];
  if (!isVowel(mid) || isVowel(before)) return false;
  // 只有一个元音组才视为单音节（open / visit 等多音节词不双写）
  const groups = w.match(/[aeiouy]+/g) ?? [];
  return groups.length === 1;
}

/** 重读在末音节、需双写的常见多音节动词 */
const DOUBLE_EXCEPTIONS = new Set([
  'begin', 'admit', 'commit', 'prefer', 'refer', 'occur', 'forget', 'permit',
  'regret', 'control', 'patrol', 'equip', 'upset', 'submit', 'travel', 'cancel', 'label',
]);

function canDouble(w: string) {
  return shouldDouble(w) || DOUBLE_EXCEPTIONS.has(w);
}

/** 名词复数（也用于动词第三人称单数） */
export function pluralForms(w: string): string[] {
  if (IRREGULAR_PLURAL[w]) return IRREGULAR_PLURAL[w];
  const out: string[] = [];
  if (/(s|x|z|ch|sh)$/.test(w)) out.push(w + 'es');
  else if (/[^aeiou]y$/.test(w)) out.push(w.slice(0, -1) + 'ies');
  else if (/[^aeiou]o$/.test(w)) out.push(w + 's', w + 'es');
  else if (/fe$/.test(w)) out.push(w + 's', w.slice(0, -2) + 'ves');
  else if (/[^f]f$/.test(w)) out.push(w + 's', w.slice(0, -1) + 'ves');
  else out.push(w + 's');
  return out;
}

/** 动词：第三人称 / -ing / -ed */
export function verbForms(w: string): string[] {
  const out: string[] = [];
  if (IRREGULAR_VERB[w]) out.push(...IRREGULAR_VERB[w]);
  // 第三人称单数
  if (w === 'have') out.push('has');
  else if (w === 'go' || w === 'do') out.push(w + 'es');
  else out.push(...pluralForms(w).filter((f) => f !== w));
  // -ing
  if (w === 'be') out.push('being');
  else if (/ie$/.test(w)) out.push(w.slice(0, -2) + 'ying');
  else if (/[^eoy]e$/.test(w)) out.push(w.slice(0, -1) + 'ing');
  else if (canDouble(w)) out.push(w + w[w.length - 1] + 'ing', w + 'ing');
  else out.push(w + 'ing');
  // -ed（不规则动词也补一份规则形式，兼容 learned/dreamed 等两可写法）
  if (!IRREGULAR_VERB[w] || ['hang', 'light', 'kneel', 'lean', 'shine', 'dive'].includes(w)) {
    if (/e$/.test(w)) out.push(w + 'd');
    else if (/[^aeiou]y$/.test(w)) out.push(w.slice(0, -1) + 'ied');
    else if (canDouble(w)) out.push(w + w[w.length - 1] + 'ed', w + 'ed');
    else out.push(w + 'ed');
  }
  return out;
}

/** 形容词比较级 / 最高级（只对短形容词生成） */
export function adjForms(w: string): string[] {
  if (IRREGULAR_ADJ[w]) return IRREGULAR_ADJ[w];
  if (w.length > 7) return [];
  if (/e$/.test(w)) return [w + 'r', w + 'st'];
  if (/[^aeiou]y$/.test(w)) return [w.slice(0, -1) + 'ier', w.slice(0, -1) + 'iest'];
  if (shouldDouble(w)) return [w + w[w.length - 1] + 'er', w + w[w.length - 1] + 'est'];
  return [w + 'er', w + 'est'];
}

/** 解析词性字符串 */
export function posFlags(pos: string) {
  const p = (pos || '').toLowerCase();
  const noun = /\bn\b|noun|名/.test(p);
  const verb = /\bv\b|verb|动/.test(p);
  const adj = /adj|形/.test(p);
  const known = noun || verb || adj || /adv|prep|phr|短语|副/.test(p);
  return { noun, verb, adj, known };
}

/**
 * 生成某个词条原形的所有合法变形（不含原形本身）。
 * 短语：名词性 → 变最后一个词（traffic light → traffic lights）；
 *       动词性 → 变第一个词（wait in line → waiting in line）。
 */
export function inflections(base: string, pos: string): string[] {
  const w = normalizeWord(base);
  if (!w) return [];
  const { noun, verb, adj, known } = posFlags(pos);
  const tokens = w.split(' ');
  const out = new Set<string>();

  const doNoun = noun || !known || pos.includes('phr');
  const doVerb = verb || !known || pos.includes('phr');

  if (tokens.length === 1) {
    if (doNoun) pluralForms(w).forEach((f) => out.add(f));
    if (doVerb) verbForms(w).forEach((f) => out.add(f));
    if (adj) adjForms(w).forEach((f) => out.add(f));
  } else {
    const head = tokens.slice(0, -1).join(' ');
    const last = tokens[tokens.length - 1];
    const first = tokens[0];
    const tail = tokens.slice(1).join(' ');
    if (doNoun) {
      pluralForms(last).forEach((f) => out.add(`${head} ${f}`));
      // cup of coffee → cups of coffee
      if (tokens.includes('of')) pluralForms(first).forEach((f) => out.add(`${f} ${tail}`));
    }
    if (doVerb) verbForms(first).forEach((f) => out.add(`${f} ${tail}`));
  }
  out.delete(w);
  return [...out];
}

/**
 * 从“可能已经是变形”的词条反推原形候选（AI 生成的词库里常出现
 * cooking / boarding 这类 -ing 形式，玩家写 cook / board 也应命中）。
 * 只做保守的剥后缀，结果仅作为低优先级索引键使用。
 */
export function baseCandidates(w: string): string[] {
  const out = new Set<string>();
  for (const [base, forms] of Object.entries(IRREGULAR_VERB)) if (forms.includes(w)) out.add(base);
  for (const [base, forms] of Object.entries(IRREGULAR_PLURAL)) if (forms.includes(w)) out.add(base);
  if (w.length > 5 && w.endsWith('ing')) {
    const stem = w.slice(0, -3);
    out.add(stem);
    out.add(stem + 'e');
    if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2]) out.add(stem.slice(0, -1));
  }
  if (w.length > 4 && w.endsWith('ied')) out.add(w.slice(0, -3) + 'y');
  else if (w.length > 4 && w.endsWith('ed')) {
    const stem = w.slice(0, -2);
    out.add(stem);
    out.add(stem + 'e');
    if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2]) out.add(stem.slice(0, -1));
  }
  if (w.length > 4 && w.endsWith('ies')) out.add(w.slice(0, -3) + 'y');
  else if (w.length > 4 && /(s|x|z|ch|sh)es$/.test(w)) out.add(w.slice(0, -2));
  else if (w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) out.add(w.slice(0, -1));
  out.delete(w);
  return [...out];
}

/** 英式拼写 → 美式候选（显式表 + 规则） */
export function usSpellings(w: string): string[] {
  const out = new Set<string>();
  if (UK_US[w]) out.add(UK_US[w]);
  for (const [uk, us] of Object.entries(UK_US)) if (us === w) out.add(uk);
  if (/our/.test(w) && w.length > 4) out.add(w.replace(/our(?=s?$|ed$|ing$|ite|able|hood)/, 'or'));
  if (/[^aeiou]re$/.test(w) && w.length > 4) out.add(w.slice(0, -2) + 'er');
  if (/ise$|ised$|ising$/.test(w)) out.add(w.replace(/is(e|ed|ing)$/, 'iz$1'));
  if (/yse$/.test(w)) out.add(w.slice(0, -3) + 'yze');
  if (/ll(ed|ing|er)$/.test(w)) out.add(w.replace(/ll(ed|ing|er)$/, 'l$1'));
  out.delete(w);
  return [...out];
}

/** 玩家输入的全部查找形式（按优先级） */
export function inputForms(raw: string): string[] {
  const n = normalizeWord(raw);
  if (!n) return [];
  const forms = [n];
  if (n.includes(' ')) forms.push(spaceless(n));
  for (const v of usSpellings(n)) forms.push(v);
  return [...new Set(forms)];
}
