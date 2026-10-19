/* ============ 数据层：全部数值配置（服务端/客户端共用，纯读取无副作用） ============
   选项的 act 副作用不在这里——改为 {id,label,detail}，由服务端 engine 按 (系统,id) 分派。
   动态描述由 presentation.js 使用共享公式派生；配置不依赖状态层。 */
import { fmt } from './format.js';
export { fmt, fmtTime } from './format.js';
import { MATERIALS, FOUNDATIONS, FOUNDATION_RELICS, BREAKTHROUGHS, BREAK_PILLS } from './progression-data.js';

export const GX = {};

GX.REALMS = [
  { name: "练气", layers: 9, life: 100 },
  { name: "筑基", layers: 9, life: 200 },
  { name: "金丹", layers: 9, life: 350 },
  { name: "元婴", layers: 9, life: 550 },
  { name: "化神", layers: 9, life: 800 },
  { name: "炼虚", layers: 9, life: 1200 },
  { name: "合体", layers: 9, life: 1800 },
  { name: "大乘", layers: 9, life: 2800 },
  { name: "渡劫", layers: 9, life: 4000 },
  { name: "真仙", layers: 9, life: 6000 },
  { name: "玄仙", layers: 9, life: 10000 },
  { name: "金仙", layers: 9, life: 16000 },
  { name: "大罗", layers: 9, life: 24000 },
];
GX.REALM_MULT = [1, 3, 10, 32, 100, 320, 1000, 3200, 10000, 40000, 160000, 640000, 2560000];
GX.LAYER_REQ = 25;
GX.LAYER_GROWTH = 1.28;
/* 每境基准需求（×LAYER_REQ×LAYER_GROWTH^layer = 单层修为需求）。
   已按"活跃玩家一世证道 ≈100h"校准（test/pace2.mjs：练气0.5h → 大罗 ~19h 递增）。 */
GX.REALM_NEED = [314.8, 16127, 169420, 1.524506e6, 8.370893e6, 6.912939e7, 2.71935e8, 1.963679e9, 7.239036e9, 6.99828e10, 3.30738e11, 3.06099e12, 1.36523e13];
GX.BASE_CULT = 10;
/* 自动修炼：把「打坐」交给洞府，前期是补充、后期是主力。
   速率以点击值为锚（1 份 = 每秒 1 次打坐），并随境界额外放大——
   手动点击不吃这份境界加成，「后期弱化点击、自动化接手」由此实现。
   聚灵阵 0 级即有 1 份基础自动修炼，每升一级再 +1 份。 */
GX.AUTO_CULT_BASE = 0.05;      // 每份自动修炼 = 点击值 × 该系数
GX.AUTO_REALM_BONUS = 0.15;    // 每提升一个大境界，自动修炼额外 +15%
GX.OFFLINE_CAP = 4 * 3600;
GX.OFFLINE_EFF = 0.5;
GX.SECONDS_PER_YEAR = 15 * 60;     // 1 年寿元 = 15 现实分钟
GX.LIFE_PER_SEC = 1 / GX.SECONDS_PER_YEAR;
GX.DAYS_PER_YEAR = 365;            // 洞府历法与寿元共用时间尺度
GX.BATTLE_LIFE_LOSS = 0.05;        // 战败伤及本源，折损寿元上限的 5%
GX.JULI_MULT = 60;                 // 聚灵丹 = 60×点击值（固定量，不随需求缩放）
GX.FURN_EVERY = 300;               // 丹房每 5 分钟自动炼丹
GX.MED_RATE = 2;                   // 闭关自动凝练 = 点击力 ×2/秒
GX.MED_CD = 60;                    // 出关后调息 60 秒
GX.EVENT_EVERY = 90;
GX.ENC_EVERY = 150;
GX.SECRET_CD = 300;
/* 寻道录的取物试炼：同一阶段永远有两条路，主线因此不被战斗卡住。
   稳妥取物——挂机计时、零风险、无额外收益，是休闲挂机的默认走法；
   战斗捷径——更省料、通常更快，胜则另有试炼奖励，败退则重伤并折损寿元。
   两条路都能取得主材，战斗是可选支柱而非必经关卡。 */
