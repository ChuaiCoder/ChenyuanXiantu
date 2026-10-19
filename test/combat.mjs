import test from 'node:test';
import assert from 'node:assert/strict';
import Engine from '../server/engine.mjs';
import { dispatchAction } from '../server/protocol.mjs';
import { combatStats, fixedEnemy } from '../shared/combat.js';
import { actionInfo, resolveRound, planIntent } from '../shared/combat-simulation.js';
import { damageLife, repairLife, extendLife, ageLife, naturalLifeCap } from '../shared/life.js';
import { syncPillGrades, takePill } from '../shared/inventory.js';
import { GX } from '../shared/data.js';
import * as st from '../shared/state.js';

function quiet() { const e = new Engine(); e.eventTimer = e.encTimer = -1e9; return e; }
function reload(e) { return new Engine().hydrate(e.serialize()); }

test('combat and fixed rewards do not grow with clicks, mines or production books', () => {
  const e = quiet(), stats = combatStats(e.S), enemy = fixedEnemy(e.S, 1);
  e.S.cult = 1e20; e.S.spirit = 1e20; e.S.bld.mine = e.S.bld.zhen = 80;
  e.S.gongfaBook = ['taixuan1']; e.S.prestige = 1000;
  assert.deepEqual(combatStats(e.S), stats); assert.deepEqual(fixedEnemy(e.S, 1), enemy);
  e.S.layer = 6; assert.ok(combatStats(e.S).atk > stats.atk);
});

test('manual input queues one action, costs elapsed time and pauses after the round', () => {
  const e = quiet(); e.setBattleMode('manual'); e.taoStart(1);
  const before = e.serialize(); e.tick(100); assert.deepEqual(e.serialize(), before);
  for (let i = 0; i < 100; i++) e.taoAct('strike');
  assert.equal(e.battle.turn, 0); e.tick(1.6);
  assert.equal(e.battle.turn, 1); assert.equal(e.clock.elapsed, 1.6);
  assert.ok(e.battle.waiting); const paused = e.serialize(); e.tick(900);
  assert.deepEqual(e.serialize(), paused);
});

test('semi automatic mode pauses on telegraphed heavy attacks and can be resumed', () => {
  const e = quiet(); e.taoStart(1); e.tick(30);
  assert.equal(e.battle.turn, 2); assert.equal(e.battle.intent.kind, 'heavy'); assert.ok(e.battle.paused);
  assert.equal(e.clock.elapsed, 3.2);
  const hp = e.battle.pPh; e.taoAct('guard'); e.tick(1.6);
  assert.equal(e.battle.turn, 3); assert.ok(e.battle.pPh < hp); assert.ok(!e.battle.paused);
});

test('a killed enemy cannot retaliate and a dead player cannot attack', () => {
  const e = quiet(); e.taoStart(1); e.battle.eHp = 1;
  const r = resolveRound(e.battle, 'strike');
  assert.equal(r.outcome, 'win'); assert.equal(r.battle.pPh, e.battle.pPh);
  e.battle.eHp = 100; e.battle.pPh = 1; e.battle.e.speed = 999;
  const lost = resolveRound(e.battle, 'strike');
  assert.equal(lost.outcome, 'loss'); assert.equal(lost.battle.eHp, 100);
});

test('battle reducer is deterministic across reload without mutating its input', () => {
  const e = quiet(); e.S.root = ['huo']; e.taoStart(1);
  const before = e.serialize(), restored = new Engine(); restored.hydrate(before);
  assert.deepEqual(resolveRound(e.battle, 'spell_huo'), resolveRound(restored.battle, 'spell_huo'));
  assert.deepEqual(e.serialize(), before);
});

test('spell cooldowns, true mana costs and interrupt immunity survive serialization', () => {
  const e = quiet(); e.S.layer = 6; e.setLoadout('0_interrupt'); e.taoStart(1);
  e.battle.turn = 2; e.battle.chargeAt = 3; planIntent(e.battle);
  const r = resolveRound(e.battle, 'spell_interrupt');
  assert.equal(r.battle.pMana, 100 - actionInfo(e.battle, 'spell_interrupt').cost);
  assert.equal(r.battle.pPh, e.battle.pPh); assert.equal(r.battle.chargeAt, 0);
  assert.equal(actionInfo(r.battle, 'spell_interrupt').ok, false);
  e.battle = r.battle; assert.doesNotThrow(() => reload(e));
});

test('battle blocks economy, collection, loadout and progression mutations', () => {
  const e = quiet(); e.S.spirit = 1e9; e.S.pills.juli = 5; e.taoStart(1);
  const before = e.serialize();
  for (const act of ['cultivate','herb','roam','med','recover','gongfa','bld:mine','craft:huichun','pill:juli','break','prepare','battleloadout:0_jin','chapter:0','study:jin2']) dispatchAction(e, act);
  assert.deepEqual(e.serialize(), before);
});

test('all main activities reserve the character, and completed activities release it', () => {
  for (const kind of ['herb','roam','med','recover','study:jin2']) {
    const e = quiet(); e.S.layer = 4; e.S.spirit = 60; e.S.materials.essence = 2;
    dispatchAction(e, kind); assert.ok(e.frame().activity.busy);
    const before = e.serialize();
    for (const act of ['cultivate','herb','roam','med','recover','tao:1','prepare']) dispatchAction(e, act);
    assert.deepEqual(e.serialize(), before);
    e.tick(120); assert.equal(e.frame().activity.kind, 'idle');
    if (kind === 'study:jin2') assert.ok(e.S.combat.learned.includes('jin2'));
  }
});

