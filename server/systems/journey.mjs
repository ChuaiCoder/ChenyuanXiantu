import { addPills } from '../../shared/inventory.js';
import { GX, fmt } from '../../shared/data.js';
import * as st from '../../shared/state.js';
import { freshClock } from '../runtime-schema.mjs';
import { initLife } from '../../shared/life.js';

export const journeyActions = {
  markSeen(group, key, name) {
    if (!this.S.seen) this.S.seen = { roots: {}, treasures: {}, beasts: {}, encs: {}, tao: {} };
    if (this.S.seen[group][key]) return;
    this.S.seen[group][key] = Date.now();
    this.log(`📖 道果图鉴点亮：${name}（全产出 +0.2%）`, 'dim');
  },
  buyShop(id) {
    if (!this.beginOpen) return;
    const it = GX.SHOP.find(x => x.id === id);
    if (!it || this.S.daoFruit < it.cost) return;
    if (!it.repeat && this.shopBought[id]) return;
    this.S.daoFruit -= it.cost;
    if (!it.repeat) this.shopBought[id] = true;
    const p = this.S._pend;
    if (id === 'reroll') this.beginRerolls++;
    else if (id === 'provision') { p.provSpirit = (p.provSpirit || 0) + Math.ceil(2500 * Math.pow(1.2, this.S.times)); p.provCult = (p.provCult || 0) + Math.ceil(1000 * Math.pow(1.2, this.S.times)); }
    else if (id === 'pills') p.pills = (p.pills || 0) + 1;
    else if (id === 'shards') p.shards = (p.shards || 0) + 1;
    else if (id === 'egg') p.egg = (p.egg || 0) + 1;
    else if (id === 'prestige') p.prestige = (p.prestige || 0) + 1;
    else if (id === 'tribbless') p.tribbless = 1;
    else if (id === 'daoheart') p.daoheart = (p.daoheart || 0) + 1;
    else if (id === 'dharma') p.dharma = 1;
    else if (id === 'constitution') p.constitution = GX.CONSTITUTIONS[Math.random() * GX.CONSTITUTIONS.length | 0];
    this.log(`🏮 转世商店购入：${it.name}（道果 -${it.cost}），入世生效`, 'good');
    this.panel.data = this._beginData();
    return true;
  },
  applyShopPurchases() {
    const p = this.S._pend; if (!p) return;
    const msgs = [];
    if (p.reroll) { this.beginRerolls += p.reroll; msgs.push(`重抽 +${p.reroll} 次`); }
    if (p.provSpirit) { this.S.spirit += p.provSpirit; this.S.cult += p.provCult; msgs.push(`灵石 +${fmt(p.provSpirit)}、修为 +${fmt(p.provCult)}`); }
    if (p.pills) { addPills(this.S, 'dujie', p.pills); addPills(this.S, 'juli', 2 * p.pills); msgs.push('渡劫丹×1、聚灵丹×2'); }
    if (p.shards) { this.S.shards.fan += 10 * p.shards; msgs.push('凡品残片×10'); }
    if (p.egg) { this.S.eggs.xuan += p.egg; msgs.push('玄品灵兽蛋×1'); }
    if (p.prestige) { this.S.prestige += p.prestige; msgs.push(`道行 +${p.prestige}`); }
    if (p.tribbless) { this.S.tribBless = true; msgs.push('天劫庇佑（本世渡劫 +12%）'); }
    if (p.daoheart) { this.S.daoHeart = (this.S.daoHeart || 0) + p.daoheart * 5; msgs.push(`道心 +${p.daoheart * 5}`); }
    const grantWord = t => { t.words = t.words || {}; const avail = Object.keys(GX.REFINE_WORDS).filter(id => (t.words[id] || 0) < 3); const wid = avail.length ? avail[Math.random() * avail.length | 0] : null; if (wid) { t.words[wid] = (t.words[wid] || 0) + 1; return `预铭 ${GX.REFINE_WORDS[wid].name}·1`; } return '词条已满'; };
    if (p.word) { this.S.treasure = this.S.treasure || { q: 1, type: Object.keys(GX.TREASURE_TYPES)[0] }; msgs.push('本命法宝' + grantWord(this.S.treasure)); }
    if (p.dharma) { const type = Object.keys(GX.TREASURE_TYPES)[Math.random() * 3 | 0]; this.S.treasure = { q: 2, type, words: {} }; this.markSeen('treasures', '2_' + type, `灵品·${GX.TREASURE_TYPES[type].name}`); msgs.push(`先天法宝：灵品${GX.TREASURE_TYPES[type].name}，${grantWord(this.S.treasure)}`); }
    if (p.constitution) { this.S.constitution = p.constitution.id; msgs.push(`觉醒先天之体：${p.constitution.name}（${p.constitution.desc}）`); }
    this.S._pend = {};
    if (msgs.length) this.log('🏮 转世商店之物已交付：' + msgs.join('、'), 'good');
  },
  checkAchievements() {
    for (const a of GX.ACHIEVEMENTS) {
      if (this.S.achieved[a.id]) continue;
      if (a.check(this.S)) { this.S.achieved[a.id] = Date.now(); this.log(`🏮 成就达成：${a.name}（${a.desc}，${a.fx}）`, 'good'); }
    }
  },
  die(cause) {
    if (this.ended) return;
    if (this.battle?.quest) this.refundSeekBattle(this.battle);
    this.battle = null;
    this.ended = true;
    const gain = st.prestigeGain(this.S);
    this.log((cause === '坐化' ? `寿元耗尽，<b>${this.S.name}</b> 于洞府中坐化…` : `<b>${this.S.name}</b> ${cause}…`) + (gain > 0 ? `（道行 +${gain}）` : ''), 'bad');
    this.panel = { kind: 'end', data: { cause, gain } };
  },
  reincarnate(gain) {
    if (this.beginOpen || !Number.isFinite(gain) || gain < 0) return;
    for (const id of st.rootIds(this.S.root)) this.markSeen('roots', id, GX.ROOTS[id].name);
    this.shopBought = {};
    const t = this.S.times + 1;
    const fruit = this.S.daoFruit, seen = this.S.seen;
    const prestige = this.S.prestige, achieved = this.S.achieved, daoHeart = this.S.daoHeart;
    const lf = st.lifeFruit(this.S);
    if (lf > 0) this.log(`🍑 轮回之刻，一世道行凝成果实：道果 +${lf}`, 'good');
    // 转世前捕获可继承的积累；入世面板据此提供「传承」三选一。
    this.legacy = {
      gongfaBook: [...(this.S.gongfaBook || [])],
      bld: { ...this.S.bld },
      insight: this.S.insight || 0,
    };
    this.legacyChoice = null;
    this.S = st.freshState();
    this.S.prestige = prestige + gain; this.S.times = t; this.S.name = '无名道修';
    this.clock = freshClock();
    this.S.achieved = achieved; this.S.daoHeart = daoHeart;
    this.S.daoFruit = fruit + lf; this.S.seen = seen;
    this.ended = false;
    this.battle = null;
    this.pending = { herb: null, roam: null };
    this.suspended = [];
    this._enc = null; this._trib = null; this._secret = null;
    this.eventTimer = 0; this.encTimer = 0; this.furnTimer = 0; this.encounterDelay = 0;
    this.openBegin('again');
  },
  continueEnd() {
    if (!this.ended || this.panel?.kind !== 'end') return;
    this.reincarnate(this.panel.data.gain || 0);
    return true;
  },
  doPrestige() {
    if (!this.canAct()) return;
    if (this.S.med > 0 || this.S.seek.active || this.S.study || this.pending.herb || this.pending.roam || this.S.recovery > 0) return;
    const gain = st.prestigeGain(this.S);
    if (gain <= 0) { this.log(this.S.times < 1 ? '首世需修至道基上限或证道，方可主动转世' : '本世尚未筑基，暂无转世道行；需重新积累修行成果', 'dim'); return; }
    this.log(`☯️ 主动放下此世修为，凝练道行 <b>+${gain}</b>（全产出 +${gain * 3}%）`, 'good');
    this.reincarnate(gain);
    return true;
  },

  /* ---- 开局/转世界面 ---- */
  openBegin(kind) {
    this.beginOpen = true; this.beginMode = kind;
    this.beginPending = st.rollRoots(this.S, 1)[0];
    // 道行里程碑：每 10 点道行额外 +1 次开局重抽（最多 +3）。
    this.beginRerolls = 3 + st.legacyRerollBonus(this.S);
    if (kind === 'new') { this.legacy = null; this.legacyChoice = null; }
    this.panel = { kind: 'begin', data: this._beginData() };
  },
  _beginData() {
    const S = this.S, r = st.rootProfile(this.beginPending);
    return {
      mode: this.beginMode,
      sub: this.beginMode === 'new' ? '文字修仙 · 道在朝夕' : `第 ${S.times + 1} 世 · 道行 ${S.prestige} · 道果 ${S.daoFruit}`,
      root: { icon: r.icon, name: r.name, desc: `${r.type} · ${r.desc}` },
      rerolls: this.beginRerolls,
      fruit: S.daoFruit,
      shop: GX.SHOP.map(it => ({ ...it, sold: !it.repeat && !!this.shopBought[it.id] })),
      legacy: this.beginMode === 'new' ? null : st.legacyOptions(this.legacy),
      legacyChoice: this.legacyChoice,
    };
  },
  /* 入世传承：三选一，可再次点击取消；无可继承项时该项禁用。 */
  chooseLegacy(id) {
    if (!this.beginOpen) return;
    const opt = st.legacyOptions(this.legacy).find(o => o.id === id);
    if (!opt || opt.disabled) return;
    this.legacyChoice = this.legacyChoice === id ? null : id;
    this.panel.data = this._beginData();
    return true;
  },
  applyLegacy() {
    const legacy = this.legacy, choice = this.legacyChoice;
    if (!legacy || !choice) return null;
    const S = this.S;
    if (choice === 'gongfa') {
      const keep = (legacy.gongfaBook || []).slice(0, st.legacyKeep((legacy.gongfaBook || []).length));
      if (!keep.length) return null;
      S.gongfaBook = [...keep]; S.gongfaLv = 1 + S.gongfaBook.length;
      return `功法传承：保留 ${S.gongfaBook.length} 部功法，参悟自第 ${S.gongfaLv} 重起步`;
    }
    if (choice === 'cave') {
      let total = 0;
      for (const k of ['zhen', 'mine', 'beast', 'furn', 'forge']) {
        const n = st.legacyKeep(legacy.bld?.[k] || 0);
        if (n > 0) { S.bld[k] = (S.bld[k] || 0) + n; total += n; }
      }
      return total ? `洞府传承：保留 ${total} 级洞府建筑` : null;
    }
    if (choice === 'insight') {
      const n = st.legacyKeep(legacy.insight || 0);
      if (n <= 0) return null;
      S.insight = (S.insight || 0) + n;
      return `悟性传承：保留 ${n} 点悟道心得`;
    }
    return null;
  },
  rerollBegin() {
    if (!this.beginOpen || this.beginRerolls <= 0) return;
    this.beginRerolls--;
    this.beginPending = st.rollRoots(this.S, 1)[0];
    this.panel.data = this._beginData();
    return true;
  },
  commitBegin() {
    if (!this.beginOpen || !this.beginPending) return;
    this.S.root = st.rootIds(this.beginPending);
    this.applyShopPurchases();
    const legacyMsg = this.applyLegacy();
    this.S.life = st.lifeCap(this.S);
    initLife(this.S);
    const root = st.rootProfile(this.S.root);
    this.log(`☯️ 道心映根，觉醒 <b>${root.icon}${root.name}</b>：${root.desc}`, 'good');
    if (legacyMsg) this.log(`🧬 ${legacyMsg}`, 'good');
    this.legacy = null; this.legacyChoice = null;
    this.closeBegin();
    return true;
  },
  closeBegin() {
    this.beginOpen = false; this.panel = null;
  },

  /* 通用关面板 */
  closePanel() { this.panel = null; this._enc = null; this._trib = null; },
};