GX.SEEK_TRIAL = {
  steady: { ren: 45, di: 90, tian: 120 },   // 稳妥取物所需秒数（越往上，取物越难）
  shardN: 2,                                // 试炼胜利：对应品级残片
  loot: {
    ren: { shard: 'fan', shardName: '凡品残片', cult: 30 },
    di: { shard: 'xuan', shardName: '玄品残片', cult: 30, heaven: 1 },
    tian: { shard: 'di', shardName: '仙品残片', cult: 40, heaven: 1, insight: 1 },
  },
};
/* 修炼手感：连击（窗口内连续点击叠加收益）与暴击（一次性高倍收益）。
   只放大单次点击，不改 cultPerClick()，因此不影响闭关、讨伐敌血等锚定值。 */
GX.COMBO = { windowMs: 2500, step: 0.03, max: 10 };
GX.CRIT = { base: 0.05, mult: 4, luckScale: 0.5, cap: 0.15 };
/* 跨世传承：转世时可保留上一世的部分积累（向下取整比例）。 */
GX.LEGACY_KEEP = 0.5;
GX.LEGACY_REROLL_STEP = 10;   // 每 10 点道行额外 +1 次开局重抽
GX.LEGACY_REROLL_MAX = 3;
GX.REALM_COLORS = ["#9fb4d8", "#8fd0a0", "#d4b36a", "#c78fd8", "#e0a08a", "#8ad0d8", "#d8c08a", "#e08aa0", "#f0d894", "#f6f0dc", "#c9d8ff", "#ffd88a", "#fff0b8"];
GX.TRIB_REALM = 8;

GX.GONGFA_TIERS = [
  { name: "下品", minRealm: 0 },
  { name: "中品", minRealm: 1 },
  { name: "上品", minRealm: 3 },
  { name: "极品", minRealm: 5 },
  { name: "仙品", minRealm: 7 },
  { name: "玄仙", minRealm: 9 },
  { name: "神品", minRealm: 11 },
];

/* 功法三选一：每次参悟从当前品阶三部中择一修习。
   基率 ×1.8/重 不变（保节奏校准），每部功法附加一个永久被动（当世有效，叠加）。
   七系：cult 修为 / spirit 灵石 / trib 渡劫 / life 寿元 / luck 机缘 / build 洞府 / battle 讨伐 */
