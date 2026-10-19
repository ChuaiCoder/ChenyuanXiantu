import { GX, fmt } from '../../shared/data.js';
import * as st from '../../shared/state.js';
import { legacyRoot } from '../../shared/relic-state.js';
import { randomUUID } from 'node:crypto';
import { COMBAT_VERSION, ROUND_SECONDS, SPELLS, MODES, STRATEGIES, COMBAT_ITEMS } from '../../shared/combat-data.js';
import { combatStats, ensureCombat, effectiveLoadout, availableSpells, chapterMax, chapterOf, artifactFor, carriedSupplies, battleScale } from '../../shared/combat.js';
import { freshStatus, planIntent, resolveRound, actionInfo } from '../../shared/combat-simulation.js';
import { damageLife, initLife } from '../../shared/life.js';
import { bestPillTier, pillPotency, takePill } from '../../shared/inventory.js';

export const battleActions = {
  taoStart(n) {
    if (!this.canStartActivity() || this.S.taoCd > 0) return;
    if (!Number.isInteger(n) || n < 1 || n > GX.TAO_MAP.length || n > chapterMax(this.S)) return;
    const e = st.taoEnemy(this.S, n);
    if (!this.createBattle(e, { node: n, source: 'map' })) return;
    this.log(`⚔️ 你踏入 <b>${GX.TAO_MAP[n - 1].name}</b>，${e.name} 拦路！（自动作战，可随时介入）`, 'good');
    return true;
  },
  createBattle(enemy, options = {}) {
    if (!this.canStartActivity() || this.S.buffs.shock > 0) return false;
    const S = this.S, c = ensureCombat(S), stats = combatStats(S);
    if (c.hp <= 0) return false;
    initLife(S);
    const petKind = c.pet && S.beasts[c.pet] > 0 ? c.pet : Object.keys(S.beasts).find(key => S.beasts[key] > 0);
    this.battle = { version: COMBAT_VERSION, id: randomUUID(), node: 1, source: 'map', ...options,
      chapter: chapterOf(S), e: { armor: 0, speed: 100, scale: battleScale(0, 6), ...enemy }, eHp: enemy.hp, eMax: enemy.hp,
      pPh: c.hp, pMax: stats.hp, pMana: c.mana, stats, roots: st.rootIds(S.root), loadout: effectiveLoadout(S),
      artifact: artifactFor(S), pet: petKind && !(c.petRecovery > 0) ? { kind: petKind, stars: S.beasts[petKind] } : null,
      petHp: Math.floor(stats.hp * .6), petMax: Math.floor(stats.hp * .6),
      supplies: carriedSupplies(S), medicine: c.medicine, symbolReady: 0, cooldowns: {},
      supplyTiers: Object.fromEntries(COMBAT_ITEMS.map(id => [id, bestPillTier(S, id)])),
      potency: Object.fromEntries(COMBAT_ITEMS.map(id => [id, pillPotency(S, id)])),
      status: { player: freshStatus(), enemy: freshStatus() }, strategy: c.strategy, mode: c.mode,
      autoPills: c.autoPills, combos: c.combos || false, turn: 0, pAuto: c.mode === 'manual' ? 0 : 1, acc: 0,
      rng: Math.floor(Math.random() * 0xffffffff) || 1, lossCap: st.lifeCap(S), queued: null };
    planIntent(this.battle);
    return true;
  },
  taoAct(k) {
    if (!this.canAct('battle')) return;
    if (this.battle.version === COMBAT_VERSION) {
      if (!actionInfo(this.battle, k).ok) return;
      this.battle.queued = k; this.battle.waiting = false; this.battle.paused = false;
      if (this.battle.acc >= ROUND_SECONDS - 1e-9) this.taoAutoTick(0);
      return true;
    }
    if (!['strike', 'treasure', 'beast', 'guard', 'pill_juli', 'pill_xuan', 'pill_dujie', 'pill_huichun'].includes(k)) return;
    if (k === 'treasure' && !this.S.treasure) return;
    if (k === 'beast' && st.beastStars(this.S) <= 0) return;
    if (k.startsWith('pill_') && !(this.S.pills[k.slice(5)] > 0)) return;
    this.battle.queued = k;
    this.battle.waiting = false;
    if (this.battle.acc >= ROUND_SECONDS - 1e-9) this.taoAutoTick(0);
    return true;
  },
  resolveLegacyTurn(k) {
    if (!this.canAct('battle')) return;
    const b = this.battle, m = b.quest ? { name: '寻物试炼' } : GX.TAO_MAP[b.node - 1], en = b.e.name, S = this.S;
    if (k.startsWith('pill_')) { const pk = k.slice(5); if (S.pills[pk] <= 0) { this.log('无此丹药可服', 'dim'); return; } takePill(S, pk); }
    b.turn++;
    let pTxt = '', pDmg = 0;
    if (k === 'strike' || k === 'treasure' || k === 'beast' || k === 'pill_juli') {
      pDmg = st.cultPerClick(S) * (1 + st.beastStars(S) * 0.06);
      if (k === 'treasure') pDmg *= 2;
      if (k === 'beast') pDmg *= 1.5;
      if (k === 'pill_juli') pDmg *= 4;
      if (b.xuan > 0) pDmg *= 1.3;
      pDmg = Math.ceil(pDmg * (0.85 + Math.random() * 0.3));
      b.eHp = Math.max(0, b.eHp - pDmg);
      pTxt = `${k === 'treasure' ? '你催动本命法宝，法光荡出' : k === 'beast' ? '灵兽随你扑出' : k === 'pill_juli' ? '聚灵丹炸开，灵气贯体一击' : '你出手击落'} ${en} -${fmt(pDmg)}`;
    } else if (k === 'guard') { b.guard = true; pTxt = '你沉气守御（下次受创 -60%）'; }
    else if (k === 'pill_xuan') { b.xuan = 5; pTxt = '玄丹护体，五回合内攻势 +30%'; }
    else if (k === 'pill_dujie') { b.dujie = 5; pTxt = '渡劫丹凝罡，五回合内减伤 +25%'; }
    else if (k === 'pill_huichun') { const v = Math.ceil(b.pMax * 0.5); b.pPh = Math.min(b.pMax, b.pPh + v); pTxt = `回春丹入体，气血 +${fmt(v)}`; }
    if (b.eHp <= 0) {
      this.log(`⚔️ ${m.name} · 回合 ${b.turn}：${pTxt}，敌人已败。`, 'good');
      this.taoFinish(true); return;
    }
    let ed = Math.ceil(b.e.atk * (0.85 + Math.random() * 0.3));
    ed = Math.ceil(ed * (1 - st.taoDefPct(S)));
    const g = b.guard;
    if (g) { ed = Math.ceil(ed * 0.4); b.guard = false; }
    if (b.dujie > 0) ed = Math.ceil(ed * 0.75);
    b.pPh = Math.max(0, b.pPh - ed);
    if (b.xuan > 0) b.xuan--;
    if (b.dujie > 0) b.dujie--;
    this.log(`⚔️ ${m.name} · ${en}（回合 ${b.turn}）：${pTxt} → ${en} 反扑 你 -${fmt(ed)}${g ? '（守御）' : ''}`, pDmg > 0 ? 'good' : 'dim');
    if (b.eHp <= 0) { this.taoFinish(true); return; }
    if (b.pPh <= 0) { this.taoFinish(false); return; }
  },
  taoAutoTick(dt) {
    if (!this.canAct('battle')) return;
    this.battle.acc += dt;
    if (this.battle.acc < ROUND_SECONDS - 1e-9) return;
    if (!this.battle.queued && !this.battle.pAuto) { this.battle.acc = ROUND_SECONDS; this.battle.waiting = true; return; }
    const action = this.battle.queued || 'strike';
    const queued = this.battle.queued;
    this.battle.queued = null; this.battle.waiting = false; this.battle.acc = 0;
    if (this.battle.version === COMBAT_VERSION) {
      const result = resolveRound(this.battle, queued);
      this.battle = result.battle;
      for (const item of result.consumed) takePill(this.S, item, this.battle.supplyTiers[item]);
      this.log(`⚔️ 回合 ${this.battle.turn}：${result.events.join(' ')}`, 'dim');
      if (result.outcome === 'win' || result.outcome === 'loss') this.taoFinish(result.outcome === 'win');
      else if (result.outcome) { this.log(result.outcome === 'draw' ? '战局胶着，安全脱离，未完成目标。' : '借遁符脱离战场。', 'dim'); this.taoFlee(); }
    } else this.resolveLegacyTurn(action);
  },
  taoToggle() {
    if (!this.canAct('battle')) return;
    if (this.battle.version === COMBAT_VERSION) return this.setBattleMode(this.battle.mode === 'manual' ? 'auto' : 'manual');
    this.battle.pAuto = this.battle.pAuto ? 0 : 1;
    if (this.battle.pAuto) { this.battle.waiting = false; this.taoAutoTick(0); }
    return true;
  },
  taoFlee() {
    if (!this.canAct('battle')) return;
    this.storeBattleResources(false);
    const n = this.battle.node;
    if (this.battle.quest) this.refundSeekBattle(this.battle);
    const quest = this.battle.quest; this.battle = null;
    this.S.taoCd = 30;
    this.log(`你敛息退走，此战未定（${quest ? '寻物进度保留，封存材料归还' : GX.TAO_MAP[n - 1].name}）`, 'dim');
    return true;
  },
  taoFinish(win) {
    if (!this.battle) return;
    this.storeBattleResources(!win);
    const b = this.battle; this.battle = null;
    if (b.source === 'encounter' || b.source === 'secret') {
      this.S.taoCd = 30;
      if (!win) { this.S.buffs.shock = Math.max(this.S.buffs.shock, 60); this.loseBattleLife(b.lossCap); this._secret = null; return; }
      this.S.spirit += b.e.spirit || 0; this.S.shards.fan++;
      this.log(`击败${b.e.name}，灵石 +${fmt(b.e.spirit || 0)}、凡品残片 ×1。`, 'good');
      if (b.source === 'secret') { this._secret = b.continuation; this._secret.completed = (this._secret.completed || 0) + 1; this.secretNext(); }
      return;
    }
    if (b.quest) { this.finishSeekBattle(b, win); if (!win) this.loseBattleLife(b.lossCap); return; }
    const m = GX.TAO_MAP[b.node - 1], e = b.e, S = this.S;
    if (win) {
      S.spirit += e.spirit; S.cult += e.cult;
      S.materials.earth++;
      if (b.node === 5) S.materials.heaven++;
      this.log(`讨伐灵材：地脉精华 ×1${b.node === 5 ? '、天灵晶 ×1' : ''}`, 'good');
      S.shards[e.shardKey] += e.shardN;
      if (S.taoMax < 5 && b.node >= S.taoMax) S.taoMax++;
      if (b.version === COMBAT_VERSION) S.combat.maps[b.chapter] = Math.min(5, Math.max(S.combat.maps[b.chapter] || 1, b.node + 1));
      S.taoKills++;
      this.markSeen('tao', String(b.node), m.beast);
      for (const [id, item] of Object.entries(GX.MATERIALS)) if (item.node === b.node && legacyRoot(S)) {
        S.materials[id]++;
        this.log(`山川遗泽：${item.name} ×1（筑基之物专属灵材）`, 'good');
      }
      if (b.node === 5) S.taoBoss++;
      this.log(`⚔️ <b>${e.name}</b> 败：灵石 +${fmt(e.spirit)}、修为 +${fmt(e.cult)}、${e.shardKey === 'ling' ? '灵品' : '凡品'}残片 ×${e.shardN}${S.taoMax < 5 ? ` —— <b>${GX.TAO_MAP[S.taoMax - 1].name}</b> 现世` : ''}`, 'good');
    } else {
      const loss = Math.min(S.cult, Math.ceil(st.cultPerClick(S) * (10 + 10 * b.node)));
      S.cult = Math.max(0, S.cult - loss);
      S.buffs.shock = Math.max(S.buffs.shock, 60);
      this.log(`💥 不敌 ${e.name}，重伤退走：修为 -${fmt(loss)}，回府调息 60 秒`, 'bad');
    }
    S.taoCd = 30;
    if (!win) this.loseBattleLife(b.lossCap);
  },

  storeBattleResources(defeated) {
    const b = this.battle;
    if (b?.version !== COMBAT_VERSION) return;
    const c = ensureCombat(this.S);
    c.hp = defeated ? Math.max(1, Math.floor(b.pMax * .1)) : b.pPh;
    c.mana = b.pMana; c.medicine = b.medicine;
    if (b.pet && b.petHp <= 0) c.petRecovery = 120;
  },
  setBattleMode(mode) {
    if (!Object.hasOwn(MODES, mode) || !this.canAct(this.battle ? 'battle' : 'manage')) return;
    if (this.S.combat?.mode === mode && (!this.battle || this.battle.mode === mode)) return { ok: true, changed: false };
    ensureCombat(this.S).mode = mode;
    if (this.battle?.version === COMBAT_VERSION) {
      this.battle.mode = mode; this.battle.pAuto = mode === 'manual' ? 0 : 1;
      planIntent(this.battle);
    }
    return true;
  },
  setStrategy(strategy) {
    if (!Object.hasOwn(STRATEGIES, strategy) || !this.canAct(this.battle ? 'battle' : 'manage')) return;
    if (this.S.combat?.strategy === strategy && (!this.battle || this.battle.strategy === strategy)) return { ok: true, changed: false };
    ensureCombat(this.S).strategy = strategy;
    if (this.battle?.version === COMBAT_VERSION) this.battle.strategy = strategy;
    return true;
  },
  setLoadout(value) {
    if (!this.canStartActivity()) return;
    const [slot, id] = value.split('_');
    if (!['0', '1', '2'].includes(slot) || !availableSpells(this.S).includes(id)) return;
    const loadout = effectiveLoadout(this.S), n = Number(slot);
    if (n >= loadout.length) return;
    if (loadout[n] === id) return { ok: true, changed: false };
    const other = loadout.indexOf(id);
    if (other >= 0) [loadout[n], loadout[other]] = [loadout[other], loadout[n]];
    else loadout[n] = id;
    ensureCombat(this.S).loadout = loadout;
    return true;
  },
  setChapter(value) {
    const chapter = Number(value);
    if (!this.canStartActivity() || !Number.isInteger(chapter) || chapter < 0 || chapter > this.S.realmIdx) return;
    if (chapterOf(this.S) === chapter) return { ok: true, changed: false };
    ensureCombat(this.S).chapter = chapter;
    return true;
  },
  setCombatOption(value) {
    if (value === 'autopills') value = 'autoPills';
    if (!this.canAct(this.battle ? 'battle' : 'manage') || !['autoPills', 'combos'].includes(value)) return;
    const c = ensureCombat(this.S); c[value] = !c[value];
    if (this.battle?.version === COMBAT_VERSION) this.battle[value] = c[value];
    return true;
  },
  selectPet(kind) {
    if (!this.canStartActivity() || !(this.S.beasts[kind] > 0)) return;
    if (this.S.combat?.pet === kind) return { ok: true, changed: false };
    ensureCombat(this.S).pet = kind;
    return true;
  },
  studySpell(id) {
    if (!this.canStartActivity()) return;
    const skill = SPELLS[id], S = this.S;
    if (!skill || !id.endsWith('2') || !st.rootIds(S.root).includes(skill.root) || S.realmIdx === 0 && S.layer < 4) return;
    if (S.combat?.learned.includes(id) || S.spirit < 60 || S.materials.essence < 2) return;
    S.spirit -= 60; S.materials.essence -= 2;
    S.study = { id, remaining: 60 };
    this.log(`参悟${skill.name}，需 60 秒；已封存灵石 60、灵液 2。`, 'good');
    return true;
  },
  startRecovery() {
    if (!this.canStartActivity()) return;
    ensureCombat(this.S); this.S.recovery = 60;
    this.log('回府调息 60 秒，恢复气血、真元与药力承受；自然岁月照常流逝。', 'dim');
    return true;
  },

  loseBattleLife(cap) {
    if (this.ended) return;
    const loss = damageLife(this.S, cap);
    this.log(this.S.life > 0 ? `💥 战败伤及本源，折寿 ${loss} 年，余寿 ${Math.floor(this.S.life)} 年。` : '💥 战败伤及本源，余寿耗尽。', 'bad');
    if (this.S.life === 0) this.die('战败身陨');
  },
};
