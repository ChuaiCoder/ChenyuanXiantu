// Pure, serializable battle reducer. No inventory, persistence, clocks or UI access.
import { SPELLS } from './combat-data.js';
import { spellCost } from './combat.js';

export const freshStatus = () => ({ shield: 0, shieldUntil: 0, brokenUntil: 0, vineUntil: 0, chill: 0, chillUntil: 0, immuneUntil: 0, stun: false, burn: [], regen: [], windUntil: 0, mirrorUntil: 0 });
const roundOf = b => b.turn + 1;
const alive = b => b.pPh > 0 && b.eHp > 0;
const status = (b, side) => b.status[side];
const maxHp = (b, side) => side === 'player' ? b.pMax : b.eMax;
function random(b) { let x = b.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; b.rng = x >>> 0; return b.rng / 4294967296; }
function heal(b, side, amount) {
  const key = side === 'player' ? 'pPh' : 'eHp';
  const gain = Math.max(0, Math.min(Math.floor(amount), maxHp(b, side) - b[key])); b[key] += gain;
  return gain;
}
function shield(b, side, amount, duration = 2) {
  const s = status(b, side); s.shield = Math.min(Math.floor(maxHp(b, side) * .5), Math.max(s.shield, Math.floor(amount)));
  s.shieldUntil = Math.max(s.shieldUntil, roundOf(b) + duration - 1);
}
function cleanse(s, count = 1) {
  for (let i = 0; i < count; i++) {
    if (s.stun) s.stun = false;
    else if (s.burn.length) s.burn.shift();
    else if (s.chill) { s.chill = 0; s.chillUntil = 0; }
    else if (s.vineUntil) s.vineUntil = 0;
    else if (s.brokenUntil) s.brokenUntil = 0;
  }
}
function suffer(b, target, value, { pierce = 0, direct = false } = {}) {
  const s = status(b, target), key = target === 'player' ? 'pPh' : 'eHp';
  const through = Math.floor(value * pierce), absorbed = Math.min(s.shield, value - through);
  s.shield -= absorbed;
  let hpLoss = value - absorbed;
  if (target === 'player' && b.petGuard && b.petHp > 0) {
    const share = Math.min(b.petHp, Math.floor(hpLoss * .4)); b.petHp -= share; hpLoss -= share;
  }
  b[key] = Math.max(0, b[key] - hpLoss);
  if (direct && target === 'player' && s.mirrorUntil >= roundOf(b)) { s.mirrorUntil = 0; chill(b, 'enemy'); }
  return hpLoss;
}
export function predictedDamage(b, side, power, critical = true) {
  const attacker = side === 'player' ? b.stats : b.e;
  const target = side === 'player' ? b.e : b.stats;
  const s = status(b, side === 'player' ? 'enemy' : 'player'), r = roundOf(b);
  const armor = target.armor * (s.brokenUntil >= r ? .75 : 1);
  const armorFactor = 1 - Math.min(.6, armor / (armor + 100 * attacker.scale));
  const reduction = (side === 'enemy' && b.guard ? .5 : 1) * (side === 'enemy' && s.windUntil >= r ? .7 : 1);
  return Math.max(1, Math.floor(attacker.atk * power * (critical ? 1.5 : 1) * Math.max(.2, armorFactor * reduction)));
}
function hit(b, side, power, options = {}) {
  const target = side === 'player' ? 'enemy' : 'player';
  const raw = predictedDamage(b, side, power, random(b) < .05);
  const damage = suffer(b, target, raw, { ...options, direct: true });
  if (side === 'enemy') b.status.player.windUntil = 0;
  // Death is checked before reflection or attached effects.
  if (alive(b) && side === 'player' && b.e.reflect && roundOf(b) % 3 !== 0) suffer(b, 'player', Math.floor(damage * .2));
  return damage;
}
function chill(b, target) {
  const s = status(b, target), r = roundOf(b);
  s.chill++; s.chillUntil = r + 1;
  if (s.chill >= 3) {
    s.chill = 0;
    if (s.immuneUntil >= r) return;
    if (target === 'enemy' && b.e.boss) { s.chill = 2; s.chillUntil = r + 1; }
    else { s.stun = true; s.immuneUntil = r + 2; }
  }
}
function interrupt(b, events) {
  const s = b.status.enemy, r = roundOf(b);
  if (b.chargeAt && s.immuneUntil < r) {
    b.chargeAt = 0; b.interrupted = true; s.immuneUntil = r + 2;
    events.push('蓄力被打断；敌人获得两回合定心。');
  }
}
export function planIntent(b) {
  b.guard = false;
  const r = roundOf(b), heavy = b.chargeAt > 0 && b.chargeAt <= r;
  const charging = !b.chargeAt && r % 4 === 2;
  const power = heavy ? (b.e.boss && b.eHp <= b.eMax * .6 ? 2.2 : 1.8) : 1;
  b.intent = { kind: heavy ? 'heavy' : charging ? 'charge' : 'attack',
    name: heavy ? '蓄力重击' : charging ? '聚势蓄力' : b.e.reflect && r % 3 !== 0 ? '甲姿反击' : '普通攻击',
    power, maxDamage: charging ? 0 : predictedDamage(b, 'enemy', power),
    interruptible: !!b.chargeAt && b.status.enemy.immuneUntil < r };
  const danger = heavy || b.intent.maxDamage >= b.pPh;
  b.paused = b.mode === 'semi' && danger;
  b.waiting = b.mode === 'manual';
}
export function actionInfo(b, id) {
  const r = roundOf(b);
  let data;
  if (id === 'strike') data = { name: '普攻', effect: 'hit', power: 1, cost: 0 };
  else if (id === 'guard') data = { name: '守御', effect: 'guard', cost: 0, priority: 0 };
  else if (id === 'breathe') data = { name: '吐纳', effect: 'mana', power: 20, cost: 0 };
  else if (id === 'release' || id === 'cut') {
    if (!b.playerCharge) return { ok: false, reason: '尚未蓄雷' };
    data = { name: id === 'cut' ? '截雷' : '引雷释放', effect: id === 'cut' ? 'interrupt' : 'hit', power: id === 'cut' ? .8 : 2.8, cost: 0, priority: id === 'cut' ? 1 : 3 };
  } else if (id.startsWith('spell_')) {
    const key = id.slice(6), skill = SPELLS[key];
    if (!skill || !b.loadout.includes(key)) return { ok: false, reason: '术法未配置' };
    data = { ...skill, cost: spellCost(skill, b.roots) };
  } else if (id === 'treasure') data = b.artifact;
  else if (id === 'beast') {
    if (!b.pet || b.petHp <= 0) return { ok: false, reason: '灵兽未出战或已退场' };
    data = { name: '灵兽指令', effect: 'pet', cost: 20, cooldown: 4 };
  } else if (id.startsWith('pill_')) {
    const key = id.slice(5);
    if (!(b.supplies[key] > 0)) return { ok: false, reason: '行囊无此物' };
    if (key === 'dun' && (b.e.realm || 0) > (b.supplyTiers.dun ?? 0) + 1) return { ok: false, reason: '遁符药阶不足' };
    if (['huichun', 'huiyuan'].includes(key) && b.medicine >= 3) return { ok: false, reason: '药力已满，回府调息后恢复' };
    if (['huti', 'pozhang', 'qingxin'].includes(key) && b.symbolReady > r) return { ok: false, reason: '符箓冷却中' };
    data = { name: key, effect: 'item', item: key, cost: 0, priority: ['huti', 'dun'].includes(key) ? 0 : 1 };
  }
  if (!data) return { ok: false, reason: '行动未解锁' };
  if ((b.cooldowns[id] || 0) > r) return { ...data, ok: false, reason: `冷却 ${b.cooldowns[id] - r} 回合` };
  if (data.cost > b.pMana) return { ...data, ok: false, reason: '真元不足' };
  return { ...data, priority: data.priority ?? 2, ok: true, reason: '' };
}
export function chooseAction(b) {
  const valid = id => actionInfo(b, id).ok;
  if (b.intent.kind === 'heavy') {
    if (b.intent.interruptible) {
      for (const id of ['cut', 'spell_interrupt', 'treasure']) if (valid(id) && actionInfo(b, id).effect === 'interrupt') return id;
    }
    return 'guard';
  }
  const threshold = { cautious: .5, balanced: .35, aggressive: .25 }[b.strategy];
  if (b.pPh / b.pMax < threshold) {
    for (const id of [...b.loadout.map(s => `spell_${s}`), 'treasure']) if (valid(id) && ['heal', 'cleanHeal', 'regen'].includes(actionInfo(b, id).effect)) return id;
    if (b.autoPills && valid('pill_huichun')) return 'pill_huichun';
  }
  if (b.playerCharge) return 'release';
  if (b.pMana < 15) return 'breathe';
  for (const id of [...b.loadout.map(s => `spell_${s}`), 'treasure']) if (valid(id) && ['break', 'bind', 'burn', 'chill', 'hit', 'pierce', 'wave', 'ignite', 'quake', 'charge'].includes(actionInfo(b, id).effect)) return id;
  return 'strike';
}
function petAction(b, command, events) {
  if (!b.pet || b.petHp <= 0) return;
  const bonus = 1 + b.pet.stars * .03;
  if (b.pet.kind === 'xuan') {
    if (command) b.petGuard = true;
    else shield(b, 'player', b.pMax * .05 * bonus, 1);
  } else if (b.pet.kind === 'di') { cleanse(b.status.player); heal(b, 'player', b.pMax * (command ? .15 : .03) * bonus); }
  else hit(b, 'player', (command ? b.pet.kind === 'fan' && b.eHp / b.eMax < .3 ? 1.2 : .9 : .2) * bonus);
  if (command) events.push('灵兽执行指令，替代本回合自动辅助。');
}
function playerAction(b, id, events, consumed) {
  let info = actionInfo(b, id);
  if (!info.ok) { id = 'strike'; info = actionInfo(b, id); }
  const s = b.status.player, foe = b.status.enemy, r = roundOf(b);
  if (s.stun) { s.stun = false; events.push('受控制，本次主行动取消。'); return; }
  b.pMana -= info.cost;
  if (info.cooldown) b.cooldowns[id] = r + info.cooldown + 1;
  if (!['release', 'cut'].includes(id) && b.playerCharge) b.playerCharge = false;
  if (id === 'release' || id === 'cut') b.playerCharge = false;
  const { effect, power } = info;
  if (effect === 'item') {
    const key = info.item;
    b.supplies[key]--; consumed.push(key);
    const tolerance = [1, .8, .6][Math.min(2, b.medicine)];
    const potency = b.potency?.[key] ?? 1;
    if (key === 'huichun') { heal(b, 'player', b.pMax * .3 * tolerance * potency); b.medicine++; }
    if (key === 'huiyuan') { b.pMana = Math.min(100, b.pMana + Math.floor(30 * tolerance * potency)); b.medicine++; }
    if (key === 'huti') shield(b, 'player', b.pMax * .3 * potency, 1);
    if (key === 'pozhang') foe.shield = Math.max(0, foe.shield - Math.floor(b.pMax * .25 * potency));
    if (key === 'qingxin') cleanse(s, 2);
    if (key === 'dun') b.escaped = true;
    if (['huti', 'pozhang', 'qingxin'].includes(key)) b.symbolReady = r + 3;
  } else if (effect === 'guard') b.guard = true;
  else if (effect === 'mana') b.pMana = Math.min(100, b.pMana + Math.floor(power));
  else if (effect === 'pet') petAction(b, true, events);
  else if (effect === 'shield' || effect === 'mirror') { shield(b, 'player', b.pMax * power); if (effect === 'mirror') s.mirrorUntil = r + 1; }
  else if (effect === 'heal' || effect === 'cleanHeal' || effect === 'regen') {
    heal(b, 'player', b.pMax * power);
    if (effect === 'cleanHeal') cleanse(s);
    if (effect === 'regen') s.regen = [{ amount: b.pMax * .08, ticks: 2 }];
  } else if (effect === 'wind') { s.windUntil = r; s.speedUntil = r + 1; }
  else if (effect === 'charge') b.playerCharge = true;
  else {
    let multiplier = power;
    if (effect === 'wave' && (foe.vineUntil >= r || foe.chill)) multiplier += .3;
    if (effect === 'ignite') { multiplier += foe.burn.length * .4; foe.burn = []; }
    if (effect === 'quake') { const spent = Math.floor(s.shield / 2); s.shield -= spent; multiplier += Math.min(.8, spent / b.stats.atk); }
    if (effect === 'burn' && b.combos && foe.vineUntil >= r) { foe.vineUntil = 0; multiplier += .5; }
    const damage = hit(b, 'player', multiplier, { pierce: effect === 'pierce' ? .5 : 0 });
    events.push(`${info.name}造成 ${damage} 点气血伤害。`);
    if (!alive(b)) return;
    if (effect === 'break') foe.brokenUntil = r + 1;
    if (effect === 'burn') { if (foe.burn.length >= 2) foe.burn.shift(); foe.burn.push({ amount: Math.max(1, Math.floor(b.stats.atk * .25)), ticks: 3 }); }
    if (effect === 'chill') chill(b, 'enemy');
    if (effect === 'bind') {
      foe.vineUntil = r + 1;
      if (b.chargeAt && !b.chargeDelayed && foe.immuneUntil < r) { b.chargeAt++; b.chargeDelayed = true; b.interrupted = true; }
    }
    if (effect === 'interrupt') interrupt(b, events);
  }
  if (!events.length) events.push(`施展${info.name}。`);
}
function enemyAction(b, events) {
  const r = roundOf(b), s = b.status.enemy;
  if (s.stun) { s.stun = false; events.push('敌人被控制，本次行动取消。'); return; }
  if (b.interrupted) return;
  if (b.intent.kind === 'charge') { b.chargeAt = r + 1; b.chargeDelayed = false; events.push('敌人开始蓄力，下回合可打断或守御。'); return; }
  const damage = hit(b, 'enemy', b.intent.power);
  events.push(`${b.intent.name}造成 ${damage} 点气血伤害。`);
  if (b.intent.kind === 'heavy') {
    b.chargeAt = 0;
    if (alive(b) && b.petHp > 0 && b.e.boss) b.petHp = Math.max(0, b.petHp - Math.floor(damage * .5));
  }
}
export function resolveRound(snapshot, requested) {
  const b = structuredClone(snapshot), events = [], consumed = [], r = roundOf(b);
  b.guard = false; b.petGuard = false; b.interrupted = false;
  for (const side of ['player', 'enemy']) {
    const s = status(b, side);
    if (s.shieldUntil < r) s.shield = 0;
    if (s.chillUntil < r) s.chill = 0;
    for (const dot of s.burn) { suffer(b, side, dot.amount); dot.ticks--; if (!alive(b)) break; }
    s.burn = s.burn.filter(dot => dot.ticks > 0);
    if (!alive(b)) break;
  }
  if (alive(b)) for (const side of ['player', 'enemy']) {
    const s = status(b, side);
    for (const regen of s.regen) { heal(b, side, regen.amount); regen.ticks--; }
    s.regen = s.regen.filter(regen => regen.ticks > 0);
  }
  const action = requested || chooseAction(b), info = actionInfo(b, action);
  const speed = (side, base) => base - (status(b, side).vineUntil >= r ? 20 : 0) - status(b, side).chill * 10 + (status(b, side).speedUntil >= r ? 20 : 0);
  const enemyPriority = b.intent.kind === 'heavy' ? 3 : 2;
  const playerFirst = info.priority < enemyPriority || info.priority === enemyPriority && speed('player', b.stats.speed) >= speed('enemy', b.e.speed);
  const player = () => playerAction(b, action, events, consumed);
  const enemy = () => enemyAction(b, events);
  for (const act of playerFirst ? [player, enemy] : [enemy, player]) {
    if (!alive(b) || b.escaped) break;
    act();
  }
  if (alive(b) && !b.escaped && action !== 'beast' && r % 2 === 0) petAction(b, false, events);
  b.turn = r;
  let outcome = b.eHp <= 0 ? 'win' : b.pPh <= 0 ? 'loss' : b.escaped ? 'flee' : r >= (b.e.boss ? 40 : 30) ? 'draw' : null;
  if (!outcome) planIntent(b);
  return { battle: b, events, consumed, outcome };
}