GX.GONGFA_BOOKS = [
  [ // 下品
    { id: "taixuan1", name: "太玄经", school: "cult", mag: 0.06, text: "抱朴守一，气行周天——修炼产出 +6%" },
    { id: "huangting1", name: "黄庭策", school: "spirit", mag: 0.08, text: "内视黄庭，灵气自聚——灵石产出 +8%" },
    { id: "changchun1", name: "长春功", school: "life", mag: 0.10, text: "枯木逢春，龟息延年——寿元上限 +10%" },
  ],
  [ // 中品
    { id: "yulei1", name: "御雷诀", school: "trib", mag: 0.03, text: "引雷淬体，先识劫威——渡劫成功率 +3%" },
    { id: "xunlong1", name: "寻龙诀", school: "luck", mag: 0.08, text: "望气寻龙，机缘自至——机缘掉率 +8%" },
    { id: "yingzao1", name: "洞天要术", school: "build", mag: 0.06, text: "缩地成寸，营造洞天——洞府扩建花费 -6%" },
  ],
  [ // 上品
    { id: "taixuan2", name: "太玄真经", school: "cult", mag: 0.08, text: "太玄三卷，道法自然——修炼产出 +8%" },
    { id: "pojun1", name: "破军诀", school: "battle", mag: 0.08, text: "杀伐果断，破军无前——讨伐攻防 +8%" },
    { id: "huangting2", name: "黄庭真经", school: "spirit", mag: 0.10, text: "黄庭三宫，灵泉不竭——灵石产出 +10%" },
  ],
  [ // 极品
    { id: "yulei2", name: "九霄御雷真解", school: "trib", mag: 0.04, text: "九霄雷池，如履平地——渡劫成功率 +4%" },
    { id: "changchun2", name: "长春仙功", school: "life", mag: 0.12, text: "松鹤同寿，与春长驻——寿元上限 +12%" },
    { id: "taixuan3", name: "太玄宝章", school: "cult", mag: 0.10, text: "玄之又玄，众妙之门——修炼产出 +10%" },
  ],
  [ // 仙品
    { id: "xunlong2", name: "寻龙仙诀", school: "luck", mag: 0.10, text: "龙脉在握，机缘如潮——机缘掉率 +10%" },
    { id: "pojun2", name: "破军仙阵", school: "battle", mag: 0.10, text: "一剑破军，万妖辟易——讨伐攻防 +10%" },
    { id: "huangting3", name: "黄庭仙策", school: "spirit", mag: 0.12, text: "仙府灵田，生生不息——灵石产出 +12%" },
  ],
  [ // 玄仙
    { id: "taixuan4", name: "太玄道章", school: "cult", mag: 0.12, text: "道章一卷，万炁归宗——修炼产出 +12%" },
    { id: "yulei3", name: "御雷道典", school: "trib", mag: 0.05, text: "雷部正神，听吾号令——渡劫成功率 +5%" },
    { id: "changchun3", name: "长春道功", school: "life", mag: 0.15, text: "天地同寿，日月齐光——寿元上限 +15%" },
  ],
  [ // 神品
    { id: "taixuan5", name: "太玄神策", school: "cult", mag: 0.15, text: "神策既出，道法通天——修炼产出 +15%" },
    { id: "pojun3", name: "破军神录", school: "battle", mag: 0.12, text: "神录所指，妖邪尽灭——讨伐攻防 +12%" },
    { id: "huangting4", name: "黄庭神策", school: "spirit", mag: 0.15, text: "神策一展，灵石如雨——灵石产出 +15%" },
  ],
];
GX.GONGFA_BY_ID = {};
for (const tier of GX.GONGFA_BOOKS) for (const b of tier) GX.GONGFA_BY_ID[b.id] = b;
GX.GONGFA_SCHOOL_ICON = { cult: "📿", spirit: "💠", trib: "⚡", life: "🌸", luck: "🎐", build: "⛩️", battle: "⚔️" };

GX.BLDS = [
  { id: "zhen", icon: "🌀", name: "聚灵阵", base: 15, grow: 1.55, desc: lv => `自动修炼 ${lv + 1} 份（1 份 = 1 次打坐/秒，随境界增效）`, cost: lv => Math.ceil(15 * Math.pow(1.55, lv)) },
  { id: "mine", icon: "⛏️", name: "灵石矿", base: 50, grow: 1.6, desc: lv => `自动灵石 +${fmt(1.5 * lv)} /秒`, cost: lv => Math.ceil(50 * Math.pow(1.6, lv)) },
  { id: "beast", icon: "🐉", name: "灵兽苑", base: 500, grow: 2.0, desc: lv => `饲育支持，全产出 +${Math.round(4 * lv)}%`, cost: lv => Math.ceil(500 * Math.pow(2, lv)) },
  { id: "furn", icon: "🔥", name: "丹房", base: 1000, grow: 1.9, desc: lv => `每5分钟自动炼1粒聚灵丹`, cost: lv => Math.ceil(1000 * Math.pow(1.9, lv)) },
  { id: "forge", icon: "🔨", name: "炼器台", base: 200, grow: 1.8, desc: lv => lv === 0 ? "建成可炼凡品法宝" : lv === 1 ? "可炼凡品（升级解锁灵品）" : lv === 2 ? "可炼灵品（升级解锁玄品）" : lv === 3 ? "可炼玄品（升级解锁仙品）" : "可炼仙品法宝", cost: lv => Math.ceil(200 * Math.pow(1.8, lv)) },
  { id: "altar", icon: "🏮", name: "道坛", base: 3000, grow: 1.9, desc: lv => lv === 0 ? "建成：燃烧灵石凝练修为（灵石充足时自动，需先有灵石矿）" : `每秒燃灵石 0.2×矿产×lv 凝同量修为`, cost: lv => Math.ceil(3000 * Math.pow(1.9, lv)) },
];

