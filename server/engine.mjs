import { journeyActions } from './systems/journey.mjs';
import { activityActions, migrateActivities } from './systems/activity.mjs';
import { activityView } from '../shared/activity.js';
import { ensureCombat } from '../shared/combat.js';
import { SPELLS } from '../shared/combat-data.js';
import { ageLife, validateLife } from '../shared/life.js';
import { validatePillGrades, addPills } from '../shared/inventory.js';
import { validateCombatState } from './combat-validation.mjs';
import { battleActions } from './systems/battle.mjs';
import { encounterActions } from './systems/encounters.mjs';
import { progressionActions } from './systems/progression.mjs';
import { economyActions } from './systems/economy.mjs';
/* ============ 游戏引擎：状态权威 + tick + 操作分派（服务端/无头测试共用） ============
   框架无关的类。持有 S（单一状态源），跑 tick，把客户端操作分派为对 S 的写入，
   并通过 frame() 产出可序列化状态帧（S + panel + battle + pending + ended + logs）。
   客户端只读 S、用 shared/state.js 复算显示派生值（与服务端同源，保证一致）。 */
import { GX, fmt } from '../shared/data.js';
import * as st from '../shared/state.js';
import { validateSeek } from '../shared/relic-state.js';
import { seekActions, findStep, seekPanelData } from './seek.mjs';
import { stepInfo } from '../shared/relic-state.js';

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
import { freshClock } from './runtime-schema.mjs';
const RUNTIME_KEYS = ['battle', 'panel', 'pending', 'ended', 'logId', 'logs', 'shopBought',
  'beginOpen', 'beginPending', 'beginRerolls', 'beginMode', '_enc', '_trib', '_secret',
  'tickN', 'clock', 'eventTimer', 'encTimer', 'furnTimer', 'encounterDelay', 'presence', 'suspended',
  'combo', 'legacy', 'legacyChoice'];

export class Engine {
  constructor() {
    this.S = st.freshState();
    this.battle = null;
    this.panel = null;           // {kind:'begin'|'encounter'|'trib'|'secret'|'end', ...}
    this.pending = { herb: null, roam: null };
    this.ended = false;
    this.logId = 0;
    this.logs = [];
    this.shopBought = {};
    this.beginOpen = false; this.beginPending = null; this.beginRerolls = 0; this.beginMode = 'new';
    this._enc = null; this._trib = null; this._secret = null; // 面板载荷
    this.tickN = 0; this.eventTimer = 0; this.encTimer = 0; this.furnTimer = 0;
    this.clock = freshClock();
    this.encounterDelay = 0;
    this.presence = { offlineSince: null };
    this.suspended = [];
    this.combo = { n: 0, at: 0, hit: false };  // 修炼连击（窗口内累积）；hit 记录上次是否暴击
    this.legacy = null;                        // 上一世可继承的积累（转世时捕获）
    this.legacyChoice = null;                  // 本世选择的传承项
  }

  /* ---- 日志 ---- */
  log(text, cls) {
    const entry = { id: ++this.logId, text, cls: cls || '' };
    this.logs.push(entry);
    if (this.logs.length > 80) this.logs.shift();
    return entry;
  }

  /* ---- 帧：可序列化状态（客户端据此渲染） ---- */
  frame() {
    // tick 次数取决于循环频率，不能代表修行时间。微小容差避免整日边界的浮点误差。
    const days = Math.floor(this.clock.elapsed * GX.LIFE_PER_SEC * GX.DAYS_PER_YEAR + 1e-7);
    return {
      S: this.S,
      panel: this.beginOpen ? { kind: 'begin', data: this._beginData() } : this.panel?.kind === 'realm' ? { kind: 'realm', data: this.realmPanelData() } : this.panel,
      battle: this.battle,
      pending: { herb: this.pending.herb?.remaining ?? null, roam: this.pending.roam?.remaining ?? null },
      ended: this.ended,
      logId: this.logId,
      logs: this.logs,
      dayN: days + 1,
      calendar: { years: Math.floor(days / GX.DAYS_PER_YEAR), days: days % GX.DAYS_PER_YEAR, continued: this.clock.continued },
      rules: { secondsPerYear: GX.SECONDS_PER_YEAR, battleLifeLoss: GX.BATTLE_LIFE_LOSS },
      activity: activityView(this),
      suspended: this.suspended,
      combo: this.combo,
    };
  }

