/* 破境配方、道基与材料配置；所有材料均在需要它的境界之前开放。 */
export const MATERIALS = {
  herb: { name: '灵草', minRealm: 0, price: 12, source: '采药必得 3 株', activity: 'herb', amount: 3 },
  essence: { name: '灵液', minRealm: 0, price: 30, source: '历练归来必得 2 份', activity: 'roam', amount: 2 },
  earth: { name: '地脉精华', minRealm: 0, price: 100, source: '历练归来必得 1 份；讨伐胜利再得 1 份', activity: 'roam', amount: 1 },
  heaven: { name: '天灵晶', minRealm: 0, price: 350, source: '完成秘境三轮必得 1 枚；击败妖主再得 1 枚' },
  soul: { name: '凝魂花', minRealm: 2, price: 80, source: '金丹起采药必得 1 朵', activity: 'herb', amount: 1 },
  void: { name: '虚空石', minRealm: 4, price: 120, source: '化神起历练归来必得 1 块', activity: 'roam', amount: 1 },
  immortal: { name: '仙灵露', minRealm: 8, price: 160, source: '渡劫起采药必得 1 滴', activity: 'herb', amount: 1 },
  dao: { name: '大道结晶', minRealm: 11, price: 240, source: '金仙起历练归来必得 1 枚', activity: 'roam', amount: 1 },
  herb_age: { name: '草木生机', minRealm: 0, bound: true, source: '每次采药必得 1 缕，不可购买', activity: 'herb', amount: 1 },
  vein_jade: { name: '地脉碎玉', minRealm: 0, bound: true, source: '每次历练归来必得 1 枚，不可购买', activity: 'roam', amount: 1 },
  origin_jin: { name: '金行本源', minRealm: 0, bound: true, node: 1, source: '击败废墟妖蝠必得 1 份，不可购买' },
  origin_mu: { name: '木行本源', minRealm: 0, bound: true, node: 2, source: '击败雾谷妖狼必得 1 份，不可购买' },
  origin_shui: { name: '水行本源', minRealm: 0, bound: true, node: 3, source: '击败古刹妖蟒必得 1 份，不可购买' },
  origin_huo: { name: '火行本源', minRealm: 0, bound: true, node: 4, source: '击败裂崖雷豹必得 1 份，不可购买' },
  origin_tu: { name: '土行本源', minRealm: 0, bound: true, node: 5, source: '击败五感妖主必得 1 份，不可购买' },
  dao_page: { name: '问道残篇', minRealm: 0, bound: true, source: '完整完成秘境三轮必得 1 页，中途退出不计，不可购买' },
};

export const FOUNDATION_RELICS = {
  ren: { name: '百年养气芝', verb: '蕴养', text: '以草木生机催熟灵芝，温养经脉，奠定人道之基。', insight: 0, materials: { herb_age: 6, herb: 8 } },
  di: { name: '地脉灵髓', verb: '凝聚', text: '行遍山川，集地脉碎玉凝为灵髓，以厚土承载道基。', insight: 2, materials: { vein_jade: 12, earth: 6, essence: 8 } },
  tian: { name: '先天五行道胎', verb: '凝聚', text: '五行本源各得其三，八篇问道真意归一，凝成先天道胎。', insight: 6, materials: { origin_jin: 3, origin_mu: 3, origin_shui: 3, origin_huo: 3, origin_tu: 3, dao_page: 8 } },
};

export const FOUNDATIONS = {
  ren: { name: '人道筑基', pill: 'zhuji_ren', chance: .85, cult: .08, life: .05, trib: .02, maxRealm: 3, desc: '修炼 +8% · 寿元上限 +5% · 渡劫 +2 个百分点；上限元婴圆满' },
  di: { name: '地道筑基', pill: 'zhuji_di', chance: .75, cult: .18, life: .10, trib: .05, maxRealm: 8, desc: '修炼 +18% · 寿元上限 +10% · 渡劫 +5 个百分点；上限渡劫圆满' },
  tian: { name: '天道筑基', pill: 'zhuji_tian', chance: .65, cult: .30, life: .20, trib: .08, maxRealm: 12, desc: '修炼 +30% · 寿元上限 +20% · 渡劫 +8 个百分点；可证道飞升' },
};