GX.PILLS = {
  ...BREAK_PILLS,
  juli: { name: "聚灵丹", icon: "🔮", cost: 20, desc: () => "修为增加60倍点击值" },
  huichun: { name: "回春丹", icon: "💊", cost: 35, graded: true, materials: { herb: 3 }, desc: () => '同阶回复30%气血，不恢复寿元；恢复丹共用三次药力限制' },
  huiyuan: { name: "回元丹", icon: "💧", cost: 40, graded: true, materials: { herb: 2, essence: 1 }, desc: () => '同阶回复30真元，低阶药降效' },
  yangyuan: { name: "养元丹", icon: "🍃", cost: 300, graded: true, furnace: 1, materials: { herb: 12, essence: 6, heaven: 1 }, desc: () => '修复战败可修复损失；不逆转自然衰老，每世有额度' },
  xuan: { name: "玄丹", icon: "🌫️", cost: 150, desc: () => "下次渡劫成功率 +15%" },
  dujie: { name: "渡劫丹", icon: "⚡", cost: 80, desc: () => "渡劫成功率 +20%（自动消耗）" },
  yanshou: { name: "延寿丹", icon: "🌸", cost: 500, graded: true, furnace: 1, materials: { herb: 12, earth: 4, heaven: 2 }, desc: () => '同增天寿与余寿，终身累计至自然天寿20%；旧档已获延寿保留' },
  huti: { name: '护体符', icon: '📜', cost: 50, graded: true, battleOnly: true, materials: { herb: 2, earth: 1 }, desc: () => '本回合获得30%气血的护盾' },
  pozhang: { name: '破障符', icon: '📜', cost: 60, graded: true, battleOnly: true, materials: { essence: 2, earth: 1 }, desc: () => '移除相当于自身25%气血的敌方护盾' },
  qingxin: { name: '清心符', icon: '📜', cost: 50, graded: true, battleOnly: true, materials: { herb: 2, essence: 1 }, desc: () => '净化两项负面状态' },
  dun: { name: '遁符', icon: '📜', cost: 80, graded: true, battleOnly: true, materials: { essence: 2, earth: 1 }, desc: () => '脱离战斗，无胜利奖励，最多适用高一大境的敌人' },
};

GX.ROOTS = {
  jin: { name: "金灵根", icon: "⚔️", w: 14, desc: "残片掉率+50%，炼器花费-10%" },
  mu: { name: "木灵根", icon: "🌿", w: 14, desc: "灵兽蛋掉率+50%" },
  shui: { name: "水灵根", icon: "💧", w: 14, desc: "寿元上限+20%" },
  huo: { name: "火灵根", icon: "🔥", w: 14, desc: "丹药花费-30%" },
  tu: { name: "土灵根", icon: "⛰️", w: 14, desc: "洞府建设花费-15%" },
  lei: { name: "雷灵根", icon: "⚡", w: 12, desc: "修炼产出+35%" },
  feng: { name: "风灵根", icon: "🌪️", w: 12, desc: "机缘掉率+30%" },
  bing: { name: "冰灵根", icon: "❄️", desc: "变异单灵根：修炼+20%，寿元+15%，渡劫+5个百分点" },
  yinyang: { name: "阴阳灵根", icon: "☯️", legacy: true, desc: "旧世保留：渡劫成功率+10%" },
  tiandao: { name: "天道灵根", icon: "🌌", legacy: true, desc: "旧世保留：机缘掉率+40%，灵石数量×2" },
};
GX.MATERIALS = MATERIALS;
GX.FOUNDATIONS = FOUNDATIONS;
GX.FOUNDATION_RELICS = FOUNDATION_RELICS;
GX.BREAKTHROUGHS = BREAKTHROUGHS;

