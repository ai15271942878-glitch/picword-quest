// ============================================================
// 内置种子关卡池（Seed Level Pool）
//
// 每张图都是真实摄影照片（CC0，来源 StockSnap / WordPress Photo Directory /
// rawpixel 公有领域，经 Openverse 检索），已打包在 public/seed/，离线可用。
// 词库是 Claude 逐张【亲眼看过照片】后写的：词必须是画面里真看得到的，
// 关联度按“清晰可见的主体 85~100 / 可见的动作·状态·氛围 70~90 /
// 合理联想但画面未呈现 30~69”分级。
//
// 词条 DSL：每行  word | 词性 | 中文释义 | 关联度 | 同义词1, 同义词2…
// ============================================================

import type { ImageCredit, Level, WordEntry } from '../types';
import { defaultFullCount } from '../engine/scoring';

/** 解析词条 DSL */
function W(block: string): WordEntry[] {
  return block
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [word, pos, meaning, rel, alts] = line.split('|').map((s) => s.trim());
      const e: WordEntry = { word, pos, meaning, relevance: Number(rel) };
      if (alts) e.alts = alts.split(',').map((a) => a.trim()).filter(Boolean);
      return e;
    });
}

/** 主题 → 默认收藏文件夹 */
export const THEME_FOLDERS: Record<string, string> = {
  home: '居家生活',
  city: '现代都市',
  work: '职场办公',
  school: '校园学习',
  food: '美食餐饮',
  travel: '交通出行',
  nature: '自然风光',
  sport: '运动休闲',
};

const seedUrl = (file: string) => `${import.meta.env.BASE_URL}seed/${file}`;

interface SeedDef {
  key: string;
  title: string;
  titleEn: string;
  theme: keyof typeof THEME_FOLDERS;
  searchKeyword: string;
  passCount: number;
  credit: ImageCredit;
  sceneDesc: string;
  core: string;
  adv: string;
  weak: string;
}

const CC0 = 'CC0 公有领域';

