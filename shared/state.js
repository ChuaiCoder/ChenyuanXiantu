/* ============ 状态层：纯公式 + freshState（服务端/客户端共用） ============
   所有函数以 (S, ...) 取状态为第一参；不写 DOM，可跑在 Node（引擎）或浏览器（派生显示）。 */
import { GX } from './data.js';
import { fmt } from './format.js';
import { rootFx } from './roots.js';
import { foundationKit, legacyRoot } from './relic-state.js';
import { fixedEnemy } from './combat.js';
import { totalLifeCap } from './life.js';
import { pillMaterials } from './inventory.js';
export { freshState, migrate, STATE_VERSION } from './state-schema.js';
export { rootIds, rootFx, validRoot, rootProfile, hasRoot, rollRoots } from './roots.js';

export function battleLifeLoss(S) {
  return Math.max(1, Math.ceil(lifeCap(S) * GX.BATTLE_LIFE_LOSS));
}

/* ============ 功法被动（已修书录聚合） ============ */
export function gongfaFx(S) {
  const fx = { cult: 0, spirit: 0, trib: 0, life: 0, luck: 0, build: 0, battle: 0 };
  for (const id of S.gongfaBook || []) {
    const b = GX.GONGFA_BY_ID[id];
    if (b) fx[b.school] += b.mag;
  }
  return fx;
}

/* ============ 核心数值 ============ */
export function realmMult(S) { return GX.REALM_MULT[S.realmIdx]; }
export function codexCount(S) {
  const s = S.seen || {};
  return ["roots", "treasures", "beasts", "encs", "tao"].reduce((n, k) => n + Object.keys(s[k] || {}).length, 0);
}
export function wordLevel(S, id) { return (S.treasure && S.treasure.words && S.treasure.words[id]) || 0; }
export function beastStars(S) {
  return Object.keys(GX.BEASTS).reduce((s, k) => s + Math.min(GX.BEASTS[k].stars, S.beasts[k] || 0), 0);
}
export function globalMult(S) {
  let m = realmMult(S) * (1 + 0.04 * S.bld.beast) * (1 + 0.03 * S.prestige);
  m *= (1 + rootFx(S).cult) * (1 + (GX.FOUNDATIONS[S.foundation]?.cult || 0));
  if (S.treasure && S.treasure.type === "ju") m *= 1 + GX.TREASURES[S.treasure.q - 1].fx.ju / 100;
  if (S.daoHeart) m *= 1 + Math.min(0.30, S.daoHeart * 0.02);
  if (S.constitution === "leiti") m *= 1.30;
  m *= 1 + wordLevel(S, "juling") * 0.04;
  m *= 1 + codexCount(S) * 0.002;
  m *= 1 + Math.min(0.10, Object.values(S.beasts || {}).reduce((s, n) => s + n, 0) * 0.02);
  for (const a of GX.ACHIEVEMENTS)
    if (S.achieved[a.id]) m *= (1 + parseInt(a.fx.match(/\d+/)[0], 10) / 100);
  return m;
}
export function cultPerClick(S) { return GX.BASE_CULT * Math.pow(1.8, S.gongfaLv - 1) * globalMult(S) * (1 + gongfaFx(S).cult); }
/* 自动修炼份数：聚灵阵 0 级 = 1 份基础，每级 +1 份；每提升一个大境界再放大 (1 + AUTO_REALM_BONUS)。
   手动点击不吃这份境界加成——境界越高，产出重心越自然地从点击转向自动化。 */
export function autoUnits(S) { return (1 + (S.bld.zhen || 0)) * (1 + GX.AUTO_REALM_BONUS * S.realmIdx); }
/* 自动修炼速率：锚定点击值（与功法、灵根、法宝等加成同源），保证自动化不会随时间掉队。 */
export function zhenRate(S) { return cultPerClick(S) * GX.AUTO_CULT_BASE * autoUnits(S); }
/* 自动化在修为产出中的占比（默认按每秒 1 次点击估算），供界面提示产出重心。 */
export function autoShare(S, clicksPerSec = 1) {
  const auto = zhenRate(S), click = cultPerClick(S) * clicksPerSec;
  return auto + click > 0 ? auto / (auto + click) : 0;
}
/* 修为产出的构成：聚灵阵（自动打坐）/ 道坛（燃灵凝练）/ 手动点击，三者占比。
   界面上的「产能构成条」与「自动化率」都取自这里；默认按每秒 1 次点击估算。 */