GX.TREASURES = [
  { q: 1, name: "凡品", shard: 5, fx: { wu: 8, ju: 15, yuan: 3 } },
  { q: 2, name: "灵品", shard: 12, fx: { wu: 15, ju: 25, yuan: 5 }, shardKey: "ling" },
  { q: 3, name: "玄品", shard: 30, fx: { wu: 25, ju: 40, yuan: 8 }, shardKey: "xuan" },
  { q: 4, name: "仙品", shard: 15, fx: { wu: 40, ju: 65, yuan: 12 }, shardKey: "di" },
];
GX.TREASURE_TYPES = {
  wu: { name: "护体", desc: q => `渡劫成功率 +${GX.TREASURES[q - 1].fx.wu}%` },
  ju: { name: "聚灵塔", desc: q => `修为产出 +${GX.TREASURES[q - 1].fx.ju}%` },
  yuan: { name: "缘钟", desc: q => `机缘掉率 +${GX.TREASURES[q - 1].fx.yuan}%` },
  sword: { name: '青锋剑', desc: () => '提升攻击；主动攻击可穿过一半护盾' },
  gourd: { name: '回春葫', desc: () => '提升气血；主动治疗并净化' },
  banner: { name: '引雷幡', desc: () => '提升攻击；主动引雷打击' },
};
GX.REFINE_WORDS = {
  huxi: { name: "护体诀", desc: lv => `渡劫成功率 +${lv * 3}%` },
  juling: { name: "聚灵诀", desc: lv => `修为产出 +${lv * 4}%` },
  yuan: { name: "缘引诀", desc: lv => `机缘掉率 +${lv * 1}%` },
};
GX.EGGS = { fan: { name: "凡品", price: 30 }, ling: { name: "灵品", price: 100 }, xuan: { name: "玄品", price: 400 }, di: { name: "地品", price: 1500 } };
GX.BEASTS = { fan: { name: "青羽雀", stars: 1 }, ling: { name: "赤尾狐", stars: 3 }, xuan: { name: "玄武犊", stars: 5 }, di: { name: "白泽", stars: 5 } };

GX.ACHIEVEMENTS = [
  { id: "first_break", name: "初窥门径", desc: "完成首次突破", fx: "全产出 +3%", check: st => st.breaks > 0 },
  { id: "zhuji", name: "筑基有成", desc: "突破至筑基期", fx: "全产出 +3%", check: st => st.realmIdx >= 1 },
  { id: "jindan", name: "丹成雷动", desc: "突破至金丹期", fx: "全产出 +4%", check: st => st.realmIdx >= 2 },
  { id: "yuanxing", name: "元婴出窍", desc: "突破至元婴期", fx: "全产出 +4%", check: st => st.realmIdx >= 3 },
  { id: "click_1000", name: "勤修不辍", desc: "累计修炼 1000 次", fx: "全产出 +3%", check: st => st.clicks >= 1000 },
  { id: "forge_3", name: "百炼成器", desc: "炼造 3 件法宝", fx: "全产出 +3%", check: st => st.forgeN >= 3 },
  { id: "reincarnate_1", name: "轮回渡厄", desc: "完成首次转世", fx: "全产出 +4%", check: st => st.times >= 1 },
  { id: "eggs_10", name: "灵兽缘", desc: "累计获得 10 枚灵兽蛋", fx: "全产出 +3%", check: st => st.eggsGot >= 10 },
  { id: "encounter_10", name: "行过千帆", desc: "经历 10 次奇遇", fx: "全产出 +3%", check: st => st.encN >= 10 },
  { id: "xian", name: "飞升真仙", desc: "渡劫圆满，飞升仙界", fx: "全产出 +4%", check: st => st.realmIdx >= 9 },
  { id: "jinxian", name: "金身不灭", desc: "步入金仙境", fx: "全产出 +4%", check: st => st.realmIdx >= 11 },
  { id: "daluozheng", name: "证道飞升", desc: "大罗圆满，证道飞升", fx: "全产出 +5%", check: st => st.ascended === true },
  { id: "tao_first", name: "讨伐初血", desc: "讨伐首妖", fx: "全产出 +2%", check: st => (st.taoKills || 0) >= 1 },
  { id: "tao_boss", name: "斩妖主", desc: "讨伐五感妖主", fx: "全产出 +3%", check: st => (st.taoBoss || 0) >= 1 },
];