// to 为目标境界；13 表示大罗圆满后的证道。
export const BREAKTHROUGHS = [
  { to: 1, name: '铸就道基', book: 2, insight: 0, text: '道基决定此世上限：人道止元婴，地道止渡劫，天道可证道。筑基成功后不可更换，唯有转世重修。' },
  { to: 2, name: '凝液结丹', pill: 'jindan', book: 3, insight: 1, text: '周天真元归一，以结金丹凝炼本命金丹。' },
  { to: 3, name: '碎丹成婴', pill: 'yuanying', book: 3, insight: 3, text: '以凝婴丹护住神魂，破丹成婴。' },
  { to: 4, name: '元神出窍', pill: 'huashen', book: 4, insight: 5, text: '养神丹温养识海，元婴蜕变为元神。' },
  { to: 5, name: '炼神还虚', pill: 'lianxu', book: 4, insight: 7, text: '感应虚空，以炼虚丹接引天地之力。' },
  { to: 6, name: '法身合一', pill: 'heti', book: 5, insight: 9, text: '法体与元神相融，合元丹护持合体。' },
  { to: 7, name: '道法大成', pill: 'dacheng', book: 5, insight: 11, text: '归一丹汇聚所学，道法趋于大成。' },
  { to: 8, name: '叩问天劫', pill: 'yingjie', book: 6, insight: 13, text: '应劫丹铸就承劫之身，准备迎接九重天劫。' },
  { to: 9, name: '洗尘成仙', pill: 'shengxian', book: 6, insight: 15, text: '九劫已过，以升仙丹洗去凡尘，登临真仙。', certain: true },
  { to: 10, name: '玄炁归真', pill: 'xuanxian', book: 7, insight: 18, text: '以玄炁丹凝聚仙元，参悟玄仙之境。' },
  { to: 11, name: '金性不朽', pill: 'jinxian', book: 7, insight: 21, text: '不朽丹淬炼金性，成就不灭金身。' },
  { to: 12, name: '超脱时空', pill: 'daluo', book: 8, insight: 24, text: '大罗丹承载大道结晶，跳出时空长河。' },
  { to: 13, name: '证道飞升', pill: 'zhengdao', book: 8, insight: 27, text: '因果圆满，服证道丹，将一世修行归于大道。', certain: true },
];

const recipe = (name, minRealm, cost, materials, furnace = 1) => ({
  name, icon: '⚗️', minRealm, cost, materials, furnace, breakthrough: true,
  desc: () => '破境时使用；每次尝试消耗一枚，不能直接服用',
});
export const BREAK_PILLS = {
  zhuji_ren: recipe('人道筑基丹', 0, 180, { herb: 12, essence: 4 }),
  zhuji_di: recipe('地道筑基丹', 0, 300, { herb: 16, essence: 6, earth: 4 }),
  zhuji_tian: recipe('天道筑基丹', 0, 500, { herb: 20, essence: 8, earth: 6, heaven: 3 }),
  jindan: recipe('结金丹', 1, 240, { herb: 18, essence: 8, earth: 4 }),
  yuanying: recipe('凝婴丹', 2, 320, { herb: 20, soul: 6, heaven: 2 }),
  huashen: recipe('养神丹', 3, 400, { soul: 10, essence: 10, heaven: 3 }, 2),
  lianxu: recipe('炼虚丹', 4, 480, { void: 8, soul: 10, earth: 6 }, 2),
  heti: recipe('合元丹', 5, 560, { void: 12, soul: 12, heaven: 4 }, 2),
  dacheng: recipe('归一丹', 6, 640, { void: 16, essence: 16, heaven: 5 }, 3),
  yingjie: recipe('应劫丹', 7, 720, { void: 20, soul: 16, heaven: 6 }, 3),
  shengxian: recipe('升仙丹', 8, 800, { immortal: 10, heaven: 8, soul: 18 }, 3),
  xuanxian: recipe('玄炁丹', 9, 900, { immortal: 16, void: 20, heaven: 8 }, 4),
  jinxian: recipe('不朽丹', 10, 1000, { immortal: 22, soul: 20, heaven: 10 }, 4),
  daluo: recipe('大罗丹', 11, 1200, { dao: 12, immortal: 24, void: 24 }, 4),
  zhengdao: recipe('证道丹', 12, 1500, { dao: 20, immortal: 30, heaven: 12 }, 4),
};