export function outputMix(S, clicksPerSec = 1) {
  const auto = zhenRate(S);
  const altar = (S.bld.altar > 0 && S.altarEnabled !== false) ? altarRate(S) : 0;
  const click = cultPerClick(S) * clicksPerSec;
  const total = auto + altar + click;
  return total > 0
    ? {
        auto, altar, click, total,
        autoPct: (auto + altar) / total,
        zhenShare: auto / total, altarShare: altar / total, clickShare: click / total,
      }
    : { auto: 0, altar: 0, click: 0, total: 0, autoPct: 0, zhenShare: 0, altarShare: 0, clickShare: 0 };
}
/* 离线托管预估：与 server/systems/activity.mjs 的 offlineEarnings 同源——
   只结算聚灵阵（修为）与灵石矿（灵石），按 OFFLINE_EFF 折算并封顶 OFFLINE_CAP 秒。
   界面上的「离线 4 小时能拿多少」必须走这里，不要在前端另写一份公式。 */
export function offlineForecast(S, seconds = GX.OFFLINE_CAP) {
  const dt = Math.min(Math.max(0, seconds), GX.OFFLINE_CAP);
  return { seconds: dt, cult: zhenRate(S) * dt * GX.OFFLINE_EFF, spirit: mineRate(S) * dt * GX.OFFLINE_EFF };
}
export function mineRate(S) {
  let r = 1.5 * S.bld.mine * (1 + 0.15 * (S.gongfaLv - 1)) * realmMult(S);
  if (S.constitution === "lingti") r *= 1.5;
  return r * (1 + gongfaFx(S).spirit);
}
export function merchantPrices(S) {
  return {
    shards: Math.ceil(Math.max(150, mineRate(S) * 60, 120 * Math.pow(1.8, S.realmIdx))),
    treasure: Math.ceil(Math.max(400, mineRate(S) * 160, 320 * Math.pow(1.8, S.realmIdx))),
  };
}
export function lifeCap(S) { return totalLifeCap(S); }
export function layerNeed(S) {
  return Math.ceil(GX.LAYER_REQ * GX.REALM_NEED[S.realmIdx] * Math.pow(GX.LAYER_GROWTH, S.layer));
}
export function isTopLayer(S) { return S.layer >= GX.REALMS[S.realmIdx].layers; }
export function isFinalRealm(S) { return S.realmIdx === GX.REALMS.length - 1; }
export function isFinalTri(S) {
  if (S.realmIdx === GX.TRIB_REALM) return S.layer >= GX.REALMS[GX.TRIB_REALM].layers - 1;
  if (S.realmIdx > GX.TRIB_REALM) return S.layer === GX.REALMS[S.realmIdx].layers - 1;
  return false;
}
export function isXianTriLayer(S) {
  if (S.realmIdx <= GX.TRIB_REALM) return false;
  return GX.XTRIBS[S.realmIdx - GX.TRIB_REALM - 1].some(t => t.layer === S.layer);
}
export function prestigeGain(S) {
  if (isFinalRealm(S) && isTopLayer(S)) return 50 + S.layer;
  if (S.realmIdx >= 1 && (S.times >= 1 || foundationCapped(S))) return 5 + S.realmIdx * 2 + S.layer;
  return 0;
}
export function lifeFruit(S) {
  if (S.realmIdx < 3) return 0;
  let f = (S.realmIdx - 2) * 3 + Math.floor(S.layer / 3);
  if (isFinalRealm(S) && isTopLayer(S)) f += 15;
  return f;
}
export function gongfaMaxLv(S) {
  let m = 0;
  for (const t of GX.GONGFA_TIERS) if (S.realmIdx >= t.minRealm) m++;
  return 1 + m; // 入门第1重 + 每个已解锁品阶各参悟一次
}
export function gongfaTierName(S) {
  return GX.GONGFA_TIERS[S.gongfaLv - 2]?.name || '入门';
}
export function codexRoots(S) { return Object.keys(GX.ROOTS).filter(id => !GX.ROOTS[id].legacy || S?.seen?.roots?.[id]); }
export function codexTotal(S) {
  return codexRoots(S).length + GX.TREASURES.length * Object.keys(GX.TREASURE_TYPES).length + Object.keys(GX.BEASTS).length + GX.ENCOUNTERS.length + GX.TAO_MAP.length;
}
export function itemTier(S) { return Math.pow(1.8, S.realmIdx); }
export function eggPrice(S, k) { return Math.ceil(GX.EGGS[k].price * itemTier(S)); }
export function gongfaCost(S) { return Math.ceil(100 * Math.pow(1.6, S.gongfaLv - 1) * itemTier(S)); }
export function bldCost(S, id) {
  const b = GX.BLDS.find(x => x.id === id);
  let c = b.cost(S.bld[id]);
  c = Math.ceil(c * (1 - rootFx(S).build));
  c = Math.ceil(c * (1 - Math.min(0.5, gongfaFx(S).build)));
  return c;
}
export function pillCost(S, k) {
  const p = GX.PILLS[k];
  let c = Math.ceil(p.cost * (p.breakthrough ? Math.pow(1.8, p.minRealm) : itemTier(S)));
  c = Math.ceil(c * (1 - rootFx(S).pill));
  return c;
}
export function shardCost(S, q) {
  const t = GX.TREASURES[q - 1];
  const key = t.shardKey || "fan";
  let n = t.shard;
  n = Math.ceil(n * (1 - rootFx(S).forge));
  return { key, n };
}
export function altarRate(S) {
  if (S.bld.altar <= 0) return 0;
  return mineRate(S) * 0.2 * S.bld.altar;
}
export function refineCost(S) {
  const sc = shardCost(S, S.treasure.q);
  return { spirit: Math.ceil(Math.max(200, mineRate(S) * 120)), shardKey: sc.key, shard: sc.n };
}
export function tribBase(kind) { return kind === "layer" ? 0.9 : 0.6; }
export function tribFruitCost(S) { return 5 + Math.max(0, S.realmIdx - GX.TRIB_REALM) * 5; }
export function tribChance(S, kind, base = tribBase(kind)) {
  let c = base;
  if (S.pills.dujie > 0) c += 0.20;
  if (S.treasure && S.treasure.type === "wu") c += GX.TREASURES[S.treasure.q - 1].fx.wu / 100;
  c += wordLevel(S, "huxi") * 0.03;
  if (S._xuanActive) c += 0.15;
  c += rootFx(S).trib + (GX.FOUNDATIONS[S.foundation]?.trib || 0);
  if (S.constitution === "danti") c += 0.10;
  if (S.tribBless) c += 0.12;
  c += gongfaFx(S).trib;
  c = Math.min(0.98, c);
  if (kind === "layer" && isFinalTri(S)) c = Math.max(0.30, c - 0.05 * S.tribFails);
  return c;
}
export function dropChance(S, kind) {
  let c = { spirit: 0.08, shard: 0.06, egg: 0.04 }[kind];
  const roots = rootFx(S);
  c *= 1 + roots.luck;
  if (kind === 'shard') c *= 1 + roots.shard;
  if (kind === 'egg') c *= 1 + roots.egg;
  if (S.constitution === "yuanti") c *= 1.25;
  if (S.treasure && S.treasure.type === "yuan") c += GX.TREASURES[S.treasure.q - 1].fx.yuan / 100;
  c += wordLevel(S, "yuan") * 0.01;
  c *= 1 + gongfaFx(S).luck;
  return Math.min(0.6, c);
}

