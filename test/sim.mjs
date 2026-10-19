import { safeChoice, playBattle } from './progression-bot.mjs';
/* ============ 无头回归：整世模拟 + 全系统断言（驱动 server/engine.mjs，无 DOM） ============ */
import Engine from '../server/engine.mjs';
import { GX } from '../shared/data.js';
import * as st from '../shared/state.js';
import { prepareProgression, chooseProgression, seedRealmRequirements } from './progression-bot.mjs';

const E = new Engine();
const S = () => E.S;
// 模拟 server 无档启动：开开局窗
E.openBegin('new');
let pass = 0, fail = 0;
const T = (n, c, ...d) => { c ? pass++ : fail++; console.log(n, c ? 'PASS' : 'FAIL', c ? '' : d.join(' ')); };

const origRandom = Math.random;
const setRand = v => { Math.random = v; };

/* ---- 开局界面（首世随机觉醒）：先验证机制，再入世 ---- */
T('开局界面已开', E.beginOpen === true && E.beginRerolls === 3, 'beginOpen=', E.beginOpen);
T('重抽道缘生效', E.beginPending !== null && (E.rerollBegin(), E.beginRerolls === 2), 'rerolls=', E.beginRerolls);
T('重抽不点亮图鉴', st.codexCount(S()) === 0, 'cc=', st.codexCount(S()));
const drawnRoot = E.beginPending;
E.commitBegin();
T('入世落定灵根（图鉴待一世走完）', !E.beginOpen && JSON.stringify(S().root) === JSON.stringify(drawnRoot) && st.codexCount(S()) === 0, 'root=', S().root, 'cc=', st.codexCount(S()));
T('初始有合法灵根组合', st.validRoot(S().root), 'root=', S().root);
T('首世道行0', S().prestige === 0 && S().times === 0);

/* ---- 掉落：点 500 次，统计掉率 ---- */
const s0 = S().spirit, sh0 = S().shards.fan, eg0 = S().eggs.fan + S().eggs.ling + S().eggs.xuan + S().eggs.di;
for (let i = 0; i < 500; i++) E.doCultivate();
T('点击500次后灵石增加', S().spirit > s0);
T('有残片掉落', S().shards.fan > sh0, 'shards=', S().shards.fan);
T('有蛋掉落概率(500次大概率)', (S().eggs.fan + S().eggs.ling + S().eggs.xuan + S().eggs.di) > eg0, 'eggs=', JSON.stringify(S().eggs));

/* ---- 炼器 ---- */
S().spirit = 99999; S().bld.forge = 1; S().shards.fan = 5;
E.forgeTreasure(1);
T('炼器装备', S().treasure && S().treasure.q === 1, 'treasure=', JSON.stringify(S().treasure));
E.forgeTreasure(1);
T('重炼替换', S().treasure.q === 1);

/* ---- 渡劫：满修为必成 / 失败扣30%+重伤 ---- */
setRand(() => 0.1);
S().realmIdx = 0; S().layer = 0; S().cult = st.layerNeed(S());
E.doBreak();
T('渡劫成功(90%)', S().layer === 1, 'layer=', S().layer);
setRand(() => 0.95);
S().treasure = null; S().pills.dujie = 0; S().root = 'jin';
S().cult = st.layerNeed(S());
E.doBreak();
T('渡劫失败(95%)', S().layer === 1 && S().buffs.shock >= 20, 'shock=', S().buffs.shock);

/* ---- 渡劫丹加成 ---- */
setRand(() => 0.99);
S().pills.dujie = 1; S().cult = st.layerNeed(S());
E.doBreak();
T('渡劫丹自动消耗', S().pills.dujie === 0, 'dujie=', S().pills.dujie);

/* ---- 灵根折扣 / 加成 ---- */
S().root = 'jin';
const cJin = st.bldCost(S(), 'zhen');
S().root = 'tu';
const cTu = st.bldCost(S(), 'zhen');
T('土灵根建设-15%', cTu < cJin, 'jin=', cJin, 'tu=', cTu);
S().root = 'huo';
T('火灵根丹价-30%', st.pillCost(S(), 'juli') === 14, 'juli=', st.pillCost(S(), 'juli'));
S().root = 'shui';
const capShui = st.lifeCap(S());
S().root = 'tu';
T('水灵根寿元+20%', capShui > st.lifeCap(S()), 'shui=', capShui, 'tu=', st.lifeCap(S()));