GX.SHOP = [
  { id: "reroll", name: "道缘重抽", desc: "本世灵根重抽 +1 次", cost: 5, repeat: true },
  { id: "provision", name: "出世资粮", desc: "起始灵石+2500、修为+1000（随世数上涨）", cost: 10, repeat: true },
  { id: "pills", name: "丹药包", desc: "渡劫丹×1、聚灵丹×2", cost: 8, repeat: false },
  { id: "shards", name: "残片包", desc: "凡品残片 ×10（炼器材料）", cost: 8, repeat: false },
  { id: "egg", name: "玄品灵兽蛋", desc: "玄品灵兽蛋 ×1（开局即有孵化材料）", cost: 12, repeat: false },
  { id: "prestige", name: "道行兑换", desc: "道行 +1（永久全产出 +3%）", cost: 20, repeat: true },
  { id: "tribbless", name: "天劫庇佑", desc: "本世渡劫成功率 +12%", cost: 25, repeat: false },
  { id: "daoheart", name: "道心供奉", desc: "起始道心 +5（全产出 +10%）", cost: 30, repeat: false },
  { id: "dharma", name: "先天法宝", desc: "起始装备灵品法宝，并预铭 1 个词条", cost: 30, repeat: false },
  { id: "constitution", name: "先天之体", desc: "随机觉醒一种先天之体（五种选一，每世重铸）", cost: 40, repeat: false },
];
GX.CONSTITUTIONS = [
  { id: "leiti", name: "雷淬之体", desc: "修炼产出 +30%" },
  { id: "yangti", name: "阳寿之体", desc: "寿元上限 +25%" },
  { id: "danti", name: "万法之体", desc: "渡劫成功率 +10%" },
  { id: "lingti", name: "灵攫之体", desc: "灵石产出 +50%" },
  { id: "yuanti", name: "本源之体", desc: "机缘掉率 +25%" },
];

GX.TAO_MAP = [
  { id: 1, name: "废 墟", icon: "🦇", beast: "洞窟妖蝠", desc: "洞府外的荒墟低阶妖兽出没" },
  { id: 2, name: "雾 谷", icon: "🐺", beast: "雾瞳妖狼", desc: "谷中终年雾锁，夜有狼嚎" },
  { id: 3, name: "古 刹", icon: "🐍", beast: "木灵妖蟒", desc: "废派古刹，百年灵藤盘于残殿" },
  { id: 4, name: "裂 崖", icon: "🐯", beast: "裂崖雷豹", desc: "崖壁有雷纹，石缝中兽吼如雷" },
  { id: 5, name: "妖 主 巢", icon: "👹", beast: "五感妖主", desc: "妖主巢穴，其气息已压山数里（首领战）" },
];

GX.TRIBS = [
  { name: "九曜雷劫", text: "九重天阙，九曜星君执鞭而下。雷光如瀑，落你头顶，威压如山。" },
  { name: "罡风劫", text: "万里罡风自九天卷落，割衣裂石。你若立得住，便过了一关。" },
  { name: "业火劫", text: "无明业火自地底燃起，焚的不是肉身，是你半生贪嗔。" },
  { name: "心魔劫", text: "四下无人，唯你与心中那个声音对坐。它说：放下吧，做回凡人。" },
  { name: "幻水劫", text: "一池幻水漫过洞府，镜中见自己——是仙，是魔，还是当年那个少年？" },
  { name: "尘缘劫", text: "红尘万丈化作锁链缠来。最断不了的不是天劫，是这一缕尘缘。" },
  { name: "寂灭劫", text: "天地归于死寂，灵气断绝。唯有道心不昧者，方能见一线生机。" },
  { name: "大乘金虹", text: "金虹贯日，此劫已近大乘之门。过此，便是人间至境。" },
  { name: "天道终劫", text: "天道本身化作一道目光，俯瞰着你。「尔可证道？」——此劫连败则因果累身。" },
];