/* ============ 风险抉择：让奇遇/秘境的概率随状态变化 ============
   道心越坚，越能压住凶险。只提供增益、不下调基准，因此不构成隐性惩罚。 */
export function riskChance(S, base, { daoScale = 0.02, cap = 0.85 } = {}) {
  const bonus = Math.min(Math.max(0, cap - base), (S.daoHeart || 0) * daoScale);
  return Math.min(cap, base + bonus);
}
/* 修炼暴击：受机缘加成，仍只放大单次点击。 */
export function critChance(S) {
  return Math.min(GX.CRIT.cap, GX.CRIT.base + rootFx(S).luck * GX.CRIT.luckScale);
}
/* ============ 长期成长：道行里程碑与跨世传承 ============ */
export function prestigeTier(S) { return Math.floor((S.prestige || 0) / GX.LEGACY_REROLL_STEP); }
export function legacyRerollBonus(S) { return Math.min(GX.LEGACY_REROLL_MAX, prestigeTier(S)); }
/* 洞府传承只承接生产类建筑；道坛需本世自建，避免开局自动燃灵。 */
const LEGACY_BLDS = ['zhen', 'mine', 'beast', 'furn', 'forge'];
export function legacyKeep(n) { return Math.floor(Math.max(0, n || 0) * GX.LEGACY_KEEP); }
export function legacyCaveLevels(legacy) {
  return LEGACY_BLDS.reduce((s, k) => s + (legacy?.bld?.[k] || 0), 0);
}
/* 入世面板的传承三选一；无可继承项时该项禁用。 */
export function legacyOptions(legacy) {
  if (!legacy) return [];
  const books = (legacy.gongfaBook || []).length, cave = legacyCaveLevels(legacy), insight = legacy.insight || 0;
  return [
    { id: 'gongfa', label: '功法传承', detail: `保留上一世 ${legacyKeep(books)}/${books} 部功法`, disabled: legacyKeep(books) <= 0 },
    { id: 'cave', label: '洞府传承', detail: `保留上一世半数建筑等级（共 ${cave} 级）`, disabled: legacyKeep(cave) <= 0 },
    { id: 'insight', label: '悟性传承', detail: `保留上一世 ${legacyKeep(insight)}/${insight} 点悟道心得`, disabled: legacyKeep(insight) <= 0 },
  ];
}