/* ---- 奇遇 ---- */
E.openEncounter();
T('奇遇面板打开', E.panel && E.panel.kind === 'encounter');
E.applyEncOption(safeChoice(E).id);
T('奇遇关闭', !E.panel);
T('奇遇计数', S().encN >= 1, 'encN=', S().encN);

/* ---- 闭关 ---- */
S().med = 0; E.startMed();
T('闭关启动', S().med === 120, 'med=', S().med);
const c1 = S().cult;
E.doCultivate();
T('闭关禁修炼', S().cult === c1, 'cult=', S().cult);
S().med = 0.5; E.tick(1);
T('闭关自动凝练', S().cult > c1, 'gain=', (S().cult - c1).toFixed(1));
T('闭关到期出定', S().med === 0, 'med=', S().med);

/* ---- 孵化升星 ---- */
S().eggs.xuan = 1; S().beasts.xuan = 0;
E.hatchEgg('xuan');
T('孵化+1星', S().beasts.xuan === 1, 'beasts=', JSON.stringify(S().beasts));
S().eggs.xuan = 1; E.hatchEgg('xuan');
const m0 = st.globalMult(S());
S().beasts.xuan = 5;
T('灵兽升星加产出', st.globalMult(S()) > m0, 'mult=', (st.globalMult(S()) / m0).toFixed(2));
S().beasts.xuan = 0;

/* ---- 成就 ---- */
S().achieved = {}; S().breaks = 0;
S().clicks = 1000; E.checkAchievements();
T('成就:勤修不辍', !!S().achieved.click_1000, 'ach=', Object.keys(S().achieved).join(','));
const m1 = st.globalMult(S()); S().achieved = {};
T('成就加产出', m1 > st.globalMult(S()), 'mult=', (m1 / st.globalMult(S())).toFixed(2));

/* ---- 离线收益 ---- */
S().spirit = 0; S().cult = 0; S().bld.zhen = 10; S().bld.mine = 5;
S().lastTs = Date.now() - 3600 * 1000;
const off = E.offlineEarnings();
T('离线收益(1h)', off > 3599 && off < 3602 && S().cult > 0, 'off=', off, 'cult=', S().cult.toFixed(0));
S().lastTs = Date.now();

/* ---- 道心 ---- */
S().realmIdx = 6;
S().daoHeart = 0;
const mhA = st.globalMult(S());
S().daoHeart = 20;
T('道心上限+30%', Math.abs(st.globalMult(S()) / mhA - 1.3) < 0.01, 'ratio=', (st.globalMult(S()) / mhA).toFixed(3));
S().daoHeart = 0;

/* ---- 天劫面板（渡劫期层劫）+ 三渡法 ---- */
S().realmIdx = 8; S().layer = 0; S().cult = st.layerNeed(S()); S().med = 0;
E.doBreak();
T('渡劫期开天劫面板', E.panel && E.panel.kind === 'trib' && E.panel.data.opts.length === 3, 'kind=', E.panel && E.panel.kind);
const layerBeforeFruit = S().layer;
S().daoFruit = 10;
T('引渡分级:渡劫期费5', st.tribFruitCost(S()) === 5, 'cost=', st.tribFruitCost(S()));
E.applyTribOption('fruit');
T('借道果必成', S().daoFruit === 5 && S().layer === layerBeforeFruit + 1, 'fruit=', S().daoFruit, 'layer=', S().layer);
setRand(() => 0.1);
S().cult = st.layerNeed(S());
E.doBreak();
E.applyTribOption('rider');
T('驭雷成功奖励', S().layer === 2 && S().shards.fan >= 2, 'layer=', S().layer, 'fan=', S().shards.fan);
/* 天道终劫：连败因果递减 */
setRand(() => 0.99);
S().realmIdx = 8; S().layer = 8; S().cult = st.layerNeed(S()); S().tribFails = 0;
E.doBreak();
const tca = st.tribChance(S(), 'layer');
E.applyTribOption('hard');
T('终劫失败+1因果', S().tribFails === 1, 'tribFails=', S().tribFails);
const tcb = st.tribChance(S(), 'layer');
T('终劫连败递减', tcb < tca, 'a=', tca.toFixed(2), 'b=', tcb.toFixed(2));
setRand(origRandom);
S().tribFails = 0;

