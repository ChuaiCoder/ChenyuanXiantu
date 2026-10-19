// Creation and legacy-save normalization. Runtime formulas live in state.js.
import { GX } from './data.js';
import { rootIds, validRoot } from './roots.js';
import { RELIC_ITEMS } from './relic-data.js';
import { seekFresh, migrateSeek } from './relic-state.js';
import { totalLifeCap, initLife } from './life.js';
import { syncPillGrades, freshPillGrades } from './inventory.js';

export const STATE_VERSION = 11;

export function freshState() {
  return {
    v: STATE_VERSION, name: "无名道修",
    realmIdx: 0, layer: 0,
    cult: 0, spirit: 0, life: 100, lifeBonus: 0, lifeLedger: null,
    gongfaLv: 1, gongfaBook: [],
    root: ['jin'],
    foundation: null, insight: 0, realmFails: 0, milestones: {},
    relics: { ren: 0, di: 0, tian: 0, ...Object.fromEntries(Object.keys(RELIC_ITEMS).map(k => [k, 0])) },
    seek: seekFresh(),
    materials: Object.fromEntries(Object.keys(GX.MATERIALS).map(k => [k, 0])),
    bld: { zhen: 0, mine: 0, beast: 0, furn: 0, forge: 0, altar: 0 }, altarEnabled: true,
    pills: Object.fromEntries(Object.keys(GX.PILLS).map(k => [k, 0])),
    shards: { fan: 0, ling: 0, xuan: 0, di: 0 },
    treasure: null,
    eggs: { fan: 0, ling: 0, xuan: 0, di: 0 },
    beasts: { fan: 0, ling: 0, xuan: 0, di: 0 },
    buffs: { tide: 0, shock: 0 },
    secretCd: 0, medCd: 0, taoCd: 0,
    constitution: null,
    tribBless: false,
    prestige: 0, times: 0,
    daoHeart: 0,
    daoFruit: 0,
    tribFails: 0,
    seen: { roots: {}, treasures: {}, beasts: {}, encs: {}, tao: {} },
    med: 0,
    combat: null, recovery: 0, study: null,
    pillGrades: freshPillGrades(),
    _pend: {},
    breaks: 0, clicks: 0, forgeN: 0,
    eggsGot: 0, encN: 0,
    taoMax: 1, taoKills: 0, taoBoss: 0,
    achieved: {}, ascended: false,
    lastTs: Date.now(),
  };
}

/* 迁移旧档：v4 修正寿元；v5 补录功法；v6 以书录为准，允许修满七品。 */
export function migrate(d) {
  if ((d.v || 0) < 10) { d.lifeLedger = null; d.pillGrades = {}; }
  // v5：功法书录——旧档按 gongfaLv 补录各品阶首部功法；书录为准，重数随书录
  d.gongfaBook = Array.isArray(d.gongfaBook) ? [...new Set(d.gongfaBook.filter(id => GX.GONGFA_BY_ID[id]))] : [];
  // 旧档保留原有重数；新档以书录为准，不凭重数额外赠书。
  const targetLv = d.v < 6 ? Math.max(1, Math.min(d.gongfaLv || 1, GX.GONGFA_TIERS.length)) : 1;
  const books = [];
  for (const tier of GX.GONGFA_BOOKS) {
    const book = tier.find(b => d.gongfaBook.includes(b.id));
    if (!book) break;
    books.push(book.id);
  }
  d.gongfaBook = books;
  while (1 + d.gongfaBook.length < targetLv) {
    const tier = GX.GONGFA_BOOKS[d.gongfaBook.length];
    const pick = tier.find(b => !d.gongfaBook.includes(b.id)) || tier[0];
    d.gongfaBook.push(pick.id);
  }
  d.gongfaLv = 1 + d.gongfaBook.length;
  if (d.v === 3) d.life = Math.max(1, totalLifeCap(d) - (d.life || 0));
  d.buffs = d.buffs || { tide: 0, shock: 0 };
  d.secretCd = d.secretCd || 0;
  d.bld = Object.assign({ zhen: 0, mine: 0, beast: 0, furn: 0, forge: 0, altar: 0 }, d.bld);
  d.pills = Object.assign(Object.fromEntries(Object.keys(GX.PILLS).map(k => [k, 0])), d.pills);
  d.shards = Object.assign({ fan: 0, ling: 0, xuan: 0, di: 0 }, d.shards);
  d.eggs = Object.assign({ fan: 0, ling: 0, xuan: 0, di: 0 }, d.eggs);
  d.beasts = Object.assign({ fan: 0, ling: 0, xuan: 0, di: 0 }, d.beasts);
  d.treasure = d.treasure || null;
  d.daoHeart = d.daoHeart || 0; d.med = d.med || 0; d.medCd = d.medCd || 0;
  d.taoCd = d.taoCd || 0;
  d.daoFruit = d.daoFruit || 0; d.tribFails = d.tribFails || 0;
  d._pend = d._pend || {};
  d.constitution = d.constitution || null;
  d.tribBless = !!d.tribBless;
  d.seen = Object.assign({ roots: {}, treasures: {}, beasts: {}, encs: {}, tao: {} }, d.seen);
  d.taoMax = Math.max(1, Math.min(5, d.taoMax || 1)); d.taoKills = d.taoKills || 0; d.taoBoss = d.taoBoss || 0;
  d.breaks = d.breaks || 0; d.clicks = d.clicks || 0; d.forgeN = d.forgeN || 0;
  d.eggsGot = d.eggsGot || 0; d.encN = d.encN || 0; d.achieved = d.achieved || {};
  if (!d.root) d.root = 'jin';
  if (!validRoot(d.root)) throw new Error('存档灵根无效');
  d.root = rootIds(d.root);
  d.materials = Object.assign(Object.fromEntries(Object.keys(GX.MATERIALS).map(k => [k, 0])), d.materials);
  d.relics = Object.assign({ ren: 0, di: 0, tian: 0 }, d.relics);
  d.milestones = d.milestones || {};
  d.insight = d.insight ?? 0; d.realmFails = d.realmFails ?? 0;
  if ((d.v || 0) < 7 && d.realmIdx >= 1) {
    // 已修成的境界不补收材料，不将未经选择的旧角色限制在人道上限。
    d.foundation = 'legacy';
    for (const gate of GX.BREAKTHROUGHS.filter(g => g.to <= d.realmIdx)) {
      d.milestones[gate.to] = { name: gate.name, legacy: true };
      d.insight = Math.max(d.insight, gate.insight);
    }
  }
  d.foundation = d.foundation || null;
  d.ascended = !!d.ascended;
  if ((d.v || 0) < 8) {
    // 已解锁下一节点可证明前一节点曾获胜；妖主另据击杀记录补录。
    const stamp = d.lastTs || Date.now();
    d.seen.tao = d.seen.tao || {};
    for (let node = 1; node < d.taoMax; node++) d.seen.tao[node] ||= stamp;
    if (d.taoBoss > 0 || d.seen.tao['5']) {
      for (let node = 1; node <= 5; node++) d.seen.tao[node] ||= stamp;
    }
  }
  migrateSeek(d, d.v || 0);
  // Current saves may precede birth/first world tick. Preserve their lazy ledger;
  // old saves need a one-time conversion of unclassified historical life loss.
  if ((d.v || 0) < 10) initLife(d);
  // v11 writes inventory totals and tiers together. Only older saves may need
  // reconciliation; a current-version mismatch is corruption, not a migration.
  if ((d.v || 0) < 11) syncPillGrades(d);
  d.v = STATE_VERSION;
  return true;
}