/* 突破可用性（服务端引擎与客户端按钮文案同源） */
export function breakInfo(S) {
  if (foundationCapped(S)) return { ok: false, txt: `${foundationName(S)}已至上限，需转世重修`, kind: 'realm' };
  if (S.cult < layerNeed(S)) return { ok: false, txt: `修为不足（${fmt(S.cult)}/${fmt(layerNeed(S))}）`, kind: 'layer' };
  if (!isTopLayer(S)) return { ok: true, txt: `渡本层小劫 成功率 ${Math.round(tribChance(S, 'layer') * 100)}%`, kind: 'layer' };
  const plans = realmPlans(S), ready = plans.some(p => p.ok);
  return { ok: ready, txt: ready ? `择法破境 · ${GX.BREAKTHROUGHS[S.realmIdx].name}` : '破境条件未齐 · 查看筹备', kind: [8, 12].includes(S.realmIdx) ? 'ascend' : 'realm' };
}

export function foundationName(S) { return GX.FOUNDATIONS[S.foundation]?.name || (S.foundation === 'legacy' ? '旧世道基' : '尚未筑基'); }
export function foundationCapped(S) {
  const f = GX.FOUNDATIONS[S.foundation];
  return !!f && f.maxRealm < 12 && S.realmIdx >= f.maxRealm && isTopLayer(S);
}
export function materialCost(S, id) { const m = GX.MATERIALS[id]; return m.bound ? Infinity : Math.ceil(m.price * Math.pow(1.8, m.minRealm)); }
export function pillBlockReason(S, id) {
  const pill = GX.PILLS[id];
  if (!pill?.breakthrough) return '';
  const target = GX.BREAKTHROUGHS.find(g => g.pill === id)?.to ?? 1;
  const cap = GX.FOUNDATIONS[S.foundation]?.maxRealm ?? 12;
  if (cap < 12 && target > cap) return '超出本世道基上限，转世重修后再筹备';
  if (target <= S.realmIdx) return '已完成对应破境，此丹本世无需再炼';
  return '';
}
export function relicInfo(S, id) {
  if (!Object.hasOwn(GX.FOUNDATION_RELICS, id)) return { ok: false, missing: ['未知筑基之物'], requirements: [] };
  const r = GX.FOUNDATION_RELICS[id];
  const requirements = [
    { label: '悟道心得', have: S.insight || 0, need: r.insight, source: '完整闭关获得，凝聚时不消耗' },
    ...Object.entries(r.materials).map(([key, need]) => ({ label: GX.MATERIALS[key].name, have: S.materials[key] || 0, need, source: GX.MATERIALS[key].source })),
  ];
  const missing = requirements.filter(x => x.have < x.need).map(x => `${x.label} ${fmt(x.have)}/${fmt(x.need)}`);
  if (!legacyRoot(S)) missing.unshift('请在寻道录中取得与灵根匹配的筑基之物');
  if (S.realmIdx !== 0 || S.foundation) missing.unshift('此世道基已定，无需再凝聚筑基之物');
  if (S.relics[id] > 0) missing.unshift('已持有一件，无需重复凝聚');
  return { ok: !missing.length, missing, requirements };
}
export function craftInfo(S, id) {
  const p = GX.PILLS[id];
  if (!p) return { ok: false, missing: ['未知丹方'], requirements: [] };
  const requirements = [{ label: '灵石', have: S.spirit, need: pillCost(S, id), source: '灵石矿、采药或历练' }];
  if (p.breakthrough) {
    requirements.push({ label: `境界：${GX.REALMS[p.minRealm].name}`, have: S.realmIdx, need: p.minRealm, source: '先修至对应境界' });
    requirements.push({ label: '丹房等级', have: S.bld.furn, need: p.furnace, source: '洞府扩建丹房' });
  }
  if (!p.breakthrough && p.furnace) requirements.push({ label: '丹房等级', have: S.bld.furn, need: p.furnace, source: '洞府扩建丹房' });
  for (const [key, need] of Object.entries(pillMaterials(S, id))) requirements.push({ label: GX.MATERIALS[key].name, have: S.materials?.[key] || 0, need, source: GX.MATERIALS[key].source + '；亦可在丹器页购买' });
  const missing = requirements.filter(r => r.have < r.need).map(r => `${r.label} ${fmt(r.have)}/${fmt(r.need)}`);
  const blocked = pillBlockReason(S, id);
  if (blocked) missing.unshift(blocked);
  return { ok: !missing.length, missing, requirements };
}
export function realmPlans(S) {
  const gate = GX.BREAKTHROUGHS[S.realmIdx];
  if (!gate) return [];
  const routes = gate.to === 1 ? Object.keys(GX.FOUNDATIONS) : ['advance'];
  return routes.map(id => {
    const route = gate.to === 1 ? GX.FOUNDATIONS[id] : null;
    const pill = route?.pill || gate.pill;
    const requirements = [
      { label: '本境层数', have: S.layer, need: GX.REALMS[S.realmIdx].layers, source: '先完成本境九层修行' },
      { label: '修为', have: S.cult, need: layerNeed(S), source: '修炼、闭关或聚灵阵' },
      { label: '功法重数', have: S.gongfaLv, need: gate.book, source: '洞府参悟功法；任一流派均可' },
      { label: '悟道心得', have: S.insight || 0, need: gate.insight, source: '每次完整闭关获得 1 点，不消耗' },
      { label: GX.PILLS[pill].name, have: S.pills[pill] || 0, need: 1, source: '丹器页按丹方炼制；每次尝试消耗 1 枚' },
    ];
    const kit = route ? foundationKit(S, id) : null;
    if (kit) requirements.push(...kit.requirements);
    if (foundationCapped(S)) requirements.unshift({ label: '道基上限', have: 0, need: 1, source: '本世无法补强，须在道途页转世重修' });
    const missing = requirements.filter(r => r.have < r.need).map(r => `${r.label} ${fmt(r.have)}/${fmt(r.need)}`);
    const chance = gate.certain ? 1 : tribChance(S, 'realm', (route?.chance ?? .6) + Math.min(.3, (S.realmFails || 0) * .05));
    return { id, name: route?.name || gate.name, pill, relic: route ? id : null, relicItems: kit?.ids || [], relicName: kit?.name || '', requirements, missing, ok: !missing.length, chance, desc: route?.desc || gate.text };
  });
}

/* 旧存档进行中的战斗仍使用原减伤公式。 */
export function taoDefPct(S) {
  let d = 0;
  if (S.treasure && S.treasure.type === "wu") d += GX.TREASURES[S.treasure.q - 1].fx.wu / 200;
  if (S.treasure && S.treasure.type === "ju") d += GX.TREASURES[S.treasure.q - 1].fx.ju / 300;
  return Math.min(0.5, d);
}
export function taoEnemy(S, n) { return fixedEnemy(S, n); }