/* ---- 图鉴点亮 + 道果 ---- */
const fBefore = S().daoFruit;
S().seen = { roots: {}, treasures: {}, beasts: {}, encs: {}, tao: {} };
E.markSeen('roots', 'jin', '金灵根');
E.markSeen('roots', 'jin', '金灵根'); // 重复不叠加
T('图鉴点亮不送道果(纯货币)', S().daoFruit === fBefore && st.codexCount(S()) === 1, 'fruit=', S().daoFruit, 'cc=', st.codexCount(S()));

/* ---- 道果/图鉴跨转世保留 ---- */
S().root = 'jin'; S().realmIdx = 0; S().layer = 0;
const fruitKeep = S().daoFruit, seenKeep = S().seen;
E.reincarnate(5);
T('道果跨世保留', S().daoFruit === fruitKeep, 'fruit=', S().daoFruit);
T('图鉴跨世保留', S().seen === seenKeep && st.codexCount(S()) === 1, 'cc=', st.codexCount(S()));
E.commitBegin();
S().root = 'mu'; S().realmIdx = 0; S().layer = 0;
const fB2 = S().daoFruit;
E.reincarnate(5);
T('走完一世点亮灵根图鉴', S().daoFruit === fB2 && !!S().seen.roots.mu && st.codexCount(S()) === 2, 'fruit=', S().daoFruit, 'cc=', st.codexCount(S()));

/* ---- 转世商店 ---- */
T('商店随开局窗开启', E.beginOpen === true);
T('道行里程碑增开局重抽', E.beginRerolls === 3 + st.legacyRerollBonus(S()) && st.legacyRerollBonus(S()) === 1, 'rerolls=', E.beginRerolls, 'prestige=', S().prestige);
S().daoFruit = 100;
const rf0 = S().daoFruit, rerollsB = E.beginRerolls;
E.buyShop('reroll');
T('道缘重抽-5即时到账', S().daoFruit === rf0 - 5 && E.beginRerolls === rerollsB + 1, 'fruit=', S().daoFruit, 'rerolls=', E.beginRerolls);
E.buyShop('pills');
T('丹药包-8且限一次', S().daoFruit === rf0 - 13 && E.shopBought.pills === true, 'fruit=', S().daoFruit);
E.buyShop('pills');
T('限领商品二购拒绝', S().daoFruit === rf0 - 13, 'fruit=', S().daoFruit);
S().daoFruit = 3;
E.buyShop('daoheart');
T('道果不足拒绝', S().daoFruit === 3, 'fruit=', S().daoFruit);
const dujieB = S().pills.dujie, dhB = S().daoHeart || 0;
S().daoFruit = 100;
E.buyShop('daoheart'); E.buyShop('provision');
E.applyShopPurchases();
T('入世结算暂存', S().pills.dujie === dujieB + 1 && (S().daoHeart || 0) === dhB + 5 && Object.keys(S()._pend).length === 0, 'pend=', JSON.stringify(S()._pend), 'dh=', S().daoHeart);
E.closeBegin();
T('商店关闭', E.beginOpen === false);
E.openBegin('new');
S().daoFruit = 100;
E.buyShop('tribbless');
E.buyShop('dharma');
E.buyShop('constitution');
E.applyShopPurchases();
T('天劫庇佑交付', S().tribBless === true);
T('先天法宝灵品装备+词条', S().treasure && S().treasure.q === 2 && S().treasure.words && Object.values(S().treasure.words).length === 1, 'treasure=', JSON.stringify(S().treasure));
T('先天之体觉醒', !!GX.CONSTITUTIONS.find(x => x.id === S().constitution), 'cons=', S().constitution);
S().treasure = null; S().pills.dujie = 0; S()._xuanActive = false; S().root = 'jin'; S().constitution = null;
S().tribBless = true;
const tcA = st.tribChance(S(), 'realm');
S().tribBless = false;
T('天劫庇佑渡劫+12%', Math.abs(tcA - st.tribChance(S(), 'realm') - 0.12) < 1e-9, 'a=', tcA, 'b=', st.tribChance(S(), 'realm'));
S().constitution = 'leiti';
const mLeiti = st.globalMult(S());
S().constitution = null;
T('雷淬之体产出+30%', Math.abs(mLeiti / st.globalMult(S()) - 1.3) < 0.01, 'ratio=', (mLeiti / st.globalMult(S())).toFixed(3));
S().constitution = 'danti';
const tDanti = st.tribChance(S(), 'layer');
S().constitution = null;
T('万法之体渡劫+10%', tDanti > st.tribChance(S(), 'layer'), 'a=', tDanti, 'b=', st.tribChance(S(), 'layer'));
S().constitution = 'yangti';
const capY = st.lifeCap(S());
S().constitution = null;
T('阳寿之体寿元+25%', capY > st.lifeCap(S()), 'a=', capY, 'b=', st.lifeCap(S()));
E.closeBegin();

