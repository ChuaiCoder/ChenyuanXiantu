import { addPills } from '../../shared/inventory.js';
import { encounterOptions, secretOptions } from '../../shared/presentation.js';
import { GX, fmt, fmtTime } from '../../shared/data.js';
import * as st from '../../shared/state.js';
import { legacyRoot } from '../../shared/relic-state.js';
import { fixedEnemy } from '../../shared/combat.js';

export const encounterActions = {
  pickEncounter() {
    const S = this.S;
    const pool = GX.ENCOUNTERS.filter(e => S.realmIdx >= e.minRealm);
    const total = pool.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * total;
    for (const e of pool) { r -= e.weight; if (r <= 0) return e; }
    return pool[0];
  },
  openEncounter() {
    if (!this.canStartActivity()) return;
    const enc = this.pickEncounter();
    this.S.encN++;
    this.markSeen('encs', enc.id, enc.title);
    this._enc = { id: enc.id, title: enc.title, text: enc.text, opts: encounterOptions(this.S, enc.id).map(o => ({ ...o, disabled: false })) };
    this.panel = { kind: 'encounter', data: this._enc };
  },
  applyEncOption(optId) {
    if (!this.canAct() || this.panel?.kind !== 'encounter' || !this._enc?.opts.some(o => o.id === optId)) return;
    const S = this.S, enc = this._enc;
    if (enc.id === 'youshou' && optId === 'fight' || enc.id === 'tongmen' && optId === 'accept') {
      if (S.buffs.shock > 0) { this.log('重伤尚未恢复，请先回府调息或选择避让。', 'dim'); return; }
      this.closePanel();
      const enemy = { ...fixedEnemy({ ...S, combat: null }, 2), name: enc.id === 'tongmen' ? '同门道友' : '拦路妖兽' };
      if (!this.createBattle(enemy, { source: 'encounter' })) { this._enc = enc; this.panel = { kind: 'encounter', data: enc }; return; }
      this.log(`选择迎战${enemy.name}，观察意图后应对；败退依统一规则折寿。`, 'dim');
      return true;
    }
    let res = '';
    switch (enc.id + ':' + optId) {
      case 'laozhe:accept': { const k = ['juli', 'huichun', 'dujie', 'xuan'][Math.random() * 4 | 0]; addPills(S, k); res = `得 ${GX.PILLS[k].icon}${GX.PILLS[k].name} ×1`; break; }
      case 'laozhe:decline': { const gain = Math.ceil(st.cultPerClick(S) * 5); S.cult += gain; res = `心境平和，修为 +${fmt(gain)}`; break; }
      case 'youshou:retreat': S.spirit *= 0.95; res = '丢下部分灵石，狼狈脱身'; break;
      case 'heimi:buy_shards': { const c1 = st.merchantPrices(S).shards; if (S.spirit >= c1) { S.spirit -= c1; S.shards.fan += 5; res = '购得凡品残片 ×5'; } else res = '灵石不足，行商收起摊位'; break; }
      case 'heimi:buy_treasure': { const c2 = st.merchantPrices(S).treasure; if (S.spirit >= c2) { S.spirit -= c2; this.forgeTreasure(1, true); res = '购得一件凡品法宝'; } else res = '灵石不足，行商收起摊位'; break; }
      case 'heimi:leave': res = '你拱手离去，夜风拂面'; break;
      case 'tongmen:later': res = '你拱手让过，对方一笑而去'; break;
      case 'daoheart:listen': S.daoHeart = (S.daoHeart || 0) + 1; res = `聆听天音，道心愈发坚凝（道心 ${S.daoHeart}，全产出 +${Math.min(30, S.daoHeart * 2)}%）`; break;
      case 'daoheart:guard': { const v = Math.ceil(st.cultPerClick(S) * 20); S.cult += v; res = `守心静修，不为所动，修为 +${fmt(v)}`; break; }
      case 'mijing:deep': {
        const win = st.riskChance(S, 0.25, { daoScale: 0.02, cap: 0.55 }), r = Math.random();
        if (r < win) { addPills(S, 'dujie'); S.shards.xuan += 2; res = '秘境大赏：渡劫丹×1、玄品残片×2！'; }
        else if (r < win + 0.35) { S.buffs.shock = Math.max(S.buffs.shock, 10); res = '触发残窟禁制，轻伤退出，疗伤 10 秒'; }
        else res = '窟中空空如也，唯余尘埃'; break;
      }
      case 'mijing:ward': {
        const cost = Math.ceil(Math.max(200, st.mineRate(S) * 80));
        if (S.spirit < cost) { res = '灵石不足，护体灵光未成，只得退出'; break; }
        S.spirit -= cost;
        if (Math.random() < 0.45) { addPills(S, 'dujie'); S.shards.xuan += 2; res = `耗 ${fmt(cost)} 灵石护体，稳取秘境大赏：渡劫丹×1、玄品残片×2`; }
        else res = `耗 ${fmt(cost)} 灵石护体，窟中已空，然周身无恙`;
        break;
      }
      case 'mijing:seal': res = '你以灵力封住裂口，来日再探'; break;
      case 'xianmen:register': addPills(S, 'dujie'); addPills(S, 'juli', 2); res = '仙籍录名，赐渡劫丹×1、聚灵丹×2'; break;
      case 'xianmen:free': { const v = Math.ceil(st.cultPerClick(S) * 15); S.cult += v; res = `你不愿受仙籍所缚，虹桥自散，修为 +${fmt(v)}`; break; }
      case 'sanshi:answer': S.daoHeart = (S.daoHeart || 0) + 1; res = `三卷同亮，长卷徐徐收起（道心 ${S.daoHeart}，全产出 +${Math.min(30, S.daoHeart * 2)}%）`; break;
      case 'sanshi:practice': { const v = Math.ceil(st.cultPerClick(S) * 25); S.cult += v; res = `你闭目不答，三卷自燃为光，修为 +${fmt(v)}`; break; }
    }
    this.log(`📜 ${enc.title}：${res}`, res.includes('-') || res.includes('伤') ? 'bad' : 'good');
    this.closePanel();
    return true;
  },

  /* ============ 秘境（3 回合文字抉择 + 终局结算；期间 tick 冻结） ============ */
  openSecret() {
    if (!this.canStartActivity()) return;
    const s = this.currentSecret();
    if (!s) { this.log('山雾未开，尚无可探之秘境', 'dim'); return; }
    if (this.S.secretCd > 0) { this.log(`秘境灵机未复，尚需 ${fmtTime(this.S.secretCd)}`, 'dim'); return; }
    this.S.secretCd = GX.SECRET_CD;
    this._secret = { name: s.name, turn: 0 };
    this.drawSecretRound();
    return true;
  },
  currentSecret() {
    let cur = null;
    for (const s of GX.SECRETS) if (this.S.realmIdx >= s.minRealm) cur = s;
    return cur;
  },
  drawSecretRound() {
    const s = this.currentSecret();
    const pool = GX.SECRET_EVENTS.filter(e => this.S.realmIdx >= e.minRealm);
    const ev = pool[Math.random() * pool.length | 0];
    this._secret.turn++;
    this._secret.evId = ev.id;
    const opts = secretOptions(this.S, ev.id);
    opts.push({ id: 'exit', label: '就此退出', detail: '结算已得机缘' });
    this.panel = { kind: 'secret', data: { name: s.name, turn: this._secret.turn, text: ev.text, evId: this._secret.evId, opts } };
  },
  applySecretOption(optId) {
    if (this.ended || this.beginOpen || this.presence.offlineSince != null || !this._secret || this.panel?.kind !== 'secret' || !this.panel.data.opts.some(o => o.id === optId)) return;
    const S = this.S, s = this._secret, ev = GX.SECRET_EVENTS.find(e => e.id === s.evId);
    if (ev.id === 'beast' && optId === 'fight') {
      if (S.buffs.shock > 0) { this.log('重伤未愈，当前可以避让或退出秘境。', 'dim'); return; }
      const continuation = structuredClone(s);
      const panel = this.panel;
      this.panel = null; this._secret = null;
      if (!this.createBattle({ ...fixedEnemy({ ...S, combat: null }, 2), name: '秘境守兽' }, { source: 'secret', continuation })) { this._secret = s; this.panel = panel; return; }
      return true;
    }
    if (optId === 'exit') { this.log(`🏔️ ${s.name}：你收敛气息，退出秘境`, 'dim'); this.secretFinish(); return true; }
    let txt = '';
    switch (ev.id + ':' + optId) {
      case 'beast:retreat': S.spirit *= 0.95; txt = '丢下部分灵石，狼狈脱身'; break;
      case 'pill:take': {
        const win = st.riskChance(S, 0.25, { daoScale: 0.02, cap: 0.55 }), r = Math.random();
        if (r < win) { addPills(S, 'dujie'); S.shards.fan += 2; txt = '丹窟大赏：渡劫丹 ×1、残片 ×2'; }
        else if (r < win + 0.35) { S.buffs.shock = Math.max(S.buffs.shock, 10); txt = '触发丹窟禁制，轻伤退出，疗伤 10 秒'; }
        else txt = '窟中空空如也，丹早已被人取走'; break;
      }
      case 'pill:ward': {
        if (S.materials.essence < 2) { txt = '灵液不足，护窟法阵未成'; break; }
        S.materials.essence -= 2;
        if (Math.random() < 0.45) { addPills(S, 'dujie'); S.shards.fan += 2; txt = '耗灵液 ×2 护窟，稳取丹窟大赏：渡劫丹 ×1、残片 ×2'; }
        else txt = '耗灵液 ×2 护窟，窟中已空，然未受禁制所伤';
        break;
      }
      case 'pill:sit': { const v = Math.ceil(st.cultPerClick(S) * 20); S.cult += v; txt = `静坐参悟，修为 +${fmt(v)}`; break; }
      case 'flame:refine': if (Math.random() < 0.4) { S.daoHeart = (S.daoHeart || 0) + 1; txt = '鬼火入体，道心 +1，道心更明'; } else { S.buffs.shock = Math.max(S.buffs.shock, 15); txt = '鬼火灼心，重伤 15 秒'; } break;
      case 'flame:blow': { const v = Math.ceil(st.cultPerClick(S) * 5); S.cult += v; txt = `吹散鬼火，心境澄明，修为 +${fmt(v)}`; break; }
      case 'stele:study': { const v = Math.ceil(st.cultPerClick(S) * 30); S.cult += v; txt = `道碑真意忽明，修为 +${fmt(v)}`; break; }
      case 'stele:incense': { const n = Math.ceil(Math.max(30, st.mineRate(S) * 30, 20 * st.itemTier(S))); S.spirit += n; txt = `得一线机缘，灵石 +${fmt(n)}`; break; }
      case 'xianqi:absorb': { const v = Math.ceil(st.cultPerClick(S) * 40); S.cult += v; txt = `仙气入体，真元大涨，修为 +${fmt(v)}`; break; }
      case 'xianqi:gather': { const n = Math.ceil(st.mineRate(S) * 60); S.spirit += n; let t = `采得仙气凝结之灵石 +${fmt(n)}`; if (Math.random() < 0.25) { S.daoHeart = (S.daoHeart || 0) + 1; t += '，道心 +1'; } txt = t; break; }
      case 'luohai:condense': if (Math.random() < 0.35) { S.daoHeart = (S.daoHeart || 0) + 1; txt = '星光贯顶，大道一线洞明，道心 +1'; } else { S.buffs.shock = Math.max(S.buffs.shock, 15); txt = '星辉过烈，灼伤神识，重伤 15 秒'; } break;
      case 'luohai:ride': { const v = Math.ceil(st.cultPerClick(S) * 50); S.cult += v; txt = `御星光而行，过去未来皆一瞬，修为 +${fmt(v)}`; break; }
    }
    this.log(`🏔️ ${s.name} · ${this._secret.turn}/3：${txt}`, txt.includes('-') || txt.includes('伤') ? 'bad' : 'good');
    if (this.ended) return;
    this._secret.completed = (this._secret.completed || 0) + 1;
    this.secretNext();
    return true;
  },
  secretNext() {
    this.panel = null; this._enc = null; this._trib = null;
    if (this._secret.turn >= 3) { this.secretFinish(); return; }
    this.drawSecretRound();
  },
  secretFinish() {
    if (!this._secret) return;
    const S = this.S, base = Math.ceil(Math.max(60, st.mineRate(S) * 60) * (1 + this._secret.turn * 0.1));
    S.spirit += base;
    if (this._secret.completed >= 3) {
      S.materials.heaven++;
      if (legacyRoot(S)) S.materials.dao_page++;
      this.log(`三轮探秘完成，天灵晶 ×1${legacyRoot(S) ? '、问道残篇 ×1' : ''} 已入行囊`, 'good');
    }
    let txt = `秘境机缘落定：灵石 +${fmt(base)}`;
    if (Math.random() < 0.30) { S.daoHeart = (S.daoHeart || 0) + 1; txt += '，道心 +1'; }
    this.log('🏔️ ' + txt, 'good');
    this._secret = null; this.panel = null;
  },
};