  /* ============ 行动（客户端操作 → 对 S 的写入） ============ */
  advanceWorld(dt) {
    if (!Number.isFinite(dt) || dt <= 0 || this.ended || this.beginOpen || ['secret','seek'].includes(this.panel?.kind)) return;
    if (this.S.life <= 0) { this.die('坐化'); return; }
    this.tickN++;
    const S = this.S;
    // 只累计角色实际存活、世界未暂停的时间，坐化当次不多计余下时长。
    this.clock.elapsed += Math.min(dt, S.life / GX.LIFE_PER_SEC);
    const speed = (S.buffs.tide > 0 ? 2 : 1) * (S.buffs.shock > 0 ? 0.5 : 1);
    const dz = st.zhenRate(S) * dt * speed, dm = st.mineRate(S) * dt * speed;
    if (dz > 0) S.cult += dz;
    if (dm > 0) S.spirit += dm;
    const alt = st.altarRate(S);
    if (alt > 0 && S.altarEnabled !== false && S.med <= 0 && S.buffs.shock <= 0) {
      const burn = Math.min(S.spirit, alt * dt);
      if (burn > 0) { S.spirit -= burn; S.cult += burn * speed; }
    }
    if (S.med > 0) {
      S.med = Math.max(0, S.med - dt);
      S.cult += st.cultPerClick(S) * GX.MED_RATE * dt * speed;
      if (S.med === 0) { S.insight++; S.medCd = GX.MED_CD; this.log('🧘 闭关功成，悟道心得 +1。调息 60 秒后方可再入定。', 'good'); }
    }
    if (S.medCd > 0) S.medCd = Math.max(0, S.medCd - dt);
    if (S.study) {
      S.study.remaining = Math.max(0, S.study.remaining - dt);
      if (!S.study.remaining) {
        ensureCombat(S).learned.push(S.study.id);
        this.log(`术法参悟完成：${SPELLS[S.study.id].name}`, 'good');
        S.study = null;
      }
    }
    if (S.recovery > 0) {
      const c = ensureCombat(S);
      c.hp = Math.min(c.maxHp, c.hp + c.maxHp * .02 * dt);
      c.mana = Math.min(100, c.mana + 4 * dt);
      c.petRecovery = Math.max(0, (c.petRecovery || 0) - dt);
      S.recovery = Math.max(0, S.recovery - dt);
      if (!S.recovery) { c.medicine = 0; this.log('调息完成，气血真元恢复，药力承受已重置。', 'good'); }
    }
    ageLife(S, dt);
    if (S.life <= 0) { S.life = 0; this.die('坐化'); return; }
    this.seekTick(dt);
    if (S.buffs.tide > 0) S.buffs.tide -= dt;
    if (S.buffs.shock > 0) S.buffs.shock -= dt;
    if (S.secretCd > 0) S.secretCd = Math.max(0, S.secretCd - dt);
    if (S.taoCd > 0) S.taoCd = Math.max(0, S.taoCd - dt);
    this.taoAutoTick(dt);
    if (this.ended) return;
    if (S.bld.furn > 0) {
      this.furnTimer += dt;
      if (this.furnTimer >= GX.FURN_EVERY) { this.furnTimer -= GX.FURN_EVERY; if (S.spirit >= 5) { S.spirit -= 5; addPills(S, 'juli'); this.log('丹房自动炼出一粒聚灵丹', 'good'); } }
    }
    for (const task of Object.values(this.pending)) if (task) task.remaining = Math.max(0, task.remaining - dt);
    if (this.pending.herb && this.pending.herb.remaining <= 0) {
      this.pending.herb = null;
      this.gatherMaterials('herb');
      const stt = S.life / st.lifeCap(S);
      const spirit = Math.ceil(Math.max(20, st.mineRate(S) * 20) * (0.7 + Math.random() * 0.6));
      let txt = `采药归来，得灵石 <b>${fmt(spirit)}</b>`;
      const roll = Math.random();
      if (stt < 0.5 && roll < 0.25) { const p = GX.PILLS[Math.random() < 0.5 ? 'juli' : 'huichun']; addPills(S, p.name === '聚灵丹' ? 'juli' : 'huichun'); txt += `，偶得 <b>${p.icon}${p.name}</b> 一枚`; }
      else if (roll < 0.12) { S.cult += Math.ceil(st.cultPerClick(S) * 8); txt += `，悟得一丝灵气（修为+${fmt(st.cultPerClick(S) * 8)}）`; }
      S.spirit += spirit; this.log(txt, 'good');
    }
    if (this.pending.roam && this.pending.roam.remaining <= 0) {
      this.pending.roam = null;
      this.gatherMaterials('roam'); // 胜负只影响旧有奖励，采集的破境材料必定带回。
    }
    this.eventTimer += dt;
    if (this.encounterDelay > 0) {
      this.encounterDelay = Math.max(0, this.encounterDelay - dt);
      if (this.encounterDelay === 0) this.openEncounter();
    }
    if (this.eventTimer >= GX.EVENT_EVERY && this.canStartActivity()) { this.eventTimer = 0; this.randomEvent(); }
    if (this.tickN % 15 === 0) this.checkAchievements();
    this.encTimer += dt;
    if (this.encTimer >= GX.ENC_EVERY && !this.panel) { this.encTimer = 0; this.openEncounter(); }
  }
  randomEvent() {
    const S = this.S, stt = S.life / st.lifeCap(S), roll = Math.random();
    if (S.buffs.tide <= 0 && roll < 0.12) { S.buffs.tide = 45; this.log('⚡ 天地灵气潮汐！45 秒内所有产出 ×2', 'good'); }
    else if (roll < 0.22) { const spirit = Math.ceil(Math.max(15, st.mineRate(S) * 15) * (1 + Math.random())); S.spirit += spirit; this.log(`🎲 山风送来一线机缘，拾得灵石 ${fmt(spirit)}`, 'good'); }
    else if (stt > 0.5 && roll < 0.32) { const gain = Math.ceil(st.cultPerClick(S) * 5); S.cult += gain; this.log(`🍵 偶遇前辈讲道，修为 +${fmt(gain)}`, 'good'); }
    else if (S.buffs.shock <= 0 && stt > 0.4 && roll < 0.42) { const dmg = Math.ceil(st.cultPerClick(S) * 10); S.cult = Math.max(0, S.cult - dmg); S.buffs.shock = 15; this.log(`🐺 妖兽夜袭洞府，修为受损 ${fmt(dmg)}，疗伤 15 秒`, 'bad'); }
    else if (roll < 0.50) this.log('🌫️ 云雾弥漫，道途寂寂，暂无奇遇', 'dim');
  }