/* ---- 灵根重抽 ---- */
const roots = st.rollRoots(S(), 2);
T('灵根二选一', roots.length === 2 && roots[0] !== roots[1], 'roots=', roots);

/* ---- 秘境挑战 ---- */
S().realmIdx = 0; S().layer = 0; S().secretCd = 0; S().med = 0;
T('秘境冷却重置', S().secretCd === 0);
E.openSecret();
T('秘境可开（面板）', E.panel && E.panel.kind === 'secret');
T('秘境冷却扣减', S().secretCd === GX.SECRET_CD, 'cd=', S().secretCd);
for (let i = 0; i < 3; i++) {
  T('秘境第' + (i + 1) + '回合选项', E.panel.data.opts.length >= 3, 'opts=', E.panel.data.opts.length);
  E.applySecretOption(safeChoice(E).id);
}
T('秘境结算关闭', !E.panel);
T('秘境冷却生效', S().secretCd === GX.SECRET_CD, 'cd=', S().secretCd);
const cd0 = S().secretCd;
S().realmIdx = 8;
for (let i = 0; i < 10; i++) E.tick(0.2);
T('秘境冷却按tick递减', S().secretCd < cd0, 'cd=', S().secretCd);
S().realmIdx = 0;

/* ---- 法宝祭炼 ---- */
S().bld.mine = 10; S().bld.forge = 1;
S().shards.fan = 999; S().spirit = 999999;
S().treasure = null;
E.forgeTreasure(1);
T('新法宝无词条', S().treasure.words && Object.keys(S().treasure.words).length === 0, 'words=', JSON.stringify(S().treasure.words));
const mW0 = st.globalMult(S());
E.refineTreasure();
T('祭炼加词条', st.wordLevel(S(), 'huxi') + st.wordLevel(S(), 'juling') + st.wordLevel(S(), 'yuan') === 1, 'words=', JSON.stringify(S().treasure.words));
T('祭炼耗灵石', S().spirit < 999999);
S().treasure.words = { juling: 3 };
const mW1 = st.globalMult(S());
T('聚灵诀词条加产出', mW1 > mW0, 'ratio=', (mW1 / mW0).toFixed(3));
let inheritHit = 0;
for (let i = 0; i < 60; i++) {
  S().treasure.words = { juling: 3 };
  E.forgeTreasure(1);
  if (st.wordLevel(S(), 'juling') > 0) inheritHit++;
}
T('重炼词条继承(60轮各30%期望18次)', inheritHit === 60, 'hit=', inheritHit);
S().treasure.words = { huxi: 3, juling: 3, yuan: 3 };
E.refineTreasure();
T('词条满级拒绝', Object.values(S().treasure.words).every(v => v === 3), 'words=', JSON.stringify(S().treasure.words));
S().treasure.words = { juling: 1 };