const DEFS: SeedDef[] = [
  // ------------------------------------------------------------------ 1
  {
    key: 'kitchen',
    title: '厨房备菜',
    titleEn: 'Kitchen Prep',
    theme: 'home',
    searchKeyword: 'kitchen cooking ingredients',
    passCount: 6,
    credit: { provider: 'StockSnap', author: 'JESHOOTS.com', license: CC0, pageUrl: 'https://stocksnap.io/photo/cooking-food-CFBFE8F090', title: 'Cooking Food' },
    sceneDesc:
      'A bright home kitchen counter prepared for cooking an Italian meal. On a bamboo cutting board in the foreground lie two raw chicken breasts seasoned with black pepper, two long red chili peppers, a few fresh basil leaves and a small kitchen knife with a black handle. Behind them: a white bowl of uncooked penne pasta, a tall drinking glass filled with dry spaghetti, a white bowl of ripe red vine tomatoes, and a potted basil plant in a black pot on a white saucer. Small glass bowls (one with salt) sit on the left; a wooden chopping board leans against dark grey wall tiles; a stainless-steel sink is on the right.',
    core: `
      tomato | n. | 番茄 | 96 | cherry tomato
      spaghetti | n. | 意大利细面 | 95 | noodle
      pasta | n. | 意大利面食 | 94 | penne, macaroni
      chicken | n. | 鸡肉 | 94 | chicken breast
      basil | n. | 罗勒（九层塔） | 93
      chili | n. | 辣椒 | 93 | chilli, chile, chili pepper, red pepper, hot pepper
      knife | n. | 刀 | 92
      cutting board | n. | 砧板 | 92 | chopping board, board
      bowl | n. | 碗 | 92
      kitchen | n. | 厨房 | 90
      glass | n. | 玻璃杯 | 86 | jar
      plant | n. | 植物 | 86 | houseplant
      leaf | n. | 叶子 | 86
      herb | n. | 香草 | 86
      meat | n. | 肉 | 86
      ingredient | n. | 食材 | 85
      vegetable | n. | 蔬菜 | 84
      counter | n. | 台面 | 84 | countertop, worktop
      tile | n. | 瓷砖 | 84
      pot | n. | 花盆 | 82 | flowerpot, plant pot
      pepper | n. | 胡椒 | 82 | black pepper
      sink | n. | 水槽 | 82
      food | n. | 食物 | 82
      plate | n. | 盘子；碟子 | 78 | saucer, dish
      salt | n. | 盐 | 76
      wall | n. | 墙 | 75`,
    adv: `
      raw | adj. | 生的 | 88
      fresh | adj. | 新鲜的 | 88
      cook | v. | 烹饪 | 84
      wooden | adj. | 木制的 | 82
      season | v. | 调味 | 82
      uncooked | adj. | 未煮的 | 82
      prepare | v. | 准备（饭菜） | 80
      spicy | adj. | 辣的 | 80 | hot
      Italian | adj. | 意大利的 | 80
      chop | v. | 切碎 | 78 | cut, slice
      ripe | adj. | 成熟的 | 78
      red | adj. | 红色的 | 76
      healthy | adj. | 健康的 | 76
      green | adj. | 绿色的 | 75
      dried | adj. | 干的；风干的 | 74 | dry
      sharp | adj. | 锋利的 | 72
      transparent | adj. | 透明的 | 72 | clear`,
    weak: `
      recipe | n. | 食谱 | 60
      dinner | n. | 晚餐 | 58 | lunch, meal
      chef | n. | 厨师 | 55
      sauce | n. | 酱汁 | 50
      stove | n. | 炉灶 | 45 | oven
      garlic | n. | 大蒜 | 35`,
  },
  // ------------------------------------------------------------------ 2
  {
    key: 'street',
    title: '伦敦街头',
    titleEn: 'London High Street',
    theme: 'city',
    searchKeyword: 'busy street double decker bus',
    passCount: 10,
    credit: { provider: 'StockSnap', author: 'David Marcu', license: CC0, pageUrl: 'https://stocksnap.io/photo/streets-bus-96EF76D433', title: 'Streets Bus' },
    sceneDesc:
      'A busy shopping street in central London on a hazy winter afternoon. A red double-decker bus drives toward the camera in the middle of the road, motion-blurred, followed by a black taxi; a silver car speeds past in the foreground as a long blur. Wide sidewalks on both sides are crowded with pedestrians in winter coats and jackets. Grand historic stone buildings with many windows, iron balconies and columns line the street, with shops at ground level. Traffic lights on poles, a tall street lamp and black flags hang from the buildings on the right. The pale bright sky glows at the end of the street.',
    core: `
      bus | n. | 公共汽车 | 97 | double decker, double-decker, double-decker bus
      street | n. | 街道 | 94
      building | n. | 建筑物 | 94
      car | n. | 小汽车 | 92 | automobile
      pedestrian | n. | 行人 | 92 | passerby, walker
      city | n. | 城市 | 92 | downtown
      road | n. | 马路 | 90
      sidewalk | n. | 人行道 | 90 | pavement, footpath
      traffic | n. | 交通；车流 | 90
      traffic light | n. | 红绿灯 | 88 | traffic signal, stoplight
      shop | n. | 商店 | 88 | store, storefront, shopfront
      window | n. | 窗户 | 86
      person | n. | 人 | 86
      streetlight | n. | 路灯 | 85 | street lamp, streetlamp, lamppost, lamp post, street light, lamp
      vehicle | n. | 车辆 | 85
      crowd | n. | 人群 | 84
      flag | n. | 旗帜 | 82 | banner
      taxi | n. | 出租车 | 80 | cab
      balcony | n. | 阳台 | 80
      coat | n. | 外套 | 80 | jacket
      sky | n. | 天空 | 78
      lane | n. | 车道 | 76
      column | n. | 柱子 | 74 | pillar
      pole | n. | 杆子 | 72`,
    adv: `
      busy | adj. | 繁忙的 | 90 | bustling
      walk | v. | 走路 | 88
      crowded | adj. | 拥挤的 | 85
      drive | v. | 驾驶 | 84
      blurry | adj. | 模糊的 | 82 | blurred, motion blur
      urban | adj. | 城市的 | 82
      London | n. | 伦敦 | 82
      move | v. | 移动 | 80
      British | adj. | 英国的 | 80 | English
      historic | adj. | 历史悠久的 | 78 | historical, old, classic
      red | adj. | 红色的 | 78
      shopping | n. | 购物 | 78
      fast | adj. | 快速的 | 76 | quick
      cross | v. | 穿过（马路） | 76
      rush hour | n. | 高峰时段 | 74
      tall | adj. | 高的 | 72
      winter | n. | 冬天 | 72 | cold`,
    weak: `
      tourist | n. | 游客 | 60 | traveler
      evening | n. | 傍晚 | 55 | sunset
      noise | n. | 噪音 | 45 | noisy
      pollution | n. | 污染 | 40
      subway | n. | 地铁 | 35 | underground, tube, metro
      bicycle | n. | 自行车 | 35 | bike`,
  },
  // ------------------------------------------------------------------ 3
  {
    key: 'office',
    title: '办公室会议',
    titleEn: 'Office Meeting',
    theme: 'work',
    searchKeyword: 'office team meeting laptop',
    passCount: 10,
    credit: { provider: 'StockSnap', author: 'Direct Media', license: CC0, pageUrl: 'https://stocksnap.io/photo/business-people-IDYMLGDH3I', title: 'Business People' },
    sceneDesc:
      'A bright modern office meeting room with floor-to-ceiling windows and blurred greenery outside. A middle-aged man with a beard, wearing a navy sweater vest over a beige shirt and a wristwatch, sits on the edge of a white conference table and gestures with both hands while explaining something to his team. Two open laptops, a smartphone lying flat, glasses of water and a small succulent in a white pot are on the table. Colleagues listen attentively around the table: a woman in an olive jacket, a woman in a red top with long brown hair, a bearded man in a blue blazer and white shirt, and a blond woman in the foreground. A large potted plant stands on a cabinet on the right; a black office chair is partly visible.',
    core: `
      meeting | n. | 会议 | 96 | business meeting, conference
      laptop | n. | 笔记本电脑 | 95 | notebook computer
      office | n. | 办公室 | 94
      table | n. | 桌子 | 92 | desk, conference table
      colleague | n. | 同事 | 92 | coworker, co-worker, workmate
      team | n. | 团队 | 92
      employee | n. | 员工 | 88 | worker, staff
      window | n. | 窗户 | 88
      glass | n. | 玻璃杯 | 86
      phone | n. | 手机 | 86 | smartphone, cellphone, mobile phone, mobile
      teamwork | n. | 团队合作 | 86
      plant | n. | 植物 | 85 | houseplant, potted plant
      computer | n. | 电脑 | 85
      businessman | n. | 商务人士 | 85 | businesswoman, businessperson
      water | n. | 水 | 84
      manager | n. | 经理 | 84 | boss, leader
      business | n. | 商务；生意 | 84
      chair | n. | 椅子 | 82
      hand | n. | 手 | 80
      watch | n. | 手表 | 80 | wristwatch
      shirt | n. | 衬衫 | 78
      sweater | n. | 毛衣；毛背心 | 76 | vest, sweater vest
      succulent | n. | 多肉植物 | 74 | cactus
      blazer | n. | 西装外套 | 74 | suit, jacket
      pot | n. | 花盆 | 72 | flowerpot`,
    adv: `
      discuss | v. | 讨论 | 92 | discussion
      listen | v. | 倾听 | 88
      talk | v. | 交谈 | 88 | speak, chat
      explain | v. | 解释 | 86
      gesture | v. | 打手势 | 84
      present | v. | 汇报；展示 | 84 | presentation
      sit | v. | 坐 | 84
      modern | adj. | 现代的 | 82
      smile | v. | 微笑 | 80
      brainstorm | v. | 头脑风暴 | 80
      collaborate | v. | 合作 | 80 | cooperate, cooperation, collaboration
      bright | adj. | 明亮的 | 78
      professional | adj. | 专业的 | 78
      attentive | adj. | 专注的 | 76 | focused
      friendly | adj. | 友好的 | 76
      casual | adj. | 休闲的 | 74`,
    weak: `
      project | n. | 项目 | 62
      report | n. | 报告 | 55
      coffee | n. | 咖啡 | 45
      deadline | n. | 截止日期 | 45
      printer | n. | 打印机 | 35
      salary | n. | 薪水 | 30`,
  },
  // ------------------------------------------------------------------ 4
  {
    key: 'classroom',
    title: '老式教室',
    titleEn: 'Old Schoolhouse Classroom',
    theme: 'school',
    searchKeyword: 'old classroom wooden desks blackboard',
    passCount: 7,
    credit: { provider: 'rawpixel', author: 'rawpixel（公有领域）', license: CC0, pageUrl: 'https://www.rawpixel.com/image/5958768/free-public-domain-cc0-photo', title: 'Old classroom' },
    sceneDesc:
      'An empty old-fashioned one-room schoolhouse classroom, now a small museum. Rows of vintage wooden school desks with attached seats stand on a worn wooden plank floor, all facing the front. At the front wall is a large blackboard with colorful chalk writing; more chalkboards hang on the left and right walls (one announces a Sunday October 17th 2004 speaker series). Framed portraits of George Washington and Abraham Lincoln hang high on the pale green walls. An open doorway at the back lets in bright daylight; tall windows light the room. A large black cylindrical wood stove stands at the left with a green bench along the wall. In the right foreground is the teacher\'s desk with papers, documents, a book, a small slate and a red apple; a globe and a white vase sit on a shelf at the back right.',
    core: `
      classroom | n. | 教室 | 96 | schoolroom
      desk | n. | 课桌 | 95 | school desk
      blackboard | n. | 黑板 | 94 | chalkboard
      chair | n. | 椅子 | 92 | seat
      school | n. | 学校 | 90 | schoolhouse
      floor | n. | 地板 | 88 | floorboard
      window | n. | 窗户 | 88
      door | n. | 门 | 86 | doorway
      portrait | n. | 肖像画 | 84 | picture, painting, photo
      paper | n. | 纸 | 84 | document, sheet
      chalk | n. | 粉笔 | 82
      book | n. | 书 | 82
      apple | n. | 苹果 | 82
      globe | n. | 地球仪 | 80
      bench | n. | 长椅 | 80
      wall | n. | 墙 | 80
      row | n. | 一排 | 80
      frame | n. | 相框；画框 | 78 | picture frame
      stove | n. | 火炉 | 76 | heater, wood stove
      light | n. | 光线 | 76 | sunlight, daylight
      map | n. | 地图 | 72
      handwriting | n. | 字迹 | 72 | writing
      vase | n. | 花瓶 | 70`,
    adv: `
      wooden | adj. | 木制的 | 92
      old | adj. | 老旧的 | 88 | old-fashioned
      empty | adj. | 空的 | 88
      vintage | adj. | 复古的 | 84 | retro, antique
      historic | adj. | 历史的 | 80 | historical
      neat | adj. | 整齐的 | 78 | tidy, orderly
      quiet | adj. | 安静的 | 78 | silent
      traditional | adj. | 传统的 | 78
      bright | adj. | 明亮的 | 76
      write | v. | 书写 | 76
      learn | v. | 学习 | 74 | study
      teach | v. | 教 | 74
      brown | adj. | 棕色的 | 72
      green | adj. | 绿色的 | 72`,
    weak: `
      teacher | n. | 老师 | 62
      student | n. | 学生 | 62 | pupil
      lesson | n. | 课 | 60 | class
      homework | n. | 家庭作业 | 45
      exam | n. | 考试 | 40 | test
      bell | n. | 铃 | 40`,
  },
  // ------------------------------------------------------------------ 5
  {
    key: 'lecture',
    title: '大学讲堂',
    titleEn: 'University Lecture Hall',
    theme: 'school',
    searchKeyword: 'university lecture hall students',
    passCount: 12,
    credit: { provider: 'rawpixel', author: 'rawpixel（公有领域）', license: CC0, pageUrl: 'https://www.rawpixel.com/image/5959368/free-public-domain-cc0-photo', title: 'Lecture hall' },
    sceneDesc:
      'A large university lecture hall seen from the back of the tiered seating. Hundreds of students sit in long rows of wooden desks, many with laptops, notebooks and plastic water bottles; some wear hoodies, caps and glasses. At the front, a professor stands at a lectern on a low stage beneath two large projection screens showing handwritten mathematical formulas with integrals. Three projectors hang from the ceiling on metal arms, black loudspeakers are mounted on the wall, and rows of spotlights line the ceiling. Tall yellow-green panels flank the stage and two red fire extinguishers hang on the front wall. Aisles and stairs run between the seating blocks.',
    core: `
      student | n. | 学生 | 96 | undergraduate
      lecture hall | n. | 阶梯教室 | 95 | auditorium, lecture theater, lecture theatre, hall
      screen | n. | 屏幕；幕布 | 94 | projection screen
      lecture | n. | 讲座；讲课 | 92 | class
      projector | n. | 投影仪 | 92
      desk | n. | 课桌 | 90 | table
      university | n. | 大学 | 90 | college, campus
      professor | n. | 教授 | 88 | lecturer, teacher, instructor
      seat | n. | 座位 | 88 | chair
      formula | n. | 公式 | 88 | equation
      laptop | n. | 笔记本电脑 | 86 | computer
      math | n. | 数学 | 84 | mathematics, maths, calculus
      podium | n. | 讲台 | 84 | lectern
      row | n. | 一排 | 84
      audience | n. | 听众 | 84
      bottle | n. | 瓶子 | 82 | water bottle
      speaker | n. | 扬声器 | 80 | loudspeaker
      notebook | n. | 笔记本 | 80 | notepad
      stage | n. | 讲台；舞台 | 78
      light | n. | 灯 | 78 | spotlight, lamp
      fire extinguisher | n. | 灭火器 | 78 | extinguisher
      backpack | n. | 背包 | 76 | bag, schoolbag
      ceiling | n. | 天花板 | 76
      wall | n. | 墙 | 74
      aisle | n. | 过道 | 72 | stairs, staircase
      glasses | n. | 眼镜 | 72 | spectacles`,
    adv: `
      listen | v. | 听讲 | 90
      study | v. | 学习 | 88 | learn
      take notes | phr. | 记笔记 | 86 | take note, note-taking
      sit | v. | 坐 | 84
      teach | v. | 教 | 84
      academic | adj. | 学术的 | 82
      crowded | adj. | 拥挤的；座无虚席的 | 80 | full, packed
      attentive | adj. | 专注的 | 80 | focused
      explain | v. | 讲解 | 80
      huge | adj. | 巨大的 | 78 | large, big, spacious
      quiet | adj. | 安静的 | 74
      modern | adj. | 现代的 | 74
      calculate | v. | 计算 | 72 | calculation
      type | v. | 打字 | 70`,
    weak: `
      exam | n. | 考试 | 62 | test
      textbook | n. | 课本 | 60
      homework | n. | 作业 | 55 | assignment
      graduation | n. | 毕业 | 40
      degree | n. | 学位 | 40
      library | n. | 图书馆 | 35`,
  },
  // ------------------------------------------------------------------ 6
  {
    key: 'library',
    title: '宏伟图书馆',
    titleEn: 'Grand Library Atrium',
    theme: 'school',
    searchKeyword: 'grand library atrium bookshelves balconies',
    passCount: 18,
    credit: { provider: 'rawpixel', author: 'Carol M. Highsmith（美国国会图书馆，公有领域）', license: CC0, pageUrl: 'https://www.rawpixel.com/image/3094430/free-photo-image-school-buildings-america-building', title: 'Interior library' },
    sceneDesc:
      'A grand 19th-century library atrium shot symmetrically from one end. Five tiers of ornate cast-iron balconies with decorative railings rise on both sides, supported by tall white fluted columns, and every level is lined with dark wooden bookshelves full of old books. Light pours in from a large glass skylight in the ceiling far above, with arched windows at the far end. On the black-and-white checkered marble floor stand long wooden reading tables with simple wooden chairs, arranged in rows down the middle. Small wall lamps glow along the lower levels, and wooden cabinets stand between the columns. The hall is empty and quiet.',
    core: `
      library | n. | 图书馆 | 98
      book | n. | 书 | 96
      bookshelf | n. | 书架 | 95 | bookcase, shelf
      balcony | n. | 阳台；楼座 | 90 | gallery, tier
      column | n. | 柱子 | 90 | pillar
      table | n. | 桌子 | 90 | desk, reading table
      railing | n. | 栏杆 | 88 | balustrade, rail, banister
      chair | n. | 椅子 | 88 | seat
      floor | n. | 地板 | 88 | marble floor
      skylight | n. | 天窗 | 86 | glass roof
      ceiling | n. | 天花板 | 84 | roof
      lamp | n. | 灯 | 84 | light, wall lamp
      architecture | n. | 建筑 | 84 | building
      arch | n. | 拱门 | 82 | archway
      hall | n. | 大厅 | 82 | atrium, reading room
      window | n. | 窗户 | 80
      marble | n. | 大理石 | 80
      collection | n. | 藏书 | 78
      pattern | n. | 图案 | 76 | checkerboard
      cabinet | n. | 柜子 | 74 | drawer, card catalog
      row | n. | 一排 | 74
      wood | n. | 木头 | 74
      door | n. | 门 | 72
      iron | n. | 铁 | 72 | cast iron, metal`,
    adv: `
      grand | adj. | 宏伟的 | 90 | magnificent, majestic, splendid, impressive
      historic | adj. | 历史悠久的 | 86 | old, ancient, historical, classic
      quiet | adj. | 安静的 | 84 | silent
      empty | adj. | 空荡荡的 | 84
      symmetrical | adj. | 对称的 | 84 | symmetric
      ornate | adj. | 华丽的 | 82 | decorative, decorated
      read | v. | 阅读 | 82
      tall | adj. | 高大的 | 80 | high
      elegant | adj. | 优雅的 | 80 | beautiful
      study | v. | 学习 | 80
      wooden | adj. | 木制的 | 80
      black and white | adj. | 黑白相间的 | 80 | checkered, chequered
      spacious | adj. | 宽敞的 | 80 | huge, large, big, vast
      classical | adj. | 古典的 | 78 | neoclassical
      multilevel | adj. | 多层的 | 74 | multi-story, multistory
      bright | adj. | 明亮的 | 72
      rectangular | adj. | 长方形的 | 70`,
    weak: `
      knowledge | n. | 知识 | 65
      silence | n. | 寂静 | 62
      librarian | n. | 图书管理员 | 60
      museum | n. | 博物馆 | 55
      student | n. | 学生 | 55 | reader
      university | n. | 大学 | 50 | college`,
  },
  // ------------------------------------------------------------------ 7
  {
    key: 'sports',
    title: '绿茵足球赛',
    titleEn: 'Football Match',
    theme: 'sport',
    searchKeyword: 'soccer match players ball stadium',
    passCount: 10,
    credit: { provider: 'rawpixel', author: 'AMISOM（非盟驻索马里特派团，公有领域）', license: CC0, pageUrl: 'https://www.rawpixel.com/image/3372987/free-photo-image-soccer-play-field-activity', title: 'Football match' },
    sceneDesc:
      'A sunny football (soccer) match on a green artificial-turf pitch in a stadium. In the foreground a player in a red jersey with yellow trim, red shorts and yellow socks slides and falls while defending, as an opponent in a green-and-yellow jersey with number 15, green shorts and blue socks leaps forward; the ball flies in the air above them. Another red-shirted player runs in from the left, more players from both teams are in the background, and a referee in a yellow shirt and black shorts watches near an advertising board. Behind a green fence, spectators sit on light-blue concrete stands. White pitch lines and player shadows are visible on the grass.',
    core: `
      football | n. | 足球 | 96 | soccer, soccer ball, football match
      ball | n. | 球 | 95
      player | n. | 球员 | 95 | footballer, soccer player, athlete
      match | n. | 比赛 | 92 | game
      field | n. | 球场 | 90 | pitch
      team | n. | 球队 | 90
      grass | n. | 草地 | 88 | turf, lawn
      jersey | n. | 球衣 | 88 | shirt, uniform
      stadium | n. | 体育场 | 88 | arena
      referee | n. | 裁判 | 86
      spectator | n. | 观众 | 86 | fan, audience
      sport | n. | 运动 | 86
      stand | n. | 看台 | 82 | bleachers, grandstand
      sock | n. | 袜子 | 82
      shorts | n. | 短裤 | 82
      boot | n. | 球鞋 | 80 | cleat, football boot, soccer shoe, shoe, sneaker
      crowd | n. | 人群 | 80
      opponent | n. | 对手 | 80 | rival
      line | n. | 线 | 76 | white line, sideline
      fence | n. | 围栏 | 76
      leg | n. | 腿 | 76
      number | n. | 号码 | 74
      seat | n. | 座位 | 72
      shadow | n. | 影子 | 72
      goal | n. | 球门；进球 | 70`,
    adv: `
      kick | v. | 踢 | 92
      run | v. | 跑 | 88 | sprint
      compete | v. | 竞争；比赛 | 86 | competition
      jump | v. | 跳 | 86 | leap
      tackle | v. | 铲球；抢断 | 84 | slide tackle, slide
      defend | v. | 防守 | 82 | block
      fall | v. | 摔倒 | 80 | slip
      watch | v. | 观看 | 80
      sunny | adj. | 晴朗的 | 80 | bright
      fierce | adj. | 激烈的 | 80 | intense, competitive, exciting
      attack | v. | 进攻 | 78
      athletic | adj. | 健壮的；运动的 | 78 | fit, strong
      head | v. | 头球 | 76
      red | adj. | 红色的 | 74
      green | adj. | 绿色的 | 74
      yellow | adj. | 黄色的 | 72`,
    weak: `
      coach | n. | 教练 | 60
      score | n. | 比分 | 60
      champion | n. | 冠军 | 55 | trophy
      whistle | n. | 哨子 | 50
      victory | n. | 胜利 | 50 | win
      injury | n. | 受伤 | 45`,
  },
  // ------------------------------------------------------------------ 8
  {
    key: 'nightmarket',
    title: '曼谷夜市鸡饭摊',
    titleEn: 'Bangkok Street Food Stall',
    theme: 'food',
    searchKeyword: 'street food stall night bangkok',
    passCount: 12,
    credit: { provider: 'rawpixel', author: 'rawpixel（公有领域）', license: CC0, pageUrl: 'https://www.rawpixel.com/image/6074537/street-food-bangkok-thailand-asia', title: 'Street food Bangkok, Thailand' },
    sceneDesc:
      "A Thai street-food cart at night in Bangkok, brightly lit in front of a restaurant. A banner on top reads in Thai and English 'STEMED CHIKEN WITH RICE' (misspelled), with photos of chicken rice and cucumber slices and a small halal logo. Behind the glass display cabinet, whole steamed chickens hang from hooks under a warm lamp; a large metal tray of crispy fried chicken pieces sits in front. A vendor wearing an orange headscarf stands behind the cart among aluminium cooking pots, a white rice cooker, a ladle, green plastic baskets, stacked plastic cups and hanging plastic bags. On the right, a pile of trimmed young coconuts sits on a red table. Restaurant lights glow in the background.",
    core: `
      chicken | n. | 鸡；鸡肉 | 95
      stall | n. | 摊位 | 94 | stand, food stall, booth, food stand
      coconut | n. | 椰子 | 92
      food | n. | 食物 | 92 | street food
      rice | n. | 米饭 | 90
      sign | n. | 招牌 | 90 | signboard, banner
      cart | n. | 推车；餐车 | 88 | food cart, trolley
      vendor | n. | 摊贩 | 86 | seller, hawker
      pot | n. | 锅 | 86 | cooking pot, pan
      market | n. | 市场 | 84 | night market
      basket | n. | 篮子 | 84
      cabinet | n. | 柜子 | 82 | display case, showcase, glass case, display cabinet
      glass | n. | 玻璃 | 82
      bag | n. | 袋子 | 82 | plastic bag
      tray | n. | 托盘 | 82
      light | n. | 灯 | 82 | lamp, bulb, lightbulb
      rice cooker | n. | 电饭煲 | 78
      menu | n. | 菜单 | 78
      ladle | n. | 长柄勺 | 74 | scoop, spoon
      cup | n. | 杯子 | 74 | plastic cup
      picture | n. | 图片 | 72 | photo
      restaurant | n. | 餐馆 | 72
      headscarf | n. | 头巾 | 72 | hijab, scarf
      cucumber | n. | 黄瓜 | 72
      metal | n. | 金属 | 72 | steel, stainless steel`,
    adv: `
      fry | v. | 油炸 | 88 | deep-fry
      steam | v. | 蒸 | 88
      sell | v. | 卖 | 86
      hang | v. | 悬挂 | 84
      cook | v. | 烹饪 | 84
      Thai | adj. | 泰国的 | 84 | Thailand
      delicious | adj. | 美味的 | 82 | tasty, yummy
      bright | adj. | 明亮的 | 78 | glowing, lit
      crispy | adj. | 酥脆的 | 78 | crunchy
      misspelled | adj. | 拼写错误的 | 76 | misspelt, typo, spelling mistake
      local | adj. | 当地的 | 76
      halal | adj. | 清真的 | 74
      fresh | adj. | 新鲜的 | 74
      cheap | adj. | 便宜的 | 72 | affordable
      warm | adj. | 温暖的 | 70`,
    weak: `
      hungry | adj. | 饥饿的 | 60
      tourist | n. | 游客 | 55
      spicy | adj. | 辣的 | 55
      chopsticks | n. | 筷子 | 50
      noodle | n. | 面条 | 45
      money | n. | 钱 | 45 | cash`,
  },
  // ------------------------------------------------------------------ 9
  {
    key: 'construction',
    title: '道路施工现场',
    titleEn: 'Road Construction Site',
    theme: 'city',
    searchKeyword: 'construction site excavator workers',
    passCount: 12,
    credit: { provider: 'rawpixel', author: 'rawpixel（公有领域）', license: CC0, pageUrl: 'https://www.rawpixel.com/image/9658197/image-person-public-domain-construction', title: 'Town Creek Culvert intersection construction' },
    sceneDesc:
      'A busy road-construction site on a sunny day in a small town. Two large yellow tracked excavators dig a long trench through the street, their buckets raised; a yellow wheel loader stands at the left. Construction workers wear high-visibility safety vests in neon yellow and orange, hard hats (white, blue and yellow), gloves and jeans; three workers bend over in the trench with a shovel while a supervisor stands in the left foreground. Orange-and-white traffic cones, a steel trench box and piles of sandy dirt fill the road. Red brick buildings line the right side, with houses, bare trees, wooden utility poles and power lines under a pale blue sky.',
    core: `
      excavator | n. | 挖掘机 | 96 | digger
      worker | n. | 工人 | 95 | construction worker, laborer, labourer, builder
      construction site | n. | 建筑工地 | 94 | site, construction, work site, worksite
      hard hat | n. | 安全帽 | 92 | helmet, safety helmet, hardhat
      safety vest | n. | 安全背心 | 90 | vest, reflective vest, hi-vis vest
      cone | n. | 锥形桶 | 90 | traffic cone, safety cone
      dirt | n. | 泥土 | 88 | soil, earth, mud
      sand | n. | 沙子 | 86
      machine | n. | 机器 | 86 | machinery, heavy machinery, equipment
      trench | n. | 沟渠 | 84 | ditch, hole, pit
      road | n. | 道路 | 84 | street
      bucket | n. | 铲斗 | 82 | scoop
      building | n. | 建筑物 | 82 | house
      shovel | n. | 铁锹 | 80 | spade
      power line | n. | 电线 | 80 | wire, cable, electric wire
      pole | n. | 电线杆 | 80 | utility pole, telephone pole, power pole
      brick | n. | 砖 | 78
      loader | n. | 装载机 | 78 | backhoe, bulldozer, tractor
      pile | n. | 一堆 | 78 | heap, mound
      glove | n. | 手套 | 76
      jeans | n. | 牛仔裤 | 74
      hose | n. | 软管 | 74 | pipe
      tree | n. | 树 | 74
      track | n. | 履带 | 74 | crawler
      sky | n. | 天空 | 72`,
    adv: `
      dig | v. | 挖 | 94
      build | v. | 建造 | 86
      work | v. | 工作 | 86
      repair | v. | 修理 | 84 | fix, maintain
      yellow | adj. | 黄色的 | 82
      heavy | adj. | 重型的 | 82
      dusty | adj. | 尘土飞扬的 | 82 | dirty
      busy | adj. | 忙碌的 | 78
      safe | adj. | 安全的 | 78 | safety
      orange | adj. | 橙色的 | 76
      stand | v. | 站立 | 76
      supervise | v. | 监督 | 76 | inspect, oversee
      sunny | adj. | 晴朗的 | 76
      reflective | adj. | 反光的 | 74
      dangerous | adj. | 危险的 | 72 | danger`,
    weak: `
      engineer | n. | 工程师 | 62
      noise | n. | 噪音 | 58 | noisy
      crane | n. | 起重机 | 55
      cement | n. | 水泥 | 55 | concrete
      blueprint | n. | 蓝图 | 40 | plan
      skyscraper | n. | 摩天大楼 | 30`,
  },
  // ------------------------------------------------------------------ 10
  {
    key: 'snow',
    title: '滑雪场缆车',
    titleEn: 'Ski Slope & Chairlift',
    theme: 'sport',
    searchKeyword: 'ski slope chairlift skiers',
    passCount: 6,
    credit: { provider: 'rawpixel', author: 'rawpixel（公有领域）', license: CC0, pageUrl: 'https://www.rawpixel.com/image/5915538/image-public-domain-nature-person', title: 'Skiers on a slope' },
    sceneDesc:
      'A bright white ski slope at a winter resort seen from above. A long chairlift runs diagonally up the mountain: rows of two-seat lift chairs, many carrying skiers, hang from steel cables supported by black T-shaped lift towers with blue bases, and a tall red pole stands beside the line. Dozens of small skiers in colorful ski suits (red, yellow, black) glide and turn down the wide snowy slope, some in groups, a few snowboarders among them. Bare leafless trees stand at the lower right edge, and part of the lift station with its big wheel is at the bottom left. Everything is covered in deep snow.',
    core: `
      snow | n. | 雪 | 98
      skier | n. | 滑雪者 | 95
      ski | n./v. | 滑雪；滑雪板 | 94
      slope | n. | 斜坡；雪道 | 92 | ski slope, piste, hill, ski run, trail
      chairlift | n. | 吊椅缆车 | 92 | ski lift, lift, chair lift, cable car, gondola
      winter | n. | 冬天 | 92
      cable | n. | 缆绳 | 86 | wire, rope
      mountain | n. | 山 | 84 | mountainside
      resort | n. | 度假村 | 84 | ski resort
      tower | n. | 塔架 | 82 | pylon, support
      tree | n. | 树 | 82
      chair | n. | 椅子 | 80 | seat
      pole | n. | 杆子 | 80 | post
      snowboard | n. | 单板滑雪 | 76 | snowboarder, snowboarding
      crowd | n. | 人群 | 76
      ski suit | n. | 滑雪服 | 74 | jacket, coat
      line | n. | 一排 | 72 | row
      branch | n. | 树枝 | 72
      wheel | n. | 轮子 | 70`,
    adv: `
      cold | adj. | 寒冷的 | 90 | freezing, chilly
      white | adj. | 白色的 | 88
      snowy | adj. | 积雪的 | 88
      slide | v. | 滑行 | 84 | glide
      ride | v. | 乘坐 | 82
      steep | adj. | 陡峭的 | 82
      downhill | adv. | 下坡 | 82 | down
      busy | adj. | 热闹的 | 78 | crowded
      tiny | adj. | 很小的 | 76 | small, little
      fun | adj. | 有趣的 | 76 | exciting
      bare | adj. | 光秃秃的 | 74 | leafless
      fast | adj. | 快的 | 74 | quick`,
    weak: `
      holiday | n. | 假期 | 60 | vacation
      goggles | n. | 护目镜 | 60
      ice | n. | 冰 | 55
      snowman | n. | 雪人 | 40
      hot chocolate | n. | 热巧克力 | 35
      Christmas | n. | 圣诞节 | 35`,
  },
  // ------------------------------------------------------------------ 11
  {
    key: 'market',
    title: '街角水果摊',
    titleEn: 'Corner Fruit Stand',
    theme: 'food',
    searchKeyword: 'fruit stand baskets sidewalk',
    passCount: 6,
    credit: { provider: 'StockSnap', author: 'Leeroy', license: CC0, pageUrl: 'https://stocksnap.io/photo/fruits-vegetables-AA39511B59', title: 'Fruits Vegetables' },
    sceneDesc:
      'A sunny greengrocer fruit stand on a city sidewalk outside a small shop. Round wooden bushel baskets on the ground are piled high with red apples, green apples, bright oranges, yellow-green pears and mangoes; wicker baskets on the wooden shelves above hold melons, more pears, red tomatoes and other fruit. Chalkboard price signs (one reads 1.99) hang above the stand, and a sandwich-board chalkboard on the pavement advertises a special offer of 3 for $5. Young tomato plants stand between the baskets. On the right, the empty sidewalk leads down the street past bare trees and a parked bicycle.',
    core: `
      fruit | n. | 水果 | 98
      apple | n. | 苹果 | 95
      orange | n. | 橙子 | 94
      basket | n. | 篮子 | 94 | bushel basket, wicker basket
      market | n. | 市场 | 92 | fruit market, farmers market
      stall | n. | 摊位 | 92 | stand, fruit stand, fruit stall
      pear | n. | 梨 | 90
      tomato | n. | 番茄 | 90
      melon | n. | 甜瓜 | 86 | honeydew, cantaloupe
      shop | n. | 商店 | 86 | store, grocery, grocery store, greengrocer
      sign | n. | 招牌；价格牌 | 86 | chalkboard, blackboard
      price | n. | 价格 | 86 | price tag, tag, label
      sidewalk | n. | 人行道 | 84 | pavement
      mango | n. | 芒果 | 80
      produce | n. | 农产品 | 80
      shelf | n. | 架子 | 80 | rack
      plant | n. | 植物 | 78 | seedling
      vegetable | n. | 蔬菜 | 78
      street | n. | 街道 | 76 | road
      wood | n. | 木头 | 74
      tree | n. | 树 | 72
      bicycle | n. | 自行车 | 70 | bike`,
    adv: `
      fresh | adj. | 新鲜的 | 94
      colorful | adj. | 五颜六色的 | 90 | colourful, vivid
      ripe | adj. | 成熟的 | 86
      sell | v. | 出售 | 86 | sale
      wooden | adj. | 木制的 | 82
      juicy | adj. | 多汁的 | 80
      healthy | adj. | 健康的 | 80
      buy | v. | 购买 | 80 | purchase
      display | v. | 陈列 | 78
      red | adj. | 红色的 | 78
      green | adj. | 绿色的 | 76
      round | adj. | 圆的 | 76
      yellow | adj. | 黄色的 | 74
      organic | adj. | 有机的 | 74
      cheap | adj. | 便宜的 | 72 | discount, on sale
      sunny | adj. | 阳光明媚的 | 72`,
    weak: `
      customer | n. | 顾客 | 62 | shopper, buyer
      juice | n. | 果汁 | 50
      money | n. | 钱 | 50 | cash
      farmer | n. | 农民 | 45
      banana | n. | 香蕉 | 40
      watermelon | n. | 西瓜 | 40`,
  },
  // ------------------------------------------------------------------ 12
  {
    key: 'airport',
    title: '机场航站楼',
    titleEn: 'Airport Terminal',
    theme: 'travel',
    searchKeyword: 'airport terminal signs travelers',
    passCount: 10,
    credit: { provider: 'StockSnap', author: 'Skitter Photo', license: CC0, pageUrl: 'https://stocksnap.io/photo/airport-terminal-6CF5A4506E', title: 'Airport Terminal' },
    sceneDesc:
      "A busy transfer area inside Amsterdam Schiphol airport terminal. Large yellow overhead signs with black letters and arrows point the way: 'Gates DEFGH', 'Transfer T4-9', 'First aid', 'Airline lounges 25-52' on the left and 'Baggage hall', 'Arrivals hall', 'T2-T3 Transfer' on the right, with pictogram icons and a green emergency-exit sign. Under them, crowds of travelers hurry past in motion blur carrying backpacks, handbags, shopping bags and rolling suitcases. On the left are shops: an adidas sports store with orange football jerseys, a souvenir shop with postcard racks and an advertising billboard of a smiling couple; more shops and two round clocks are in the background. Bright ceiling, tall pillars and a shiny floor.",
    core: `
      airport | n. | 机场 | 98
      sign | n. | 指示牌 | 95 | signboard, signpost, board
      passenger | n. | 乘客 | 92 | traveler, traveller
      terminal | n. | 航站楼 | 92
      luggage | n. | 行李 | 90 | baggage
      gate | n. | 登机口 | 88
      arrow | n. | 箭头 | 86
      shop | n. | 商店 | 86 | store, duty-free shop, duty free
      suitcase | n. | 行李箱 | 84 | trolley case, roller bag
      backpack | n. | 背包 | 84 | rucksack
      arrival | n. | 到达 | 84 | arrivals
      transfer | n. | 中转 | 84 | transit, connection
      crowd | n. | 人群 | 84
      bag | n. | 包 | 82 | handbag, shopping bag
      souvenir | n. | 纪念品 | 82 | gift
      baggage hall | n. | 行李提取大厅 | 82 | baggage claim
      person | n. | 人 | 82
      lounge | n. | 休息室 | 80
      first aid | n. | 急救 | 80
      clock | n. | 时钟 | 80
      ceiling | n. | 天花板 | 76
      advertisement | n. | 广告 | 76 | ad, billboard, poster
      pillar | n. | 柱子 | 74 | column
      floor | n. | 地板 | 74
      jersey | n. | 球衣 | 72 | shirt, t-shirt
      postcard | n. | 明信片 | 72
      exit | n. | 出口 | 72 | emergency exit
      letter | n. | 字母 | 72`,
    adv: `
      travel | v. | 旅行 | 92 | trip
      busy | adj. | 繁忙的 | 90 | bustling
      walk | v. | 走路 | 88
      hurry | v. | 匆忙 | 84 | rush
      yellow | adj. | 黄色的 | 84
      blurry | adj. | 模糊的 | 84 | blurred, motion blur
      crowded | adj. | 拥挤的 | 82
      international | adj. | 国际的 | 82
      depart | v. | 出发；离港 | 80 | departure, departures
      arrive | v. | 到达 | 80
      carry | v. | 携带；提 | 78
      shopping | n. | 购物 | 78
      modern | adj. | 现代的 | 76
      bright | adj. | 明亮的 | 72
      direct | v. | 指引 | 72 | direction, directions
      Dutch | adj. | 荷兰的 | 70 | Amsterdam, Netherlands, Schiphol`,
    weak: `
      airplane | n. | 飞机 | 65 | plane, aircraft
      passport | n. | 护照 | 62
      ticket | n. | 机票 | 60 | boarding pass
      security | n. | 安检 | 50 | security check
      pilot | n. | 飞行员 | 45
      runway | n. | 跑道 | 40`,
  },
  // ------------------------------------------------------------------ 13
  {
    key: 'train',
    title: '高铁站台',
    titleEn: 'High-Speed Train Platform',
    theme: 'travel',
    searchKeyword: 'train station platform passengers luggage',
    passCount: 8,
    credit: { provider: 'WordPress Photo Directory', author: 'Nilo Velez', license: CC0, pageUrl: 'https://wordpress.org/photos/photo/205678ab0e/', title: 'A train station platform' },
    sceneDesc:
      'A long covered platform at a Spanish railway station. On the right, a sleek white high-speed train with a magenta stripe waits at the platform; its large windows reflect the light and a passenger can be seen inside. Another white train stands behind teal metal crowd barriers on the left. Passengers walk away from the camera along the grey-tiled platform: a man in a burgundy sweater with a black backpack carrying a jacket, a blue bag and a phone; a woman in a tan sheepskin coat with a red handbag; others pulling rolling suitcases. Orange traffic cones stand by the yellow safety line and the textured tactile paving at the platform edge. White pillars (one with a no-smoking sign), steel roof beams, a long strip of ceiling lights and a distant digital departure board complete the scene.',
    core: `
      train | n. | 火车 | 98 | high-speed train, bullet train
      platform | n. | 站台 | 95
      station | n. | 车站 | 94 | railway station, train station
      passenger | n. | 乘客 | 92 | traveler, traveller
      suitcase | n. | 行李箱 | 88 | luggage, baggage, trolley case
      backpack | n. | 背包 | 88 | rucksack
      window | n. | 车窗 | 86
      cone | n. | 锥形桶 | 84 | traffic cone
      roof | n. | 顶棚 | 82 | ceiling, canopy
      pillar | n. | 柱子 | 82 | column
      coat | n. | 外套 | 82 | jacket
      carriage | n. | 车厢 | 82 | coach, railcar, wagon
      barrier | n. | 护栏 | 80 | fence, railing
      sign | n. | 标志 | 80 | no smoking sign
      handbag | n. | 手提包 | 78 | bag, purse
      light | n. | 灯 | 78 | lamp
      track | n. | 轨道 | 76 | railway, rail, railroad
      line | n. | 黄线 | 76 | yellow line, safety line
      floor | n. | 地面 | 74 | ground, tile
      beam | n. | 横梁 | 72 | girder
      phone | n. | 手机 | 72 | smartphone, cellphone, mobile
      boot | n. | 靴子 | 72`,
    adv: `
      walk | v. | 走路 | 92
      travel | v. | 旅行 | 90 | trip, journey
      board | v. | 上车 | 84
      carry | v. | 携带 | 82
      wait | v. | 等候 | 80
      pull | v. | 拉（行李） | 80 | drag
      fast | adj. | 快速的 | 80 | high-speed, speedy
      long | adj. | 长的 | 80
      leave | v. | 离开 | 78 | depart, departure
      arrive | v. | 到达 | 78 | arrival
      modern | adj. | 现代的 | 78
      white | adj. | 白色的 | 76
      empty | adj. | 空旷的 | 74
      safety | n. | 安全 | 74 | safe
      covered | adj. | 有顶棚的 | 70`,
    weak: `
      ticket | n. | 车票 | 62
      seat | n. | 座位 | 60
      schedule | n. | 时刻表 | 55 | timetable
      conductor | n. | 列车员 | 50
      delay | n. | 晚点 | 45
      subway | n. | 地铁 | 45 | metro, underground`,
  },
  // ------------------------------------------------------------------ 14
  {
    key: 'beach',
    title: '海湾沙滩',
    titleEn: 'Cliff Cove Beach',
    theme: 'nature',
    searchKeyword: 'beach umbrellas cliffs sea',
    passCount: 8,
    credit: { provider: 'StockSnap', author: 'Dan Gold', license: CC0, pageUrl: 'https://stocksnap.io/photo/sea-ocean-5C6Y92Q2A8', title: 'Sea Ocean' },
    sceneDesc:
      "A popular sandy beach in a small cove on a sunny summer day. Golden limestone cliffs topped with green bushes surround the bay, and a tall rock stack rises from the shallow turquoise water near the shore; another rocky islet stands out at sea on the right. White waves and foam roll onto the golden sand. Dozens of colorful beach umbrellas (blue, yellow, green, pink, purple) shade sunbathers lying on towels, and rows of white sun loungers with parasols line the back of the beach next to a small beige hut. People walk along the water's edge, wade and swim. Footprints mark the sand; the clear blue sky meets the sea at the horizon.",
    core: `
      beach | n. | 海滩 | 98
      sea | n. | 大海 | 96 | ocean
      sand | n. | 沙子 | 95
      umbrella | n. | 遮阳伞 | 94 | beach umbrella, parasol, sunshade
      wave | n. | 海浪 | 92
      cliff | n. | 悬崖 | 92
      rock | n. | 岩石 | 92 | stone, boulder
      water | n. | 水 | 88
      coast | n. | 海岸 | 88 | coastline, shore, seashore, seaside
      towel | n. | 毛巾 | 86 | beach towel
      sunbather | n. | 晒日光浴的人 | 84 | bather
      sky | n. | 天空 | 84
      deck chair | n. | 躺椅 | 84 | sun lounger, lounger, beach chair, chair, sunbed
      swimmer | n. | 游泳者 | 82
      person | n. | 人 | 82
      bay | n. | 海湾 | 80 | cove
      crowd | n. | 人群 | 80
      swimsuit | n. | 泳衣 | 80 | bikini, swimwear, swimming trunks
      bush | n. | 灌木 | 74 | shrub
      footprint | n. | 脚印 | 74
      horizon | n. | 地平线 | 74
      hut | n. | 小屋 | 72 | kiosk, cabin
      island | n. | 小岛 | 72 | islet
      foam | n. | 浪花；泡沫 | 72 | surf`,
    adv: `
      summer | n. | 夏天 | 92
      sunny | adj. | 晴朗的 | 92 | sunshine
      swim | v. | 游泳 | 90
      sunbathe | v. | 晒日光浴 | 88 | tan, suntan
      relax | v. | 放松 | 86 | rest
      vacation | n. | 度假 | 86 | holiday
      lie | v. | 躺 | 84
      blue | adj. | 蓝色的 | 84 | turquoise
      colorful | adj. | 五颜六色的 | 84 | colourful
      hot | adj. | 炎热的 | 82 | warm
      crowded | adj. | 拥挤的 | 82 | busy
      walk | v. | 散步 | 80 | stroll
      clear | adj. | 清澈的 | 80 | transparent
      golden | adj. | 金色的 | 78
      calm | adj. | 平静的 | 70`,
    weak: `
      sunscreen | n. | 防晒霜 | 60 | sunblock
      shell | n. | 贝壳 | 55 | seashell
      lifeguard | n. | 救生员 | 55
      seagull | n. | 海鸥 | 45 | gull
      boat | n. | 船 | 45
      crab | n. | 螃蟹 | 35`,
  },
  // ------------------------------------------------------------------ 15
  {
    key: 'mountain',
    title: '高山湖畔露营',
    titleEn: 'Alpine Lake Camping',
    theme: 'nature',
    searchKeyword: 'mountain lake tents camping',
    passCount: 7,
    credit: { provider: 'StockSnap', author: 'Dino Reichmuth', license: CC0, pageUrl: 'https://stocksnap.io/photo/sunlight-sunny-5SB1IJ2O5M', title: 'Sunlight Sunny' },
    sceneDesc:
      'Wild camping in the Swiss Alps on a clear summer morning. Two small dome tents, one pink-magenta and one pale teal, are pitched on a green grassy meadow dotted with tiny white wildflowers on a hillside. Below lies a calm blue-grey mountain lake reflecting the dark forest and cliffs. Steep grey limestone cliffs and rocky mountainsides rise on the left and right, the right slope lit golden by sunlight, with a single tall dark fir tree standing beside the tents. A deep valley with pine forest leads to distant snow-capped peaks wrapped in haze and thin clouds under a pale sky.',
    core: `
      tent | n. | 帐篷 | 97
      mountain | n. | 山 | 96
      lake | n. | 湖 | 95
      tree | n. | 树 | 92 | pine tree, fir, fir tree, pine, conifer
      grass | n. | 草 | 90 | lawn
      cliff | n. | 悬崖 | 88 | rock face
      valley | n. | 山谷 | 88
      rock | n. | 岩石 | 86 | stone
      forest | n. | 森林 | 86 | woods
      peak | n. | 山峰 | 86 | summit, mountaintop
      campsite | n. | 营地 | 84 | camp site, campground
      meadow | n. | 草甸 | 82
      snow | n. | 雪 | 82
      sky | n. | 天空 | 82
      sunlight | n. | 阳光 | 82 | sunshine, sun
      hill | n. | 小山；山坡 | 80 | hillside, slope
      water | n. | 水 | 80
      Alps | n. | 阿尔卑斯山 | 78
      flower | n. | 花 | 76 | wildflower
      cloud | n. | 云 | 74 | mist, fog, haze
      reflection | n. | 倒影 | 74
      shadow | n. | 阴影 | 72`,
    adv: `
      camp | v. | 露营 | 94
      peaceful | adj. | 宁静的 | 86 | quiet, calm, tranquil, serene
      beautiful | adj. | 美丽的 | 86 | scenic, picturesque, stunning
      steep | adj. | 陡峭的 | 84
      hike | v. | 徒步 | 82 | trek
      green | adj. | 绿色的 | 82
      outdoor | adj. | 户外的 | 82 | outdoors, outside
      alpine | adj. | 高山的 | 80
      high | adj. | 高的 | 80 | tall
      natural | adj. | 自然的 | 80 | nature
      remote | adj. | 偏远的 | 78 | wild
      pink | adj. | 粉色的 | 76 | magenta
      sunny | adj. | 晴朗的 | 76
      summer | n. | 夏天 | 74
      misty | adj. | 有雾的 | 72 | hazy, foggy
      fresh | adj. | 清新的 | 72`,
    weak: `
      hiker | n. | 徒步者 | 62
      backpack | n. | 背包 | 55 | rucksack
      sleeping bag | n. | 睡袋 | 55
      campfire | n. | 篝火 | 50 | fire
      eagle | n. | 鹰 | 35
      fish | n. | 鱼 | 35`,
  },
  // ------------------------------------------------------------------ 16
  {
    key: 'farm',
    title: '日落牧场羊群',
    titleEn: 'Sheep at Sunset',
    theme: 'nature',
    searchKeyword: 'sheep lambs pasture trees sunset',
    passCount: 6,
    credit: { provider: 'StockSnap', author: 'Ian Livesey', license: CC0, pageUrl: 'https://stocksnap.io/photo/sheep-animals-GESAAO0AP3', title: 'Sheep Animals' },
    sceneDesc:
      'Sheep and young lambs grazing in a green pasture at golden hour on an early spring evening in the countryside. In the foreground, two woolly adult sheep eat grass while several small white lambs stand and look at the camera; more sheep are scattered across the field. Huge old oak trees with bare, leafless branches frame the scene, with a thick trunk and roots on the right. In the distance, grey dry-stone walls divide the fields, a white farmhouse sits at the edge, and wooded hills roll toward the horizon under a blue sky with soft pink and golden clouds. Long shadows stretch across the grass.',
    core: `
      sheep | n. | 羊；绵羊 | 98
      lamb | n. | 小羊羔 | 94
      tree | n. | 树 | 94 | oak, oak tree
      grass | n. | 草 | 92
      field | n. | 田野；牧场 | 92 | pasture, meadow, paddock
      farm | n. | 农场 | 90 | farmland, ranch
      branch | n. | 树枝 | 88
      sky | n. | 天空 | 88
      animal | n. | 动物 | 88 | livestock
      countryside | n. | 乡村 | 88 | country
      trunk | n. | 树干 | 86
      cloud | n. | 云 | 86
      flock | n. | 羊群 | 86 | herd
      hill | n. | 小山 | 84 | hillside
      sunset | n. | 日落 | 84 | dusk, golden hour
      wool | n. | 羊毛 | 82 | fleece
      landscape | n. | 风景 | 82 | scenery, view
      wall | n. | 石墙 | 80 | stone wall, dry stone wall
      sunlight | n. | 阳光 | 80 | sunshine, light
      shadow | n. | 影子 | 78
      root | n. | 树根 | 72
      forest | n. | 树林 | 72 | woods
      house | n. | 房子 | 70 | farmhouse`,
    adv: `
      graze | v. | 吃草 | 94
      peaceful | adj. | 宁静的 | 90 | calm, quiet, tranquil, serene
      green | adj. | 绿色的 | 88
      rural | adj. | 乡村的 | 86 | pastoral
      fluffy | adj. | 毛茸茸的 | 84 | woolly, woolen
      eat | v. | 吃 | 82
      bare | adj. | 光秃秃的 | 82 | leafless
      golden | adj. | 金色的 | 80
      spring | n. | 春天 | 80
      white | adj. | 白色的 | 78
      evening | n. | 傍晚 | 78
      stand | v. | 站立 | 76
      old | adj. | 古老的 | 76 | ancient
      cute | adj. | 可爱的 | 76 | adorable
      warm | adj. | 温暖的 | 72`,
    weak: `
      farmer | n. | 农民 | 60
      fence | n. | 栅栏 | 60
      barn | n. | 谷仓 | 50
      cow | n. | 奶牛 | 45 | cattle
      dog | n. | 狗 | 40 | sheepdog
      tractor | n. | 拖拉机 | 35`,
  },
  // ------------------------------------------------------------------ 17
  {
    key: 'park',
    title: '秋日林荫道',
    titleEn: 'Autumn Park Avenue',
    theme: 'nature',
    searchKeyword: 'autumn park avenue trees bench',
    passCount: 6,
    credit: { provider: 'StockSnap', author: 'Johannes Plenio', license: CC0, pageUrl: 'https://stocksnap.io/photo/city-park-T1OTQKYUPM', title: 'City Park' },
    sceneDesc:
      'A long straight avenue of trees in a city park in autumn. Two rows of tall trees with dark trunks form a tunnel of green and golden-yellow leaves overhead, and the sandy path below is completely carpeted with fallen orange and yellow leaves. On the left a young woman sits alone on a wooden bench beside a metal railing along a river; further down another person sits on a bench. A stone monument stands between the trees on the left. In the distance are pale city buildings, a grey lamppost and green hedges on the right. The scene is calm, colorful and seasonal.',
    core: `
      tree | n. | 树 | 98
      leaf | n. | 树叶 | 96 | foliage
      autumn | n. | 秋天 | 96 | fall
      park | n. | 公园 | 94
      bench | n. | 长椅 | 90
      path | n. | 小路 | 90 | walkway, footpath, avenue, alley, lane
      trunk | n. | 树干 | 86
      ground | n. | 地面 | 82
      branch | n. | 树枝 | 82
      row | n. | 一排 | 82
      woman | n. | 女人 | 80 | girl, lady
      person | n. | 人 | 78
      building | n. | 建筑物 | 76
      railing | n. | 栏杆 | 74 | fence, rail
      city | n. | 城市 | 74
      shade | n. | 树荫 | 74
      hedge | n. | 树篱 | 72 | bush
      river | n. | 河 | 70 | canal
      lamppost | n. | 灯柱 | 70 | pole, street lamp, lamp post
      monument | n. | 纪念碑 | 70 | pillar, stone
      gravel | n. | 碎石 | 70 | sand, dirt`,
    adv: `
      yellow | adj. | 黄色的 | 90
      fallen | adj. | 落下的 | 88
      golden | adj. | 金色的 | 86
      peaceful | adj. | 宁静的 | 86 | quiet, calm, tranquil
      orange | adj. | 橙色的 | 84
      green | adj. | 绿色的 | 84
      colorful | adj. | 五彩缤纷的 | 82 | colourful
      sit | v. | 坐 | 82
      relax | v. | 放松 | 80 | rest
      walk | v. | 散步 | 80 | stroll
      beautiful | adj. | 美丽的 | 80 | lovely, scenic, picturesque
      tall | adj. | 高大的 | 78
      straight | adj. | 笔直的 | 74
      empty | adj. | 空旷的 | 72
      cool | adj. | 凉爽的 | 72
      seasonal | adj. | 季节性的 | 70`,
    weak: `
      wind | n. | 风 | 55 | windy
      squirrel | n. | 松鼠 | 45
      picnic | n. | 野餐 | 45
      jogger | n. | 慢跑者 | 45 | runner
      dog | n. | 狗 | 40
      rain | n. | 雨 | 30`,
  },
  // ------------------------------------------------------------------ 18
  {
    key: 'cafe',
    title: '复古咖啡馆',
    titleEn: 'Vintage Coffee Shop',
    theme: 'food',
    searchKeyword: 'coffee shop interior chalkboard menu',
    passCount: 12,
    credit: { provider: 'StockSnap', author: 'Afta Putta Gunawan', license: CC0, pageUrl: 'https://stocksnap.io/photo/restaurant-bar-THXU08ODDE', title: 'Restaurant Bar' },
    sceneDesc:
      "The cozy, dimly lit interior of a vintage-style coffee shop at night, with exposed red brick walls and an industrial look. A large chalkboard menu on the right wall lists drinks and prices (Affogato, Americano, Cappuccino, French press, V60, Japanese brew). Two silver industrial pendant lamps and a bare Edison light bulb hang from the ceiling. An old bicycle is mounted high on the wall above a painted 'Coffee Rider' logo, beside framed pictures and wooden signs reading 'Eat, Drink, Relax, Be Happy', plus small Wi-Fi and no-smoking signs. On the long wooden counter stand glass jars of coffee beans, a coffee grinder, a silver gooseneck kettle, pour-over drippers, cups, bags of coffee and a small tablet screen; a glass-door drinks fridge and a wooden shelf of glasses are behind. Wooden bar stools and chairs stand around, and a few customers sit in the shadows on the left.",
    core: `
      cafe | n. | 咖啡馆 | 98 | coffee shop, coffeehouse, coffee house
      coffee | n. | 咖啡 | 96
      menu | n. | 菜单 | 94 | chalkboard, blackboard
      counter | n. | 吧台；柜台 | 92 | bar, coffee bar
      lamp | n. | 灯 | 92 | pendant lamp, light, pendant light
      brick | n. | 砖 | 90 | brick wall
      bicycle | n. | 自行车 | 88 | bike
      jar | n. | 玻璃罐 | 86 | glass jar
      bulb | n. | 灯泡 | 84 | light bulb, lightbulb
      kettle | n. | 水壶 | 84
      cup | n. | 杯子 | 84 | mug
      grinder | n. | 磨豆机 | 82 | coffee grinder
      coffee bean | n. | 咖啡豆 | 82 | bean
      fridge | n. | 冰箱 | 82 | refrigerator
      shelf | n. | 架子 | 82
      stool | n. | 凳子 | 82 | bar stool
      glass | n. | 玻璃杯 | 80
      chair | n. | 椅子 | 80
      customer | n. | 顾客 | 80 | guest
      sign | n. | 标牌 | 80 | no smoking
      wall | n. | 墙 | 80
      picture | n. | 图画；相框 | 78 | frame, painting, photo
      espresso | n. | 浓缩咖啡 | 78 | americano, cappuccino, latte
      price | n. | 价格 | 76
      logo | n. | 标志 | 72
      bag | n. | 袋子 | 72 | package
      wifi | n. | 无线网络 | 72 | wi-fi, wireless
      tablet | n. | 平板电脑 | 70 | screen, ipad`,
    adv: `
      cozy | adj. | 温馨舒适的 | 90 | cosy, comfortable
      vintage | adj. | 复古的 | 86 | retro, old-fashioned, rustic
      warm | adj. | 温暖的 | 84
      drink | v. | 喝 | 84
      dim | adj. | 昏暗的 | 82 | dark
      relax | v. | 放松 | 82
      brew | v. | 冲泡 | 82
      hang | v. | 悬挂 | 82
      industrial | adj. | 工业风的 | 80
      eat | v. | 吃 | 76
      order | v. | 点单 | 76
      handwritten | adj. | 手写的 | 76
      night | n. | 夜晚 | 74 | evening
      happy | adj. | 快乐的 | 72
      quiet | adj. | 安静的 | 72
      trendy | adj. | 时髦的 | 70 | stylish, hipster`,
    weak: `
      barista | n. | 咖啡师 | 65
      milk | n. | 牛奶 | 55
      cake | n. | 蛋糕 | 50 | dessert
      sugar | n. | 糖 | 50
      music | n. | 音乐 | 45
      laptop | n. | 笔记本电脑 | 40`,
  },
  // ------------------------------------------------------------------ 19
  {
    key: 'harbor',
    title: '海岛港湾',
    titleEn: 'Island Harbor',
    theme: 'nature',
    searchKeyword: 'harbor boats palm trees hills',
    passCount: 7,
    credit: { provider: 'StockSnap', author: 'Jay Mantri', license: CC0, pageUrl: 'https://stocksnap.io/photo/catalina-island-SDM5VVA8VF', title: 'Catalina Island' },
    sceneDesc:
      'A sunny harbor town on Catalina Island, California. Dozens of white sailboats with tall masts and motor yachts float at their moorings in the calm blue bay, with small white buoys dotted across the water. Along the waterfront are white houses and buildings with dark roofs, rows of tall palm trees and a wooden pier on the right with a flag on a pole. Hotels and houses climb the green hillside on the left. Behind the town, green rolling hills and mountains rise under a clear, pale blue, slightly hazy sky, lit by warm low sunlight.',
    core: `
      boat | n. | 船 | 97
      harbor | n. | 港湾 | 96 | harbour, port, marina
      sailboat | n. | 帆船 | 92 | sailing boat
      hill | n. | 小山 | 92 | hillside
      palm tree | n. | 棕榈树 | 90 | palm
      yacht | n. | 游艇 | 88 | motorboat, speedboat
      water | n. | 水 | 88
      mountain | n. | 山 | 88
      mast | n. | 桅杆 | 86
      sea | n. | 海 | 86 | ocean
      bay | n. | 海湾 | 86
      house | n. | 房子 | 86 | home
      town | n. | 小镇 | 86 | village, city
      building | n. | 建筑物 | 84
      sky | n. | 天空 | 84
      pier | n. | 码头 | 84 | dock, wharf, jetty
      island | n. | 岛 | 82
      tree | n. | 树 | 80
      buoy | n. | 浮标 | 78
      coast | n. | 海岸 | 78 | shore, waterfront, seaside
      flag | n. | 旗子 | 72 | flagpole
      roof | n. | 屋顶 | 72
      hotel | n. | 酒店 | 70
      reflection | n. | 倒影 | 70`,
    adv: `
      calm | adj. | 平静的 | 88 | still
      float | v. | 漂浮 | 86
      sunny | adj. | 晴朗的 | 86 | sunshine
      peaceful | adj. | 宁静的 | 84 | quiet, tranquil, serene
      green | adj. | 绿色的 | 84
      anchor | v. | 停泊 | 82 | moor
      sail | v. | 航行 | 82
      white | adj. | 白色的 | 80
      clear | adj. | 晴朗的；清澈的 | 80
      coastal | adj. | 沿海的 | 78
      scenic | adj. | 风景优美的 | 78 | beautiful, picturesque
      relaxing | adj. | 令人放松的 | 76 | relax
      blue | adj. | 蓝色的 | 76
      tropical | adj. | 热带的 | 72
      hazy | adj. | 朦胧的 | 72 | misty
      summer | n. | 夏天 | 72`,
    weak: `
      ship | n. | （大）轮船 | 60
      fisherman | n. | 渔夫 | 55 | fishing
      seagull | n. | 海鸥 | 55 | gull
      fish | n. | 鱼 | 45
      lighthouse | n. | 灯塔 | 40
      cruise | n. | 邮轮 | 40`,
  },
  // ------------------------------------------------------------------ 20
  {
    key: 'livingroom',
    title: '北欧风客厅',
    titleEn: 'Scandinavian Living Room',
    theme: 'home',
    searchKeyword: 'living room interior sofa plants',
    passCount: 8,
    credit: { provider: 'StockSnap', author: 'Jarosław Ceborski', license: CC0, pageUrl: 'https://stocksnap.io/photo/interior-living-6SMA09U7Y8', title: 'Interior Living' },
    sceneDesc:
      'A bright, minimalist Scandinavian-style living room in daylight. On the left is a deep blue velvet sofa with a dark cushion printed with golden pineapples. A large white window with a wooden sill and a white radiator below is framed by long curtains with a black-and-white pattern. In the corner stands a white molded armchair with metal wire legs covered by a fluffy white sheepskin, next to a white floor lamp. A long white floating TV cabinet runs along the right wall, holding three green potted plants (monstera and palm), two brass candlesticks with white candles and a large flat-screen television. The floor is light wooden herringbone parquet, and the walls are plain white.',
    core: `
      living room | n. | 客厅 | 96 | lounge, sitting room
      sofa | n. | 沙发 | 96 | couch, settee
      television | n. | 电视 | 94 | tv, tv set, telly
      window | n. | 窗户 | 92
      curtain | n. | 窗帘 | 90 | drape
      chair | n. | 椅子 | 90 | armchair
      plant | n. | 植物 | 90 | houseplant, potted plant
      lamp | n. | 落地灯 | 88 | floor lamp, light
      floor | n. | 地板 | 88 | wooden floor, parquet
      furniture | n. | 家具 | 88
      cushion | n. | 靠垫 | 86 | pillow
      cabinet | n. | 柜子 | 86 | tv stand, sideboard, console, cupboard
      candle | n. | 蜡烛 | 84
      radiator | n. | 暖气片 | 82 | heater
      apartment | n. | 公寓 | 82 | flat, home, house
      pot | n. | 花盆 | 80 | flowerpot, vase
      wall | n. | 墙 | 80
      candlestick | n. | 烛台 | 78 | candle holder
      leaf | n. | 叶子 | 76
      fur | n. | 毛皮 | 74 | sheepskin, rug, blanket, throw
      ceiling | n. | 天花板 | 72
      windowsill | n. | 窗台 | 72 | window sill, sill
      pattern | n. | 图案 | 72`,
    adv: `
      bright | adj. | 明亮的 | 90 | sunny
      clean | adj. | 干净的 | 86 | tidy, neat
      modern | adj. | 现代的 | 86
      minimalist | adj. | 极简的 | 84 | minimal, simple
      cozy | adj. | 舒适的 | 84 | comfortable, cosy
      white | adj. | 白色的 | 84
      blue | adj. | 蓝色的 | 82
      wooden | adj. | 木制的 | 80
      Scandinavian | adj. | 北欧风格的 | 78 | Nordic
      spacious | adj. | 宽敞的 | 78 | roomy
      relax | v. | 放松 | 76 | rest
      green | adj. | 绿色的 | 76
      soft | adj. | 柔软的 | 74 | fluffy
      empty | adj. | 空无一人的 | 72
      natural | adj. | 自然的 | 72 | daylight
      quiet | adj. | 安静的 | 72`,
    weak: `
      remote control | n. | 遥控器 | 55 | remote
      carpet | n. | 地毯 | 55
      family | n. | 家人 | 50
      movie | n. | 电影 | 50 | film
      bookshelf | n. | 书架 | 40
      cat | n. | 猫 | 35`,
  },
  // ------------------------------------------------------------------ 21
  {
    key: 'gym',
    title: '健身房',
    titleEn: 'Fitness Gym',
    theme: 'sport',
    searchKeyword: 'gym interior exercise bikes barbell',
    passCount: 10,
    credit: { provider: 'StockSnap', author: 'Humphrey Muleba', license: CC0, pageUrl: 'https://stocksnap.io/photo/gym-interior-LNCLN1NE6K', title: 'Gym Interior' },
    sceneDesc:
      'The empty, bright interior of a modern gym. In the right foreground stands a black squat rack with orange feet and J-hooks holding a loaded barbell with a black 10 kg weight plate printed in green. In the middle, a row of black-and-orange exercise (spin) bikes faces a flat-screen TV on the white wall, next to a grey cable machine with pulleys and handles. Another exercise bike and a small round high table with metal legs are on the left. Black rubber mats cover part of the light floor; the white ceiling has round spotlights and an air vent, and a black metal shelf stacked with white towels stands on the right.',
    core: `
      gym | n. | 健身房 | 98 | fitness center, fitness centre, health club
      exercise bike | n. | 动感单车 | 92 | spin bike, stationary bike, bike, bicycle, spinning bike
      barbell | n. | 杠铃 | 92 | bar
      weight | n. | 杠铃片；重量 | 90 | weight plate, plate, disc
      equipment | n. | 器材 | 90
      mat | n. | 垫子 | 88 | floor mat, rubber mat
      rack | n. | 深蹲架 | 86 | squat rack, power rack, cage
      machine | n. | 机器 | 86 | cable machine, fitness machine
      television | n. | 电视 | 84 | tv, screen
      floor | n. | 地板 | 82
      towel | n. | 毛巾 | 80
      ceiling | n. | 天花板 | 78
      light | n. | 灯 | 78 | spotlight, lamp
      shelf | n. | 架子 | 78
      row | n. | 一排 | 78
      wall | n. | 墙 | 76
      seat | n. | 座椅 | 76 | saddle
      pedal | n. | 踏板 | 76
      handlebar | n. | 车把 | 76 | handle
      pulley | n. | 滑轮 | 72 | cable
      vent | n. | 通风口 | 70 | air vent, air conditioner
      table | n. | 小桌 | 70 | stool`,
    adv: `
      exercise | v. | 锻炼 | 94 | workout, work out, train, training
      fitness | n. | 健身 | 92 | fit
      lift | v. | 举（重） | 86 | weightlifting
      cycle | v. | 骑车 | 84 | spin, spinning
      heavy | adj. | 沉重的 | 84
      empty | adj. | 空无一人的 | 84
      modern | adj. | 现代的 | 82
      clean | adj. | 干净的 | 80 | tidy
      healthy | adj. | 健康的 | 80 | health
      bright | adj. | 明亮的 | 80
      indoor | adj. | 室内的 | 78 | inside, indoors
      strong | adj. | 强壮的 | 76 | strength
      black | adj. | 黑色的 | 76
      orange | adj. | 橙色的 | 74
      muscle | n. | 肌肉 | 74 | muscular
      sweat | v. | 出汗 | 70`,
    weak: `
      trainer | n. | 教练 | 62 | coach, personal trainer
      dumbbell | n. | 哑铃 | 62
      treadmill | n. | 跑步机 | 55
      water bottle | n. | 水瓶 | 50 | bottle
      locker | n. | 储物柜 | 45
      music | n. | 音乐 | 40`,
  },
];

export const SEED_LEVELS: Level[] = DEFS.map((d) => ({
  id: `seed-${d.key}`,
  source: 'seed',
  title: d.title,
  titleEn: d.titleEn,
  theme: d.theme,
  searchKeyword: d.searchKeyword,
  sceneDesc: d.sceneDesc,
  passCount: d.passCount,
  fullCount: defaultFullCount(d.passCount),
  coreWords: W(d.core),
  advWords: W(d.adv),
  weakWords: W(d.weak),
  imageUrl: seedUrl(`${d.key}.jpg`),
  credit: d.credit,
  createdAt: 0,
}));

export const SEED_BY_ID = new Map(SEED_LEVELS.map((l) => [l.id, l]));