  /* 离线收益（cap 4h，效率 50%，仅自动产出） */
  serialize() {
    const runtime = Object.fromEntries(RUNTIME_KEYS.map(key => [key, this[key]]));
    return JSON.parse(JSON.stringify({ saveVersion: 1, S: this.S, runtime }));
  }
  hydrate(raw) {
    if (!isRecord(raw)) throw new Error('存档必须是对象');
    const snapshot = JSON.parse(JSON.stringify(raw));
    const full = Object.hasOwn(snapshot, 'saveVersion');
    if (full && (snapshot.saveVersion !== 1 || !isRecord(snapshot.S) || !isRecord(snapshot.runtime))) throw new Error('不支持的存档格式');
    const next = new Engine();
    const savedState = full ? snapshot.S : snapshot;
    if (!Object.hasOwn(savedState, 'realmIdx') || !Object.hasOwn(savedState, 'cult') || savedState.v > st.STATE_VERSION) throw new Error('存档状态缺失或版本过新');
    next.S = Object.assign(st.freshState(), savedState);
    next.S.v = savedState.v || 0;
    const S = next.S;
    if (!Number.isInteger(S.realmIdx) || !GX.REALMS[S.realmIdx] || !Number.isInteger(S.layer) || S.layer < 0 || S.layer > GX.REALMS[S.realmIdx].layers) throw new Error('存档境界无效');
    for (const key of ['cult', 'spirit', 'life', 'prestige', 'daoHeart', 'daoFruit']) if (!Number.isFinite(S[key]) || S[key] < 0) throw new Error(`存档数值无效：${key}`);
    if (S.v >= 10) validatePillGrades(S, S.v >= 11);
    st.migrate(S);
    validateLife(S);
    validatePillGrades(S, true);
    validateSeek(S);
    if (S.foundation !== null && S.foundation !== 'legacy' && !Object.hasOwn(GX.FOUNDATIONS, S.foundation)) throw new Error('存档道基无效');
    for (const key of ['insight', 'realmFails']) if (!Number.isSafeInteger(S[key]) || S[key] < 0) throw new Error('存档破境数值无效');
    for (const group of ['materials', 'pills', 'relics']) for (const n of Object.values(S[group])) if (!Number.isSafeInteger(n) || n < 0) throw new Error('存档物品数量无效');
    if (!isRecord(S.milestones)) throw new Error('存档道途记录无效');
    if (full) {
      for (const key of RUNTIME_KEYS) if (Object.hasOwn(snapshot.runtime, key)) next[key] = snapshot.runtime[key];
      if (!isRecord(next.pending) || !Array.isArray(next.logs) || !isRecord(next.shopBought)) throw new Error('存档运行状态无效');
      for (const key of ['herb', 'roam']) {
        const task = next.pending[key];
        if (task != null && (!isRecord(task) || !Number.isFinite(task.remaining) || task.remaining < 0)) throw new Error('存档行动计时无效');
      }
      if (next.beginOpen) {
        if (!st.validRoot(next.beginPending) || !Number.isInteger(next.beginRerolls) || next.beginRerolls < 0) throw new Error('存档开局状态无效');
        next.beginPending = st.rootIds(next.beginPending);
        next.panel = { kind: 'begin', data: next._beginData() };
      }
      if (next.ended && next.panel?.kind !== 'end') throw new Error('存档终局状态无效');
      if (next.panel?.kind === 'end' && !next.ended) throw new Error('存档终局标记无效');
      if (next.panel?.kind === 'trib' && !isRecord(next._trib)) throw new Error('存档天劫状态无效');
      if (next.panel?.kind === 'encounter' && !isRecord(next._enc)) throw new Error('存档奇遇状态无效');
      if (next.panel?.kind === 'secret' && !isRecord(next._secret)) throw new Error('存档秘境状态无效');
      if (next.panel?.kind === 'seek') {
        const step = findStep(S, next.panel.data?.stepId);
        if (!step?.puzzle || !stepInfo(S, step).ok || next.battle || next.ended || next.beginOpen) throw new Error('存档寻物现场无效');
        next.panel.data = seekPanelData(step);
      }
      if (S.seek.active && (next.battle || ['seek','secret','begin'].includes(next.panel?.kind))) throw new Error('存档寻物行动冲突');
      if (next.battle?.quest) {
        const step = findStep(S, next.battle.quest);
        if (!step?.fight || S.seek.done[step.id] || S.realmIdx !== 0 || S.seek.active || JSON.stringify(next.battle.reserved) !== JSON.stringify(step.fight.cost)) throw new Error('存档寻物战斗无效');
        if (S.med > 0 || ['seek','secret','begin'].includes(next.panel?.kind) || stepInfo(S, step, true).requirements.some(r => !r.group && r.have < r.need)) throw new Error('存档寻物战斗前置无效');
        const b = next.battle;
        if (b.eMax !== step.fight.hp || b.e?.atk !== step.fight.atk || !Number.isFinite(b.eHp) || b.eHp <= 0 || b.eHp > b.eMax || !Number.isFinite(b.pPh) || b.pPh <= 0 || !Number.isFinite(b.pMax) || b.pPh > b.pMax) throw new Error('存档寻物战斗数值无效');
      }
      if (next.panel?.kind === 'realm') {
        if (next.panel.data?.realmIdx !== S.realmIdx) throw new Error('存档破境面板无效');
        next.panel.data = next.realmPanelData();
      }
    } else if (Object.keys(S._pend).length) {
      // 旧档未保存开局状态；有待领商品时恢复商店，避免直接跳过选择。
      next.openBegin(S.times ? 'again' : 'new');
      for (const item of GX.SHOP) if (!item.repeat && S._pend[item.id]) next.shopBought[item.id] = true;
    }
    validateCombatState(S, next.battle);
    if (!isRecord(next.presence) || next.presence.offlineSince != null && (!Number.isFinite(next.presence.offlineSince) || next.presence.offlineSince < 0)) throw new Error('存档离线起点无效');
    for (const key of ['cultRate', 'spiritRate']) if (next.presence[key] != null && (!Number.isFinite(next.presence[key]) || next.presence[key] < 0)) throw new Error('存档离线产率无效');
    if (!Array.isArray(next.suspended) || next.suspended.length > 3 || next.suspended.some(t => !t || !['herb', 'roam', 'med'].includes(t.kind) || !Number.isFinite(t.remaining) || t.remaining < 0)
      || new Set(next.suspended.map(t => t.kind)).size !== next.suspended.length) throw new Error('存档挂起活动无效');
    if (!isRecord(next.combo) || !Number.isSafeInteger(next.combo.n) || next.combo.n < 0 || next.combo.n > GX.COMBO.max
      || !Number.isFinite(next.combo.at) || next.combo.at < 0 || typeof next.combo.hit !== 'boolean') throw new Error('存档连击状态无效');
    if (next.legacy !== null && (!isRecord(next.legacy) || !Array.isArray(next.legacy.gongfaBook) || !isRecord(next.legacy.bld)
      || !Number.isFinite(next.legacy.insight) || next.legacy.insight < 0)) throw new Error('存档传承记录无效');
    if (next.legacyChoice !== null && !['gongfa', 'cave', 'insight'].includes(next.legacyChoice)) throw new Error('存档传承选择无效');
    migrateActivities(next, (savedState.v || 0) < 10);
    if (!full || !Object.hasOwn(snapshot.runtime, 'clock')) {
      // 旧 tickN 不记录步长，也不随转世重置，无法还原本世历时；不从余寿反推年龄。
      next.clock = freshClock(!next.beginOpen);
    }
    if (!isRecord(next.clock) || !Number.isFinite(next.clock.elapsed) || next.clock.elapsed < 0 || typeof next.clock.continued !== 'boolean') throw new Error('存档修行计时无效');
    // 首版时钟以 60 秒计一年；换速度只影响以后，保留已经历的年月与余寿。
    const savedYear = Object.hasOwn(next.clock, 'secondsPerYear') ? next.clock.secondsPerYear : 60;
    if (!Number.isFinite(savedYear) || savedYear <= 0) throw new Error('存档修行计时无效');
    next.clock.elapsed *= GX.SECONDS_PER_YEAR / savedYear;
    next.clock.secondsPerYear = GX.SECONDS_PER_YEAR;
    if (!Number.isFinite(next.clock.elapsed) || next.clock.elapsed > Number.MAX_SAFE_INTEGER / (GX.LIFE_PER_SEC * GX.DAYS_PER_YEAR)) throw new Error('存档修行计时无效');
    if (next.beginOpen && S._pend.reroll) {
      next.beginRerolls += S._pend.reroll;
      delete S._pend.reroll;
      next.panel.data = next._beginData();
    }
    if (!next.beginOpen && !next.ended && S.life <= 0) next.die('坐化');
    Object.assign(this, next);
    return this.S;
  }

  /* 轮回重启：清空全部，重开开局窗 */
  reset() {
    this.S = st.freshState();
    this.suspended = [];
    this.clock = freshClock();
    this.battle = null; this.panel = null; this.pending = { herb: null, roam: null };
    this.ended = false; this.shopBought = {};
    this.beginOpen = false; this.beginPending = null; this.beginRerolls = 0;
    this._enc = null; this._trib = null; this._secret = null;
    this.tickN = 0; this.eventTimer = 0; this.encTimer = 0; this.furnTimer = 0;
    this.encounterDelay = 0;
    this.combo = { n: 0, at: 0, hit: false };
    this.legacy = null; this.legacyChoice = null;
    this.logId = 0; this.logs = [];
    this.log('轮回重启，道心初定', 'dim');
    this.openBegin('new');
    return true;
  }
}

Object.assign(Engine.prototype, economyActions, progressionActions, encounterActions, battleActions, journeyActions, seekActions, activityActions);
export default Engine;