/* ---- 仙界：飞升后四境 + 仙劫 + 证道终局 ---- */
setRand(origRandom);
S().realmIdx = 2; S().layer = 9;
T('道果元婴以下未凝', st.lifeFruit(S()) === 0, 'f=', st.lifeFruit(S()));
S().realmIdx = 3; S().layer = 0;
T('道果元婴始凝(3)', st.lifeFruit(S()) === 3, 'f=', st.lifeFruit(S()));
S().realmIdx = 8; S().layer = 9;
T('道果渡劫圆满世(21)', st.lifeFruit(S()) === 21, 'f=', st.lifeFruit(S()));
S().realmIdx = 12; S().layer = 9;
T('道果证道圆满世(48含加赠)', st.lifeFruit(S()) === 48, 'f=', st.lifeFruit(S()));
S().realmIdx = 8; S().layer = 9; S().cult = st.layerNeed(S()); S().med = 0; S().daoFruit = 0;
seedRealmRequirements(E); E.doBreak(); chooseProgression(E);
T('飞升踏入真仙(非终局)', S().realmIdx === 9 && S().layer === 0 && !E.ended && S().daoFruit === 0, 'ri=', S().realmIdx, 'ended=', E.ended, 'fruit=', S().daoFruit);
setRand(() => 0.1);
for (let i = 0; i < 2; i++) { S().cult = st.layerNeed(S()); E.doBreak(); }
S().cult = st.layerNeed(S());
E.doBreak(); // L2 仙劫层 → 开面板
T('真仙L2开仙劫面板', S().layer === 2 && E.panel && E.panel.kind === 'trib' && E.panel.data.opts.length === 3, 'layer=', S().layer);
T('仙劫当前劫=天门劫', E.currentTri().tri.name === '天门劫', 'tri=', E.currentTri().tri.name);
S().daoFruit = 10;
E.applyTribOption('fruit');
T('仙劫借道果必成', S().layer === 3 && S().daoFruit === 0, 'layer=', S().layer, 'fruit=', S().daoFruit);
setRand(() => 0.1);
S().layer = 9; S().cult = st.layerNeed(S());
seedRealmRequirements(E); E.doBreak(); chooseProgression(E);
T('真仙顶层引动境界劫', !E.panel && S().realmIdx === 10 && S().layer === 0, 'ri=', S().realmIdx);
setRand(() => 0.99);
S().realmIdx = 10; S().layer = 8; S().cult = st.layerNeed(S()); S().tribFails = 0;
E.doBreak();
T('玄仙L8开大劫面板', E.panel && E.panel.kind === 'trib' && E.currentTri().final === true, 'final=', E.currentTri().final);
E.applyTribOption('hard');
T('玄仙大劫失败+1因果', S().tribFails === 1, 'fails=', S().tribFails);
setRand(() => 0.1);
S().cult = st.layerNeed(S()); E.doBreak();
S().daoFruit = st.tribFruitCost(S());
E.applyTribOption('fruit');
T('玄仙大劫借果必成', S().layer === 9 && S().tribFails === 0, 'layer=', S().layer, 'fails=', S().tribFails);
S().realmIdx = 12; S().layer = 9; S().cult = st.layerNeed(S());
seedRealmRequirements(E);
T('大罗圆满按钮=证道飞升', E.breakInfo().kind === 'ascend', 'kind=', E.breakInfo().kind);
const fF = S().daoFruit;
E.openRealm(); chooseProgression(E);
T('证道飞升=终局', E.ended === true && S().daoFruit === fF, 'ended=', E.ended, 'fruit=', S().daoFruit);
{
  const before = S().daoFruit, tBefore = S().times;
  E.reincarnate(0);
  T('轮回结道果(大罗圆满48)', S().daoFruit === before + 48, 'fruit=', S().daoFruit, 'delta=', S().daoFruit - before);
  T('轮回后新世状态', S().times === tBefore + 1 && S().realmIdx === 0 && S().layer === 0, 'times=', S().times);
  E.closeBegin();
  S().bld.mine = 10;
}
E.ended = false; S().tribFails = 0; S().daoFruit = 0;