test('offline rewards settle once, while age and active task remain unchanged', () => {
  const e = quiet(); e.S.bld.zhen = e.S.bld.mine = 1; e.startHerb();
  e.goOffline(1000); const before = e.serialize(); e.tick(900);
  assert.deepEqual(e.serialize(), before);
  const r = new Engine(); r.hydrate(before);
  const rate = st.zhenRate(e.S); assert.equal(r.goOnline(3601000), 3600);
  assert.equal(r.S.cult, rate * 1800); assert.equal(r.S.life, 100);
  assert.equal(r.pending.herb.remaining, 15); assert.equal(r.clock.elapsed, 0);
  const earned = r.S.cult; r.goOnline(7201000); assert.equal(r.S.cult, earned);
});

test('offline battles and critical choice scenes grant no idle reward', () => {
  for (const scene of ['battle','secret','begin']) {
    const e = quiet(); e.S.bld.zhen = e.S.bld.mine = 10;
    if (scene === 'battle') e.taoStart(1); else if (scene === 'secret') e.openSecret(); else e.openBegin('new');
    e.goOffline(1000); assert.equal(e.goOnline(86401000), 0);
    assert.equal(e.S.cult, 0); assert.equal(e.S.spirit, 0); assert.equal(e.clock.elapsed, 0);
  }
});

test('lifespan repair is bounded, extension has a lifetime quota, aging is irreversible', () => {
  const e = quiet(); ageLife(e.S, 900); damageLife(e.S);
  assert.equal(e.S.life, 94); assert.equal(repairLife(e.S, 100), 2); assert.equal(e.S.life, 96);
  assert.equal(repairLife(e.S, 100), 0); assert.equal(extendLife(e.S, 1000), 20);
  assert.equal(extendLife(e.S, 1), 0); assert.equal(e.S.life, 116);
  assert.equal(e.S.lifeLedger.age, 1); assert.equal(naturalLifeCap(e.S), 100);
  assert.doesNotThrow(() => reload(e));
});

test('fractional lethal losses cannot leave a floating point sliver of life', () => {
  for (let i = 1; i <= 1000; i++) {
    const e = quiet(); e.S.life = 1; ageLife(e.S, i / 731);
    damageLife(e.S); assert.equal(e.S.life, 0);
    e.tick(1); assert.ok(e.ended);
  }
});

test('an altar can be stopped to save spirit without losing its building levels', () => {
  const e = quiet(); e.S.bld.mine = 10; e.S.bld.altar = 10; e.S.spirit = 1000;
  e.tick(1); assert.ok(e.S.spirit < 1000);
  dispatchAction(e, 'altar'); const spirit = e.S.spirit; e.tick(1);
  assert.ok(e.S.spirit > spirit); assert.equal(e.S.bld.altar, 10);
  assert.equal(reload(e).altarEnabled, false);
});

test('graded pills retain their realm, tolerance and exact inventory across battle reload', () => {
  const e = quiet(); e.S.pills.huichun = 4; syncPillGrades(e.S);
  e.S.realmIdx = 1; e.S.combat = null; e.taoStart(1);
  assert.equal(e.battle.potency.huichun, .5); assert.equal(e.battle.supplies.huichun, 3);
  e.battle.pPh = 20; e.taoAct('pill_huichun'); e.tick(1.6);
  assert.equal(e.S.pills.huichun, 3); assert.equal(e.S.pillGrades.huichun[0], 3);
  assert.equal(e.battle.medicine, 1); assert.doesNotThrow(() => reload(e));
  e.taoFlee(); assert.equal(e.S.combat.medicine, 1);
  e.startRecovery(); e.tick(60); assert.equal(e.S.combat.medicine, 0);
  assert.equal(e.S.combat.hp, e.S.combat.maxHp);
  assert.ok(takePill(e.S, 'huichun')); assert.equal(e.S.pills.huichun, 2);
});

test('victory and defeat can each settle only once, and retreat preserves HP', () => {
  const e = quiet(); e.taoStart(1); e.setBattleMode('auto'); e.tick(60);
  assert.equal(e.S.taoKills, 1); assert.ok(e.S.combat.hp < e.S.combat.maxHp);
  const before = e.serialize(); e.taoFinish(true); assert.deepEqual(e.serialize(), before);
  e.taoStart(1); const hp = e.battle.pPh; e.taoFlee(); assert.equal(e.S.combat.hp, hp);
});

test('each artifact and each pet can start and restore a valid battle', () => {
  for (const type of Object.keys(GX.TREASURE_TYPES)) for (const kind of Object.keys(GX.BEASTS)) {
    const e = quiet(); e.S.treasure = { type, q: 4, words: {} }; e.S.beasts[kind] = 1;
    e.taoStart(1); assert.doesNotThrow(() => reload(e), `${type}/${kind}`);
    const r = resolveRound(e.battle, 'treasure'); assert.ok(Number.isFinite(r.battle.pMana));
  }
});

test('malformed combat and activity saves are rejected atomically', () => {
  const e = quiet(); e.taoStart(1); const before = e.serialize();
  for (const change of [
    s => { s.runtime.battle.intent.power = -1; }, s => { s.runtime.battle.status.player.burn = [{}]; },
    s => { s.runtime.battle.lossCap = null; }, s => { s.runtime.battle.pMana = 101; },
    s => { s.runtime.battle.potency.huichun = 100; }, s => { s.runtime.battle.queued = 'unknown'; },
    s => { s.runtime.suspended = {}; }, s => { s.S.lifeLedger.damage = -1; },
    s => { s.S.recovery = 1; }, s => { s.S.pillGrades.huichun = { 0: -1 }; },
  ]) {
    const bad = structuredClone(before); change(bad); assert.throws(() => e.hydrate(bad));
    assert.deepEqual(e.serialize(), before);
  }
});
