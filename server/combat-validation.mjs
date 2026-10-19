import { COMBAT_VERSION, ROUND_SECONDS, SPELLS, STRATEGIES, MODES, COMBAT_ITEMS } from '../shared/combat-data.js';
import { validRoot } from '../shared/roots.js';
import { GX } from '../shared/data.js';
import { availableSpells } from '../shared/combat.js';
const record = x => !!x && typeof x === 'object' && !Array.isArray(x);
const number = (n, max = Number.MAX_SAFE_INTEGER) => Number.isFinite(n) && n >= 0 && n <= max;
const integer = (n, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(n) && n >= 0 && n <= max;
const invalid = () => { throw new Error('存档战斗或修习状态无效'); };
export function validateCombatState(S, battle) {
  if (!number(S.recovery ?? 0, 60)) invalid();
  if (S.study && (!record(S.study) || !Object.hasOwn(SPELLS, S.study.id) || !S.study.id.endsWith('2') || !number(S.study.remaining, 60))) invalid();
  const c = S.combat;
  if (c) {
    if (!record(c) || !number(c.maxHp) || c.maxHp <= 0 || !number(c.hp, c.maxHp) || !number(c.mana, 100)
      || !integer(c.medicine, 3) || !integer(c.chapter, S.realmIdx) || !Object.hasOwn(STRATEGIES, c.strategy) || !Object.hasOwn(MODES, c.mode)
      || !Array.isArray(c.loadout) || c.loadout.length > 3 || c.loadout.some(id => !Object.hasOwn(SPELLS, id))
      || !Array.isArray(c.learned) || c.learned.some(id => !Object.hasOwn(SPELLS, id)) || new Set(c.learned).size !== c.learned.length
      || c.pet != null && !Object.hasOwn(S.beasts, c.pet) || !number(c.petRecovery || 0, 120) || !record(c.maps)) invalid();
    for (const [key, n] of Object.entries(c.maps)) if (!/^(0|[1-9][0-9]?)$/.test(key) || Number(key) > 12 || !integer(n, 5) || n < 1) invalid();
    if (typeof c.autoPills !== 'boolean' || c.combos != null && typeof c.combos !== 'boolean'
      || new Set(c.loadout).size !== c.loadout.length || c.loadout.some(id => !availableSpells(S).includes(id))) invalid();
  }
  if (!battle) return;
  const b = battle;
  if (!record(b) || !integer(b.node, 5) || b.node < 1 || !record(b.e) || !number(b.e.atk)
    || !number(b.eMax) || b.eMax <= 0 || !number(b.eHp, b.eMax) || b.eHp <= 0
    || !number(b.pMax) || b.pMax <= 0 || !number(b.pPh, b.pMax) || b.pPh <= 0
    || !integer(b.turn) || !number(b.acc, 6.4) || ![0, 1].includes(b.pAuto)) invalid();
  if (b.version == null || b.version === 1) { b.acc = Math.min(b.acc, ROUND_SECONDS); return; }
  if (b.version !== COMBAT_VERSION || typeof b.id !== 'string' || !b.id || !validRoot(b.roots) || !record(b.stats)
    || !number(b.pMana, 100) || !integer(b.medicine, 3) || !Object.hasOwn(MODES, b.mode) || !Object.hasOwn(STRATEGIES, b.strategy)
    || !Array.isArray(b.loadout) || b.loadout.length > 3 || b.loadout.some(id => !Object.hasOwn(SPELLS, id))
    || !record(b.cooldowns) || Object.values(b.cooldowns).some(n => !integer(n))
    || !record(b.status) || !integer(b.rng, 0xffffffff) || b.rng === 0 || !record(b.supplies) || !record(b.supplyTiers)
    || !['map', 'quest', 'encounter', 'secret'].includes(b.source) || !record(b.intent)) invalid();
  if (!integer(b.chapter, S.realmIdx) || !number(b.lossCap) || b.lossCap <= 0 || !number(b.acc, ROUND_SECONDS)
    || !number(b.petMax) || !number(b.petHp, b.petMax) || !integer(b.symbolReady)
    || !['attack', 'charge', 'heavy'].includes(b.intent.kind) || !number(b.intent.power, 3)
    || !number(b.intent.maxDamage) || typeof b.intent.interruptible !== 'boolean'
    || !record(b.potency) || b.loadout.some(id => !availableSpells(S).includes(id))
    || new Set(b.loadout).size !== b.loadout.length) invalid();
  for (const key of ['autoPills', 'combos', 'paused', 'waiting']) if (typeof b[key] !== 'boolean') invalid();
  for (const key of ['chargeAt', 'legacyAttack']) if (b[key] != null && !number(b[key])) invalid();
  if (b.pet && (!record(b.pet) || !Object.hasOwn(GX.BEASTS, b.pet.kind) || !integer(b.pet.stars, GX.BEASTS[b.pet.kind].stars) || b.pet.stars < 1)) invalid();
  if (b.artifact && (!record(b.artifact) || !['shield','mana','interrupt','pierce','cleanHeal','hit'].includes(b.artifact.effect)
    || !number(b.artifact.power, 40) || !number(b.artifact.cost, 100) || !integer(b.artifact.cooldown, 10))) invalid();
  if (b.queued != null && (typeof b.queued !== 'string' || !['strike','guard','breathe','release','cut','treasure','beast', ...b.loadout.map(id => `spell_${id}`), ...COMBAT_ITEMS.map(id => `pill_${id}`)].includes(b.queued))) invalid();
  if (b.source === 'secret' && (!record(b.continuation) || !integer(b.continuation.turn, 3) || b.continuation.turn < 1)) invalid();
  for (const stats of [b.stats, b.e]) for (const key of ['atk', 'armor', 'speed', 'scale']) if (!number(stats[key]) || key === 'scale' && stats[key] === 0) invalid();
  for (const side of ['player', 'enemy']) {
    const s = b.status[side];
    if (!record(s) || !number(s.shield) || !integer(s.chill, 2) || typeof s.stun !== 'boolean' || !integer(s.speedUntil ?? 0)) invalid();
    for (const key of ['shieldUntil', 'brokenUntil', 'vineUntil', 'chillUntil', 'immuneUntil', 'windUntil', 'mirrorUntil']) if (!integer(s[key])) invalid();
    for (const key of ['burn', 'regen']) if (!Array.isArray(s[key]) || s[key].length > 2 || s[key].some(effect => !record(effect) || !number(effect.amount) || !integer(effect.ticks, 3) || effect.ticks < 1)) invalid();
  }
  for (const key of COMBAT_ITEMS) if (!integer(b.supplies[key], 3) || b.supplies[key] > (S.pills[key] || 0)
    || ![0, .25, .5, 1].includes(b.potency[key])
    || b.supplies[key] > 0 && (!integer(b.supplyTiers[key], 12) || b.supplies[key] > (S.pillGrades?.[key]?.[b.supplyTiers[key]] || 0))) invalid();
}