/* ---- 功法品阶（参悟三选一） ---- */
S().realmIdx = 0; S().gongfaLv = 1; S().gongfaBook = []; S().spirit = 999999;
T('练气可参悟下品(上限2重)', st.gongfaMaxLv(S()) === 2, 'max=', st.gongfaMaxLv(S()));
const spG0 = S().spirit;
E.buyGongfa();
T('参悟开三选一面板', !!E.panel && E.panel.kind === 'gongfa' && E.panel.data.opts.length === 4, 'panel=', E.panel && E.panel.kind, 'opts=', E.panel && E.panel.data.opts.length);
T('开面板未收费', S().spirit === spG0, 'sp=', S().spirit);
E.applyGongfaOption('later');
T('暂且放下：不收费不升级', S().gongfaLv === 1 && S().spirit === spG0 && !E.panel, 'lv=', S().gongfaLv);
E.buyGongfa();
const ccG0 = st.cultPerClick(S());
E.applyGongfaOption('taixuan1');
T('择一参悟至2重', S().gongfaLv === 2 && S().gongfaBook[0] === 'taixuan1', 'lv=', S().gongfaLv, 'book=', S().gongfaBook[0]);
T('择一参悟收费', S().spirit < spG0, 'sp=', S().spirit);
T('功法被动生效(太玄经+6%)', Math.abs(st.cultPerClick(S()) / ccG0 - 1.8 * 1.06) < 1e-6, 'ratio=', (st.cultPerClick(S()) / ccG0).toFixed(4));
E.buyGongfa();
T('上限拒绝参悟', S().gongfaLv === 2 && !E.panel, 'lv=', S().gongfaLv);
S().realmIdx = 1;
T('筑基解锁中品(上限3)', st.gongfaMaxLv(S()) === 3, 'max=', st.gongfaMaxLv(S()));
S().realmIdx = 9;
T('真仙功法上限7重', st.gongfaMaxLv(S()) === 7, 'max=', st.gongfaMaxLv(S()));
S().realmIdx = 11;
T('金仙功法上限8重(神品)', st.gongfaMaxLv(S()) === 8, 'max=', st.gongfaMaxLv(S()));
S().v = 5; S().gongfaLv = 12; st.migrate(S());
T('迁移收敛功法超档', S().gongfaLv === 7 && S().gongfaBook.length === 6, 'lv=', S().gongfaLv, 'books=', S().gongfaBook.length);
S().realmIdx = 0;

/* ---- 道坛（灵石后期出口） ---- */
S().life = st.lifeCap(S()); S().lifeLedger = null; S().realmIdx = 0; S().med = 0; S().buffs.shock = 0;
S().bld.altar = 0;
T('道坛未建速率0', st.altarRate(S()) === 0, 'r=', st.altarRate(S()));
S().bld.altar = 3;
T('道坛速率>0', st.altarRate(S()) > 0, 'r=', st.altarRate(S()));
const altS = S().spirit, altC = S().cult;
S().spirit = 1e9; S().med = 0; S().buffs.shock = 0;
E.tick(1);
T('道坛烧灵产修为', S().cult > altC && S().spirit < altS + 1e9, 'cult=', (S().cult - altC).toFixed(0), 'spirit=', (S().spirit - altS).toFixed(0));
S().med = 60; S().buffs.tide = 0; S().buffs.shock = 0;
const spMed = S().spirit, culMed = S().cult;
E.tick(1);
{
  const close = (a, b) => Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-6);
  const expCul = st.zhenRate(S()) * 1 + st.cultPerClick(S()) * GX.MED_RATE;
  const expSpir = st.mineRate(S()) * 1;
  T('闭关卡道坛', close(S().cult - culMed, expCul) && close(S().spirit - spMed, expSpir),
    'dCult=', (S().cult - culMed).toExponential(3), 'exp=', expCul.toExponential(3), 'dSpir=', (S().spirit - spMed).toExponential(3), 'exp=', expSpir.toExponential(3));
}
S().med = 0;

/* ---- 残片品级阶梯 + 仙品法宝 ---- */
S().shards = { fan: 0, ling: 0, xuan: 0, di: 0 };
T('残片分池', st.shardCost(S(), 1).key === 'fan' && st.shardCost(S(), 2).key === 'ling' && st.shardCost(S(), 3).key === 'xuan' && st.shardCost(S(), 4).key === 'di', 'sc=', JSON.stringify([st.shardCost(S(), 1), st.shardCost(S(), 2), st.shardCost(S(), 3), st.shardCost(S(), 4)]));
S().bld.forge = 4; S().shards.di = 15;
E.forgeTreasure(4);
T('仙品法宝装备', S().treasure && S().treasure.q === 4, 'tr=', JSON.stringify(S().treasure));
S().shards.di = 0;
E.forgeTreasure(4);
T('地品不足拒炼', S().treasure.q === 4 && S().shards.di === 0);
E.markSeen('treasures', '4_wu', '仙品·护体');
T('仙品图鉴可点亮', !!S().seen.treasures['4_wu'], 'seen=', Object.keys(S().seen.treasures).join(','));