GX.SECRETS = [
  { id: "yujing", name: "玉池秘境", minRealm: 0, desc: "灵气玉池自山石间渗出，润物无声" },
  { id: "leixing", name: "雷音崖", minRealm: 3, desc: "崖上雷音滚滚，淬体炼道" },
  { id: "yuanhui", name: "上古道墟", minRealm: 5, desc: "上古修士遗墟，道韵未散" },
  { id: "xinghe", name: "星河界", minRealm: 7, desc: "星光沉入尘世，道纹通天" },
  { id: "xianyuan", name: "仙垣遗迹", minRealm: 9, desc: "人界劫雷淬出的仙光沉入界底，真灵可与之共鸣" },
  { id: "luohai", name: "大罗星海", minRealm: 12, desc: "万星如海，一念可贯过去现在未来三际" },
];

GX.XTRIBS = [
  [
    { layer: 2, name: "天门劫", text: "仙门之前，天官亲执仙籍。真灵不纯者，先过天门一雷。" },
    { layer: 5, name: "星河劫", text: "天河倒卷，星辉贯体。仙家星命，自此第一转。" },
    { layer: 8, name: "真灵大劫", text: "你前世的真灵自识海深处浮出，与今生对坐。过此一劫，方敢言玄仙。" },
  ],
  [
    { layer: 2, name: "玄道劫", text: "玄道无形，它以你半生执念为刃，替你斩开一扇门。" },
    { layer: 5, name: "因果劫", text: "人界因果凝成大河，漫过头顶。因果越轻，渡路越宽。" },
    { layer: 8, name: "玄仙大劫", text: "天雷与因果交织，仙门审判只有一次。败，则因果累身。" },
  ],
  [
    { layer: 2, name: "金身劫", text: "一缕太阳光直贯仙体，试你的骨血能否承载此金。" },
    { layer: 5, name: "灾劫", text: "天机降下一场大灾——不是雷，是万灵目光。目光之下，道心不能乱。" },
    { layer: 8, name: "金仙大劫", text: "万载金雷聚为一击。扛过此击，你便不再是人界之人。" },
  ],
  [
    { layer: 2, name: "大罗劫", text: "过去现在未来，三际同响。你的一念，被天道摊开晾晒。" },
    { layer: 5, name: "万劫", text: "万劫连环，雷中有雷，劫中有劫。这是仙途最后一场人间的考校。" },
    { layer: 8, name: "证道大劫", text: "天道亲自现身：「尔可证道？」——大劫连败则因果累身，扛过即证道飞升。" },
  ],
];

/* 秘境场景：options 只留 id/label/detail；act 副作用在 engine.applySecretOption 按 (eventId,optId) 分派 */
GX.SECRET_EVENTS = [
  { id: "beast", minRealm: 0, text: "岩影间伏着一头灵兽，眼中凶光未褪。", options: [
    { id: "fight", label: "出手迎战", detail: "进入回合战斗，胜获灵石与残片；败退重伤60秒并折寿" },
    { id: "retreat", label: "且战且退", detail: "灵石 -5%" },
  ] },
  { id: "pill", minRealm: 0, text: "石壁间露出一处半塌的丹窟，药香犹存。", options: [
    { id: "take", label: "探窟取丹", detail: "25% 大赏 / 40% 空手 / 35% 被困" },
    { id: "sit", label: "静坐参悟", detail: "修为 +20 倍点击值" },
    { id: "ward", label: "以灵液护窟", detail: "" },
  ] },
  { id: "flame", minRealm: 0, text: "一缕鬼火幽幽浮动，不冷不热，只照亮道心。", options: [
    { id: "refine", label: "引火炼道", detail: "40% 道心+1 / 60% 重伤" },
    { id: "blow", label: "一吹而灭", detail: "修为 +5 倍点击值" },
  ] },
  { id: "stele", minRealm: 0, text: "一方上古道碑残存，字迹剥落，道韵犹在。", options: [
    { id: "study", label: "参悟碑文", detail: "修为 +30 倍点击值" },
    { id: "incense", label: "敬香而去", detail: "灵石 +少量（随境界抬升）" },
  ] },
  { id: "xianqi", minRealm: 9, text: "云雾之间，一泓仙气凝而不散。静坐吸纳，可养肉身——贪多则灵根震荡。", options: [
    { id: "absorb", label: "静坐吸纳", detail: "修为 +40 倍点击值" },
    { id: "gather", label: "采撷封存", detail: "灵石 +60 倍矿产 · 25% 道心+1" },
  ] },
  { id: "luohai", minRealm: 12, text: "星河沉入此间，一颗流星的余光，足以照见百年光阴。", options: [
    { id: "condense", label: "凝星炼道", detail: "35% 道心+1 / 65% 重伤15秒" },
    { id: "ride", label: "御星而行", detail: "修为 +50 倍点击值" },
  ] },
];