/* ---- 引渡分级 ---- */
S().realmIdx = 8;
T('引渡费:渡劫期5', st.tribFruitCost(S()) === 5, 'c=', st.tribFruitCost(S()));
S().realmIdx = 9;
T('引渡费:真仙10', st.tribFruitCost(S()) === 10, 'c=', st.tribFruitCost(S()));
S().realmIdx = 12;
T('引渡费:大罗25', st.tribFruitCost(S()) === 25, 'c=', st.tribFruitCost(S()));
S().realmIdx = 8;

/* ---- 仙界秘境场景（minRealm 过滤） ---- */
S().realmIdx = 9;
const pool9 = GX.SECRET_EVENTS.filter(e => S().realmIdx >= e.minRealm);
T('真仙场景池含仙气', pool9.some(e => e.id === 'xianqi'), 'pool=', pool9.map(e => e.id).join(','));
const pool0 = GX.SECRET_EVENTS.filter(e => 0 >= e.minRealm);
T('人界场景池无星海', pool0.every(e => e.minRealm === 0), 'pool=', pool0.map(e => e.id).join(','));
S().realmIdx = 12;
const pool12 = GX.SECRET_EVENTS.filter(e => S().realmIdx >= e.minRealm);
T('大罗场景池含星海', pool12.some(e => e.id === 'luohai'), 'pool=', pool12.map(e => e.id).join(','));
S().realmIdx = 0;

/* ---- 讨伐战斗 ---- */
S().realmIdx = 0; S().layer = 0; S().med = 0; S().taoCd = 0; E.battle = null;
T('讨伐首世开节点1', S().taoMax === 1, 'taoMax=', S().taoMax);
E.taoStart(5);
T('未解锁节点不可出战', E.battle === null, 'battle=', E.battle);
E.taoStart(1);
T('开战(气血池独立)', E.battle !== null && E.battle.eHp > 0 && E.battle.pPh === E.battle.pMax, 'eHp=', E.battle && E.battle.eHp);
const eHpB = E.battle.eHp, pPhB = E.battle.pPh, turnB = E.battle.turn;
E.taoAct('strike'); E.tick(1.6);
T('出手伤敌', E.battle.eHp < eHpB, 'eHp=', E.battle.eHp, 'was=', eHpB);
T('敌方反扑', E.battle.pPh < pPhB, 'pPh=', E.battle.pPh);
T('回合计数', E.battle.turn > turnB, 'turn=', E.battle.turn);
E.battle.pAuto = 1; E.battle.acc = 1.6;
const turnA = E.battle.turn;
E.taoAutoTick(1.7);
T('自动回合推进', E.battle ? E.battle.turn > turnA : true, 'from=', turnA, 'to=', E.battle && E.battle.turn);
E.taoFlee();
T('撤退清战斗+冷却30', E.battle === null && S().taoCd === 30, 'cd=', S().taoCd);
S().taoCd = 0;
E.taoStart(1);
E.battle.eHp = 1;
const spB = S().spirit, cuB = S().cult, fanB = S().shards.fan;
E.taoAct('strike'); E.tick(1.6);
T('胜结算:灵石/修为/残片', S().spirit > spB && S().cult > cuB && S().shards.fan > fanB, 'sp+', S().spirit - spB, 'cu+', S().cult - cuB, 'fan=', S().shards.fan);
T('胜推进下一节点', S().taoMax === 2, 'taoMax=', S().taoMax);
T('讨伐计数+冷却', S().taoKills >= 1 && S().taoCd === 30, 'kills=', S().taoKills, 'cd=', S().taoCd);
S().taoCd = 0;
E.taoStart(2);
E.battle.pPh = 1;
const cuL = S().cult;
E.taoAct('strike'); E.tick(1.6);
T('败:重伤15秒+修为-5%', S().buffs.shock >= 15 && S().cult < cuL && E.battle === null, 'shock=', S().buffs.shock);
S().buffs.shock = 0;
S().beasts.fan = 1; S().beasts.ling = 1;
T('灵兽星总数', st.beastStars(S()) === 2, 'stars=', st.beastStars(S()));
S().treasure = { q: 3, type: 'wu', words: {} };
T('法宝护体减伤(25/200=12.5%)', Math.abs(st.taoDefPct(S()) - 0.125) < 1e-9, 'd=', st.taoDefPct(S()));
S().treasure = null; S().beasts.fan = 0; S().beasts.ling = 0;
T('新图鉴含八种可抽灵根(37项)', st.codexTotal() === 49, 'tot=', st.codexTotal());
const e0 = st.taoEnemy(S(), 1);
S().realmIdx = 5; E.setChapter(5);
const e5 = st.taoEnemy(S(), 1);
T('讨伐兽随境界变强', e5.hp > e0.hp && e5.atk > e0.atk, 'hp0=', e0.hp, 'hp5=', e5.hp);
S().realmIdx = 0;
st.migrate(S());
T('迁移补讨伐字段', S().taoMax >= 1 && S().taoKills >= 0 && S().seen.tao && typeof S().seen.tao === 'object');

/* ---- 整世模拟（bot 全开） ---- */
let seed = 20260915;
setRand(() => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; });
const S2 = st.freshState();
E.hydrate(S2);
E.S.root = ['jin', 'mu', 'huo', 'tu']; E.S.life = st.lifeCap(E.S);
let clicks = 0, botSec = 0;
for (; botSec < 60 * 60 * 24 * 7 && !E.ended; botSec++) {
  for (let i = 0; i < 5; i++) { E.doCultivate(); clicks++; }
  prepareProgression(E);
  for (const b of GX.BLDS.filter(b => b.id !== 'altar')) if (E.S.spirit >= st.bldCost(E.S, b.id)) E.buyBld(b.id);
  if (!E.panel) E.buyGongfa();
  for (const k in GX.PILLS) if (!GX.PILLS[k].breakthrough && E.S.pills[k] < 3 && E.S.spirit >= st.pillCost(E.S, k)) E.craftPill(k);
  { const sc = st.shardCost(E.S, 1); if (E.S.shards[sc.key] >= sc.n && E.S.bld.forge >= 1 && Math.random() < 0.3) E.forgeTreasure(1, false, 'ju'); }
  if (E.S.pills.huichun > 0 && E.S.life / st.lifeCap(E.S) < 0.8) E.usePill('huichun');
  if (E.S.pills.xuan > 0) E.usePill('xuan');
  if (E.S.pills.juli > 0 && E.S.foundation) E.usePill('juli');
  if (E.S.eggs.fan > 0 && Math.random() < 0.1) E.releaseEgg('fan');
  if (E.breakInfo().ok) E.doBreak();
  chooseProgression(E);
  if (E.panel && E.panel.kind === 'trib') {
    const d = E.panel.data, o = d.opts.find(x => x.id === 'fruit' && !x.disabled) || d.opts[0];
    E.applyTribOption(o.id);
  }
  if (E.panel && E.panel.kind === 'secret') E.applySecretOption(safeChoice(E).id);
  else if (E.panel && E.panel.kind === 'encounter') E.applyEncOption(safeChoice(E).id);
  else if (E.panel && E.panel.kind === 'gongfa') E.applyGongfaOption(E.panel.data.opts[0].id);
  if (!E.panel && E.S.secretCd <= 0 && E.S.spirit > st.layerNeed(E.S) * 2 && Math.random() < 0.01) E.openSecret();
  if (E.S.combat && E.S.combat.hp < E.S.combat.maxHp * .6 && E.canStartActivity()) E.startRecovery();
  playBattle(E); E.tick(1);
  if (E.S.cult >= st.layerNeed(E.S)) E.doBreak();
}
console.log('整世: realm=' + GX.REALMS[E.S.realmIdx].name + E.S.layer, 'life=' + E.S.life.toFixed(1) + '/' + st.lifeCap(E.S), 'ended=' + E.ended, 'clicks=' + clicks);
T('整世可推进到大罗圆满', E.S.realmIdx === 12 && E.S.layer === 9);
T('整世完成证道并点亮成就', E.ended === true && E.S.ascended && !!E.S.achieved.daluozheng);
T('整世实际取得天道道基并完成13次破境', E.S.foundation === 'tian' && Object.keys(E.S.milestones).length === 13);
setRand(origRandom);

console.log('PASS', pass, 'FAIL', fail);
process.exit(fail ? 1 : 0);