/* 奇遇：options 只留 id/label/detail（动态的算进 label/detail）；act 在 engine.applyEncOption */
GX.ENCOUNTERS = [
  { id: "laozhe", minRealm: 0, weight: 30, title: "白须老者",
    text: "洞府外，一位白须老者倚杖而立：「小友道缘不薄，老朽留下一份薄礼，权作结缘。」",
    options: [
      { id: "accept", label: "接受馈赠", detail: "获得随机仙丹一枚" },
      { id: "decline", label: "婉言谢绝", detail: "心境平和，获得少量修为" },
    ] },
  { id: "youshou", minRealm: 0, weight: 25, title: "妖兽拦路",
    text: "林间一道黑影扑出，拦在你身前——一头低阶妖兽，眼中凶光未褪。",
    options: [
      { id: "fight", label: "出手迎战", detail: "进入回合战斗，胜获灵石与残片；败退重伤60秒并折寿" },
      { id: "retreat", label: "且战且退", detail: "损失 5% 灵石" },
    ] },
  { id: "heimi", minRealm: 0, weight: 15, title: "无面行商",
    text: "夜色里，一个无面行商支起摊子：「有缘人，好货不贵。」",
    options: [
      { id: "buy_shards", label: "购残片 ×5", detail: "" },
      { id: "buy_treasure", label: "购法宝一件", detail: "" },
      { id: "leave", label: "告辞离开", detail: "" },
    ] },
  { id: "tongmen", minRealm: 1, weight: 15, title: "同门切磋",
    text: "一位散修拦路：「久闻道友道行精进，不如今夜切磋一场，输赢各付彩头。」",
    options: [
      { id: "accept", label: '应战', detail: '进入回合战斗，胜获灵石与残片；败退重伤60秒并折寿' },
      { id: "later", label: "改日再战", detail: "" },
    ] },
  { id: "daoheart", minRealm: 6, weight: 20, title: "天音问道",
    text: "云外忽传一道钟鸣，声如洪钟又似私语：「尔之道心，尚未圆满。道可道，非常道。」",
    options: [
      { id: "listen", label: "听道片刻", detail: "道心 +1：全产出 +2%（永久，至多 +30%）" },
      { id: "guard", label: "守心默修", detail: "修为 +20 倍点击值" },
    ] },
  { id: "mijing", minRealm: 2, weight: 15, title: "秘境残窟",
    text: "山壁间忽现一道裂口，内传微光——竟是一处上古秘境残窟，机缘与凶险并存。",
    options: [
      { id: "deep", label: "深入探取", detail: "25%大赏 / 35%重伤 / 40%空手" },
      { id: "seal", label: "封洞作罢", detail: "" },
      { id: "ward", label: "以灵石护体深入", detail: "" },
    ] },
  { id: "xianmen", minRealm: 9, weight: 18, title: "仙门引路",
    text: "一道虹桥自云外垂落，尽头有仙官执册而立：「新晋真仙，仙籍待录。录名者，得天庭赐丹。」",
    options: [
      { id: "register", label: "录名受丹", detail: "得渡劫丹×1、聚灵丹×2" },
      { id: "free", label: "不录逍遥", detail: "修为 +15 倍点击值" },
    ] },
  { id: "sanshi", minRealm: 12, weight: 20, title: "三际问道",
    text: "时间在此处摊开成一幅长卷：你的过去、现在、未来并排而坐。天道之音响起：「三际同问，道在何际？」",
    options: [
      { id: "answer", label: "答：在当下", detail: "道心 +1：全产出 +2%（上限 +30%）" },
      { id: "practice", label: "不答，只修行", detail: "修为 +25 倍点击值" },
    ] },
];
