import { addPills } from '../shared/inventory.js';
import { ensureCombat } from '../shared/combat.js';
import { damageLife, extendLife, syncLife } from '../shared/life.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Engine from '../server/engine.mjs';
import { dispatchAction, handleMessage } from '../server/protocol.mjs';
import { saveEngine, loadSave } from '../server/persistence.mjs';
import { GX, fmt } from '../shared/data.js';
import * as st from '../shared/state.js';
import { seedRealmRequirements, chooseProgression } from './progression-bot.mjs';
import { stateForDisplay } from '../src/store/snapshot.js';

function restore(e) { const copy = new Engine(); copy.hydrate(e.serialize()); return copy; }

function quietClock(t) {
  const e = new Engine();
  t.mock.method(e, 'randomEvent', () => {});
  t.mock.method(e, 'openEncounter', () => {});
  return e;
}

test('cultivation calendar shares lifespan scale regardless of tick frequency', t => {
  assert.equal(GX.SECONDS_PER_YEAR, 900);
  for (const dt of [0.2, 1, 60, 900]) {
    const e = quietClock(t);
    assert.equal(e.frame().dayN, 1);
    for (let i = 0; i < 900 / dt; i++) e.tick(dt);
    assert.deepEqual(e.frame().calendar, { years: 1, days: 0, continued: false });
    assert.equal(e.frame().dayN, 366);
    assert.ok(Math.abs(e.S.life - 99) < 1e-9);
  }
  const e = quietClock(t), daySeconds = 1 / (GX.LIFE_PER_SEC * GX.DAYS_PER_YEAR);
  e.tick(daySeconds - 0.001); assert.equal(e.frame().dayN, 1);
  e.tick(0.001); assert.equal(e.frame().dayN, 2);
  e.tick(900 - daySeconds - 0.001);
  assert.deepEqual(e.frame().calendar, { years: 0, days: 364, continued: false });
  e.tick(0.001);
  assert.deepEqual(e.frame().calendar, { years: 1, days: 0, continued: false });
});

test('save reload retains fractional cultivation time and resumes from it', t => {
  const e = quietClock(t); e.tick(899.9);
  const r = restore(e);
  assert.deepEqual(r.clock, e.clock); assert.equal(r.S.life, e.S.life);
  assert.deepEqual(r.frame().calendar, e.frame().calendar);
  r.tick(0.1);
  assert.deepEqual(r.frame().calendar, { years: 1, days: 0, continued: false });
  assert.ok(Math.abs(r.S.life - 99) < 1e-9);
});

test('old saves retain remaining life and explicitly start a continuation clock', t => {
  const old = st.freshState(); old.v = 5; old.life = 30; old.times = 2;
  const full = new Engine().serialize(); full.S = structuredClone(old);
  full.runtime.tickN = 70000; delete full.runtime.clock;
  for (const snapshot of [old, full]) {
    const e = quietClock(t); e.hydrate(snapshot);
    assert.equal(e.S.life, 30); assert.equal(e.S.times, 2);
    assert.deepEqual(e.frame().calendar, { years: 0, days: 0, continued: true });
    e.tick(10);
    const r = restore(e);
    assert.deepEqual(r.clock, { elapsed: 10, continued: true, secondsPerYear: 900 });
    assert.equal(r.S.life, e.S.life);
    r.tick(1); assert.equal(r.clock.elapsed, 11);
  }
});

test('old unstarted saves begin a fresh clock without guessing past time', () => {
  const e = new Engine(); e.openBegin('new');
  const full = e.serialize(); delete full.runtime.clock;
  const raw = st.freshState(); raw.v = 5; raw._pend = { pills: 1 };
  for (const snapshot of [full, raw]) {
    const r = new Engine(); r.hydrate(snapshot);
    assert.equal(r.beginOpen, true);
    assert.deepEqual(r.clock, { elapsed: 0, continued: false, secondsPerYear: 900 });
    r.tick(60); assert.equal(r.clock.elapsed, 0);
    r.beginPending = ['huo']; r.commitBegin();
    assert.equal(r.S.life, 100); assert.equal(r.frame().dayN, 1);
  }
});

test('world pauses and offline earnings do not advance lifespan or calendar', t => {
  for (const stage of ['begin', 'secret', 'seek', 'end']) {
    const e = quietClock(t); e.tick(12.3);
    if (stage === 'begin') e.openBegin('new');
    if (stage === 'secret') e.openSecret();
    if (stage === 'seek') {
      e.S.layer = 3; e.S.materials.earth = 2; e.S.materials.essence = 2;
      e.seekAction('ren_visit'); e.seekAction('ren_jin_supply');
      for (const id of ['ren_care', 'ren_escort1', 'ren_escort2']) e.S.seek.done[id] = true;
      e.seekAction('ren_jin_proof');
    }
    if (stage === 'end') e.die('坐化');
    assert.equal(e.panel.kind, stage);
    const clock = structuredClone(e.clock), life = e.S.life;
    e.tick(60);
    assert.deepEqual(e.clock, clock); assert.equal(e.S.life, life);
  }
  const e = quietClock(t); e.tick(1); e.S.bld.zhen = 1;
  const clock = structuredClone(e.clock), life = e.S.life;
  e.S.lastTs = Date.now() - 3600000;
  assert.ok(e.offlineEarnings() >= 3600); assert.ok(e.S.cult > 0);
  assert.deepEqual(e.clock, clock); assert.equal(e.S.life, life);
  for (const invalid of [0, -1, NaN, Infinity, '60']) e.tick(invalid);
  assert.deepEqual(e.clock, clock); assert.equal(e.S.life, life);
});

test('death counts only surviving time and reincarnation and reset restart the clock', t => {
  const e = quietClock(t); e.S.life = 0.01; e.clock.continued = true;
  e.tick(60);
  assert.equal(e.ended, true); assert.equal(e.S.life, 0);
  assert.ok(Math.abs(e.clock.elapsed - 9) < 1e-9);
  assert.equal(e.frame().dayN, 4);
  e.tick(60); assert.ok(Math.abs(e.clock.elapsed - 9) < 1e-9);
  e.continueEnd();
  assert.deepEqual(e.clock, { elapsed: 0, continued: false, secondsPerYear: 900 });
  assert.equal(e.frame().dayN, 1); assert.equal(e.S.times, 1);
  e.beginPending = ['huo']; e.commitBegin(); assert.equal(e.S.life, 100);
  e.tick(20); e.reset();
  assert.deepEqual(e.clock, { elapsed: 0, continued: false, secondsPerYear: 900 });
  assert.equal(e.beginOpen, true); assert.equal(e.S.life, 100);
});

test('healing affects HP while lifespan repair and extension retain the calendar', t => {
  const e = quietClock(t); e.tick(60); damageLife(e.S); addPills(e.S, 'huichun', 1);
  const c = ensureCombat(e.S); c.hp = 10;
  const calendar = e.frame().calendar, life = e.S.life;
  e.usePill('huichun'); assert.ok(c.hp > 10); assert.equal(e.S.life, life);
  const cap = st.lifeCap(e.S); extendLife(e.S, 4);
  assert.equal(st.lifeCap(e.S), cap + 4); assert.equal(e.S.life, life + 4);
  assert.deepEqual(e.frame().calendar, calendar);
});

test('malformed cultivation clocks are rejected without changing the loaded game', t => {
  const e = quietClock(t); e.tick(10); const before = e.serialize();
  for (const clock of [null, [], {}, { elapsed: -1, continued: false },
    { elapsed: NaN, continued: false }, { elapsed: Infinity, continued: false },
    { elapsed: Number.MAX_VALUE, continued: false }, { elapsed: '60', continued: false },
    { elapsed: 60, continued: 1 }, { elapsed: 60, continued: false, secondsPerYear: 0 },
    { elapsed: 60, continued: false, secondsPerYear: -60 }, { elapsed: 60, continued: false, secondsPerYear: '900' },
    { elapsed: 60, continued: false, secondsPerYear: Infinity }]) {
    const invalid = structuredClone(before); invalid.runtime.clock = clock;
    assert.throws(() => e.hydrate(invalid), /存档修行计时无效/);
    assert.deepEqual(e.serialize(), before);
  }
});

test('slower aging preserves the calendar and lifespan of an existing one-minute-year save once', t => {
  const old = new Engine().serialize();
  old.S.v = 9; old.S.life = 30; old.runtime.clock = { elapsed: 60 * 70.5, continued: true };
  const e = quietClock(t); e.hydrate(old);
  assert.equal(e.S.life, 30); assert.equal(e.clock.elapsed, 900 * 70.5);
  assert.deepEqual(e.frame().calendar, { years: 70, days: 182, continued: true });
  const r = restore(e); assert.deepEqual(r.clock, e.clock); assert.equal(r.S.life, 30);
  r.tick(900);
  assert.ok(Math.abs(r.S.life - 29) < 1e-9);
  assert.deepEqual(r.frame().calendar, { years: 71, days: 182, continued: true });
  assert.deepEqual(r.frame().rules, { secondsPerYear: 900, battleLifeLoss: 0.05 });
});

test('battle defeat penalizes life once and the round consumes real world time', () => {
  const e = new Engine(); e.S.life = 30; e.S.cult = 10000; e.clock.elapsed = 900;
  e.taoStart(1); e.battle.pPh = 1; e.taoAct('guard');
  assert.equal(e.S.life, 30); e.tick(1.6);
  assert.ok(Math.abs(e.S.life - (25 - 1.6 / 900)) < 1e-9);
  assert.equal(st.lifeCap(e.S), 100); assert.equal(e.S.lifeLedger.damage, 5);
  assert.equal(e.S.taoCd, 30); assert.equal(e.S.buffs.shock, 60); assert.ok(e.S.cult < 10000);
  assert.equal(e.battle, null); assert.equal(e.clock.elapsed, 901.6);
  const after = e.serialize(); e.taoFinish(false); e.taoAct('guard');
  assert.deepEqual(e.serialize(), after); assert.equal(restore(e).S.life, e.S.life);
  for (const mode of ['win', 'flee']) {
    const r = new Engine(); r.taoStart(1);
    if (mode === 'win') { r.battle.eHp = 1; r.taoAct('strike'); r.tick(1.6); } else r.taoFlee();
    assert.equal(r.battle, null); assert.equal(r.S.lifeLedger?.damage || 0, 0);
  }
});

test('lethal automatic defeat ends immediately and rejects overlapping collection', t => {
  const e = quietClock(t); e.S.life = 1; e.taoStart(1); e.setBattleMode('auto');
  e.battle.pPh = 1; e.battle.eHp = e.battle.eMax = 100000;
  e.startHerb(); assert.equal(e.pending.herb, null);
  const materials = structuredClone(e.S.materials); e.tick(2);
  assert.equal(e.ended, true); assert.equal(e.S.life, 0); assert.equal(e.battle, null);
  assert.equal(e.panel.kind, 'end'); assert.deepEqual(e.S.materials, materials);
  const r = restore(e), snapshot = r.serialize();
  r.tick(60); dispatchAction(r, 'cultivate'); assert.deepEqual(r.serialize(), snapshot);
  dispatchAction(r, 'end:continue'); dispatchAction(r, 'end:continue');
  assert.equal(r.S.times, 1); assert.equal(r.beginOpen, true);
  r.beginPending = ['huo']; r.commitBegin(); assert.equal(r.S.life, 100); assert.equal(r.clock.elapsed, 0);
});

test('encounters resolve through real rounds with once-only victory or defeat', t => {
  for (const id of ['youshou', 'tongmen']) for (const mode of ['loss', 'win', 'retreat', 'lethal']) {
    const e = new Engine(); e.S.realmIdx = 1; e.S.life = mode === 'lethal' ? .5 : 100;
    t.mock.method(e, 'pickEncounter', () => GX.ENCOUNTERS.find(enc => enc.id === id));
    e.openEncounter();
    const act = mode === 'retreat' ? (id === 'youshou' ? 'retreat' : 'later') : id === 'youshou' ? 'fight' : 'accept';
    dispatchAction(e, `choice:${act}`);
    if (mode === 'retreat') { assert.equal(e.battle, null); assert.equal(e.S.life, 100); continue; }
    assert.equal(e.battle.source, 'encounter');
    if (mode === 'win') { e.battle.eHp = 1; e.battle.stats.speed = 999; }
    else e.battle.pPh = 1;
    e.taoAct(mode === 'win' ? 'strike' : 'guard'); e.tick(1.6);
    assert.equal(e.battle, null);
    assert.ok(Math.abs(e.S.lifeLedger.damage - (mode === 'win' ? 0 : mode === 'lethal' ? .5 - 1.6 / 900 : st.battleLifeLoss(e.S))) < 1e-9);
    assert.equal(e.ended, mode === 'lethal');
    const snapshot = e.serialize(); dispatchAction(e, `choice:${act}`); assert.deepEqual(e.serialize(), snapshot);
  }
});

test('secret battle restores exploration only on victory; lethal defeat retains end screen', t => {
  t.mock.method(Math, 'random', () => 0);
  for (const mode of ['loss', 'win', 'retreat', 'lethal']) {
    const e = new Engine(); e.S.life = mode === 'lethal' ? .5 : 100;
    e.openSecret(); e._secret.turn = 3; e._secret.completed = 2;
    dispatchAction(e, `choice:${mode === 'retreat' ? 'retreat' : 'fight'}`);
    if (mode !== 'retreat') {
      assert.equal(e.battle.source, 'secret');
      if (mode === 'win') { e.battle.eHp = 1; e.battle.stats.speed = 999; } else e.battle.pPh = 1;
      e.taoAct(mode === 'win' ? 'strike' : 'guard'); e.tick(1.6);
    }
    assert.equal(e.S.materials.heaven, ['win', 'retreat'].includes(mode) ? 1 : 0);
    assert.equal(e.ended, mode === 'lethal'); assert.equal(restore(e).ended, e.ended);
    if (mode === 'lethal') { assert.equal(e.S.life, 0); assert.equal(e.panel.kind, 'end'); }
  }
});

test('safe roaming grants materials without hidden combat or lifespan penalties', t => {
  t.mock.method(Math, 'random', () => .99);
  const e = quietClock(t); e.startRoam(); e.tick(45);
  assert.ok(Math.abs(e.S.life - 99.95) < 1e-9);
  assert.equal(e.pending.roam, null); assert.equal(e.clock.elapsed, 45);
  assert.equal(e.S.materials.earth, 1); assert.equal(e.S.buffs.shock, 0);
});

test('old live frames render with empty new inventories while retaining their server version and owned items', () => {
  const old = { v: 5, realmIdx: 0, root: 'huo', bld: { forge: 1 }, pills: { juli: 3 }, seen: { roots: { huo: 123 } } };
  const before = structuredClone(old), S = stateForDisplay(old);
  assert.equal(S.v, 5); assert.equal(S.seek, null); assert.equal(S.bld.forge, 1);
  assert.equal(S.pills.juli, 3); assert.equal(S.pills.zhuji_ren, 0);
  assert.equal(S.materials.herb, 0); assert.equal(S.relics.ren_huo, 0);
  assert.deepEqual(S.milestones, {}); assert.deepEqual(S.seen.tao, {});
  assert.doesNotThrow(() => { st.realmPlans(S); st.craftInfo(S, 'zhuji_ren'); st.shardCost(S, 1); });
  assert.deepEqual(old, before, 'display fallback must not migrate authoritative state');
  S.materials.herb = 20; S.pills.juli = 0;
  const next = stateForDisplay(old); assert.equal(next.materials.herb, 0); assert.equal(next.pills.juli, 3);
});

test('display compatibility preserves current quest progress and handles partial old inventories', () => {
  const S = st.freshState(); S.relics.di_jin = 1; S.seek.done.di_visit = true;
  S.seek.active = { step: 'di_survey_jin_0', remaining: 12 }; S.materials.herb = 7;
  assert.deepEqual(stateForDisplay(S), S);
  const old = { ...S, v: 8, seek: undefined, relics: { ren: 1, di: 0, tian: 0 } };
  const next = stateForDisplay(old);
  assert.equal(next.v, 8); assert.equal(next.seek, null); assert.equal(next.relics.ren, 1);
  assert.equal(next.relics.di_jin, 0); assert.equal(next.materials.herb, 7);
});

test('malformed messages and unknown item IDs cannot change the game', () => {
  const e = new Engine(), before = e.serialize();
  for (const raw of ['null', '[]', 'true', '2', '"act"', '{', '{}', '{"type":"act","act":null}']) {
    assert.equal(handleMessage(e, raw, () => assert.fail('unexpected reply')), false);
  }
  for (const action of ['pill:missing', 'pill:__proto__', 'craft:constructor', 'bld:toString',
    'forge:NaN', 'forge:0', 'forge:99', 'tao:0', 'tao:1.5', 'egg:missing', 'hatch:missing', 'choice:missing']) {
    assert.doesNotThrow(() => dispatchAction(e, action));
  }
  assert.deepEqual(e.serialize(), before);
  let reply;
  handleMessage(e, '{"type":"ping"}', message => { reply = message; });
  assert.deepEqual(reply, { type: 'pong' });
  handleMessage(e, '{"type":"act","act":"cultivate"}', () => {});
  assert.equal(e.S.clicks, 1);
});

test('begin, secret and end stages reject unrelated actions', () => {
  for (const stage of ['begin', 'secret', 'end']) {
    const e = new Engine();
    e.S.spirit = 10000; e.S.pills.juli = 1; e.S.bld.zhen = 1;
    if (stage === 'begin') e.openBegin('new');
    if (stage === 'secret') e.openSecret();
    if (stage === 'end') e.die('坐化');
    const before = e.serialize();
    for (const act of ['cultivate', 'herb', 'roam', 'med', 'bld:mine', 'pill:juli', 'tao:1']) dispatchAction(e, act);
    e.tick(20);
    assert.deepEqual(e.serialize(), before, stage);
  }
  const e = new Engine(); e.startMed(); e.startHerb(); e.startRoam(); e.openSecret();
  assert.deepEqual(e.pending, { herb: null, roam: null });
  assert.equal(e.panel, null);
});

test('fruit tribulation rechecks the current balance', () => {
  const e = new Engine(); e.S.realmIdx = 8; e.S.cult = st.layerNeed(e.S); e.doBreak();
  const before = e.serialize();
  dispatchAction(e, 'choice:fruit');
  assert.deepEqual(e.serialize(), before);
  e.S.daoFruit = st.tribFruitCost(e.S);
  dispatchAction(e, 'choice:fruit');
  assert.equal(e.S.layer, 1); assert.equal(e.S.daoFruit, 0);
  dispatchAction(e, 'choice:fruit');
  assert.equal(e.S.layer, 1);
});

test('forging and combat require the actual unlocks and equipment', () => {
  const e = new Engine(); e.S.shards.di = 100;
  dispatchAction(e, 'forge:4');
  assert.equal(e.S.treasure, null); assert.equal(e.S.shards.di, 100);
  e.S.bld.forge = 4; dispatchAction(e, 'forge:4');
  assert.equal(e.S.treasure.q, 4); assert.ok(e.S.shards.di < 100);
  e.S.treasure = null; e.taoStart(1);
  const before = e.serialize();
  for (const action of ['taoact:treasure', 'taoact:beast', 'taoact:pill_missing', 'taoact:missing']) dispatchAction(e, action);
  assert.deepEqual(e.serialize(), before);
  dispatchAction(e, 'taoact:strike'); assert.equal(e.battle.turn, 0); e.tick(1.6); assert.equal(e.battle.turn, 1);
});

test('end continuation is idempotent and permanent gains accumulate', () => {
  const e = new Engine(); e.S.times = 1; e.S.prestige = 20; e.S.daoHeart = 3;
  e.S.achieved.click_1000 = 123; e.startHerb(); e.encounterDelay = 1;
  dispatchAction(e, 'end:continue'); assert.equal(e.S.times, 1);
  e.die('坐化'); const gain = e.panel.data.gain;
  dispatchAction(e, 'end:continue');
  assert.equal(e.S.times, 2); assert.equal(e.S.prestige, 20 + gain);
  assert.equal(e.S.daoHeart, 3); assert.equal(e.S.achieved.click_1000, 123);
  assert.deepEqual(e.pending, { herb: null, roam: null }); assert.equal(e.encounterDelay, 0);
  const after = e.serialize(); dispatchAction(e, 'end:continue');
  assert.deepEqual(e.serialize(), after);
});

test('one xuan pill is consumed and dujie waits for tribulation', () => {
  const e = new Engine(); e.S.pills.xuan = 5; e.usePill('xuan');
  assert.equal(e.S.pills.xuan, 4); assert.equal(e.S._xuanActive, true);
  e.usePill('xuan'); assert.equal(e.S.pills.xuan, 4);
  e.S.pills.dujie = 2;
  const chance = st.tribChance(e.S, 'realm');
  e.usePill('dujie'); assert.equal(e.S.pills.dujie, 2); assert.equal(st.tribChance(e.S, 'realm'), chance);
  e.S.cult = st.layerNeed(e.S); e.doBreak();
  assert.equal(e.S.pills.dujie, 1); assert.equal(e.S._xuanActive, false);
});

test('shop refreshes balance, sold flags and immediately usable repeat rerolls', () => {
  const e = new Engine(); e.S.daoFruit = 100; e.openBegin('again');
  e.beginRerolls = 0;
  e.buyShop('reroll'); e.buyShop('reroll');
  assert.equal(e.frame().panel.data.rerolls, 2); assert.equal(e.S.daoFruit, 90);
  e.rerollBegin(); assert.equal(e.beginRerolls, 1);
  e.buyShop('pills');
  const d = e.frame().panel.data;
  assert.equal(d.fruit, 82); assert.equal(d.shop.find(x => x.id === 'pills').sold, true);
  e.buyShop('pills'); assert.equal(e.S.daoFruit, 82);
  const r = restore(e);
  assert.deepEqual(r.frame().panel, e.frame().panel);
  r.buyShop('pills'); assert.equal(r.S.daoFruit, 82);
  r.commitBegin(); assert.equal(r.S.pills.dujie, 1); assert.equal(r.S.pills.juli, 2);
  r.commitBegin(); assert.equal(r.S.pills.dujie, 1);
});

test('begin restoration retains root, rerolls and pending purchases', () => {
  const e = new Engine(); e.openBegin('new'); e.beginPending = 'shui'; e.beginRerolls = 1;
  e.S._pend = { constitution: { id: 'yangti', name: '阳寿之体', desc: '' } };
  e.S.lastTs = Date.now() - 3600000;
  const r = restore(e); assert.equal(r.offlineEarnings(), 0);
  assert.deepEqual(r.beginPending, ['shui']); assert.equal(r.beginRerolls, 1);
  assert.equal(r.beginOpen, true); r.commitBegin();
  assert.deepEqual(r.S.root, ['shui']); assert.equal(r.S.life, st.lifeCap(r.S));
});

test('active tasks and modal payloads survive restart; v9 parallel tasks are suspended', () => {
  const e = new Engine(); e.startHerb(); e.tick(2);
  let r = restore(e); assert.deepEqual(r.frame(), e.frame()); assert.equal(r.frame().pending.herb, 13);
  const legacy = e.serialize(); legacy.S.v = 9;
  legacy.runtime.pending.roam = { remaining: 43 };
  r.hydrate(legacy); assert.equal(r.pending.herb.remaining, 13); assert.equal(r.pending.roam, null);
  assert.deepEqual(r.suspended, [{ kind: 'roam', remaining: 43 }]);
  r.tick(13); r.resumeActivity('roam'); assert.equal(r.pending.roam.remaining, 43);
  r.tick(43); r.eventTimer = r.encTimer = -1e6; r.closePanel(); r.openSecret();
  const scene = restore(r); assert.deepEqual(scene.frame(), r.frame());
  scene.applySecretOption('exit'); assert.equal(scene.panel, null);
  const b = new Engine(); b.taoStart(1); b.setBattleMode('manual');
  assert.deepEqual(restore(b).frame(), b.frame());
  const tri = new Engine(); tri.S.realmIdx = 8; tri.S.cult = st.layerNeed(tri.S); tri.S.daoFruit = 5; tri.doBreak();
  r = restore(tri); r.applyTribOption('fruit'); assert.equal(r.S.layer, 1);
  const gf = new Engine(); gf.S.spirit = 1000; gf.buyGongfa();
  r = restore(gf); r.applyGongfaOption('taixuan1'); assert.deepEqual(r.S.gongfaBook, ['taixuan1']);
});

test('dead characters stay ended on reload and receive no tick or offline gains', () => {
  const e = new Engine(); e.S.bld.zhen = 1; e.S.life = 0; e.die('坐化');
  const r = restore(e), before = r.serialize(); r.tick(10); r.doCultivate();
  assert.deepEqual(r.serialize(), before);
  r.S.lastTs = Date.now() - 3600000; assert.equal(r.offlineEarnings(), 0); assert.equal(r.S.cult, 0);
  const legacy = st.freshState(); legacy.v = 5; legacy.life = 0;
  r.hydrate(legacy); assert.equal(r.ended, true); assert.equal(r.panel.kind, 'end');
});

test('legacy saves preserve selected books and recover unclaimed shop goods', () => {
  const legacy = st.freshState(); legacy.v = 5; legacy.gongfaLv = 2; legacy.gongfaBook = ['huangting1'];
  legacy._pend = { reroll: 1, pills: 1 };
  const e = new Engine(); e.hydrate(legacy);
  assert.equal(e.S.v, st.STATE_VERSION); assert.equal(e.S.gongfaLv, 2); assert.deepEqual(e.S.gongfaBook, ['huangting1']);
  assert.equal(e.beginOpen, true); assert.equal(e.beginRerolls, 4); assert.equal(e.shopBought.pills, true);
  e.commitBegin(); assert.equal(e.S.pills.dujie, 1);
  const old = st.freshState(); old.v = 3; old.life = 25; e.hydrate(old); assert.equal(e.S.life, 75);
});

test('all seven book tiers and final ascension achievement are reachable', () => {
  const e = new Engine(); e.S.spirit = 1e20;
  for (let i = 0; i < GX.GONGFA_TIERS.length; i++) {
    e.S.realmIdx = GX.GONGFA_TIERS[i].minRealm; syncLife(e.S);
    e.buyGongfa(); assert.equal(e.panel.data.tier, i);
    e.applyGongfaOption(GX.GONGFA_BOOKS[i][0].id);
    assert.equal(st.gongfaTierName(e.S), GX.GONGFA_TIERS[i].name);
  }
  assert.equal(e.S.gongfaLv, 8); assert.equal(e.S.gongfaBook.length, 7);
  const r = restore(e); assert.deepEqual(r.S.gongfaBook, e.S.gongfaBook);
  e.buyGongfa(); assert.equal(e.panel, null);
  e.S.realmIdx = 12; syncLife(e.S); e.S.layer = 9; e.S.cult = st.layerNeed(e.S); seedRealmRequirements(e); e.doBreak(); chooseProgression(e);
  assert.equal(e.ended, true); assert.ok(e.S.achieved.daluozheng);
  const after = restore(e); after.continueEnd(); assert.ok(after.S.achieved.daluozheng);
});

test('Chinese number formatting uses actual powers of ten', () => {
  for (const [n, text] of [[999,'999'],[1000,'1.00千'],[10000,'1.00万'],[1e6,'100万'],[1e8,'1.00亿'],[1e12,'1.00兆'],[1e16,'1.00京'],[-1e6,'-100万']]) assert.equal(fmt(n), text);
});

test('complete saves are written atomically and backup recovers a broken primary', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'xiuxian-regression-'));
  const file = path.join(dir, 'save.json'), e = new Engine(); e.openBegin('new');
  saveEngine(e, file);
  const r = new Engine(); assert.equal(loadSave(r, file), file); assert.deepEqual(r.frame(), e.frame());
  writeFileSync(file, '{');
  assert.equal(loadSave(r, file), `${file}.bak`); assert.deepEqual(r.frame(), e.frame());
  writeFileSync(`${file}.bak`, '{');
  const before = r.serialize(); assert.throws(() => loadSave(r, file));
  assert.deepEqual(r.serialize(), before); assert.equal(readFileSync(file, 'utf8'), '{');
  assert.throws(() => r.hydrate(null)); assert.throws(() => r.hydrate({})); assert.throws(() => r.hydrate({ realmIdx: 99 }));
});

test('risk options scale with daoHeart but never fall below the base', () => {
  const S = st.freshState();
  assert.equal(st.riskChance(S, 0.25, { daoScale: 0.02, cap: 0.55 }), 0.25);
  S.daoHeart = 10;
  assert.ok(Math.abs(st.riskChance(S, 0.25, { daoScale: 0.02, cap: 0.55 }) - 0.45) < 1e-9);
  S.daoHeart = 100;
  assert.equal(st.riskChance(S, 0.25, { daoScale: 0.02, cap: 0.55 }), 0.55);
  assert.ok(st.riskChance(S, 0.25, { daoScale: 0.02, cap: 0.55 }) >= 0.25);
});

test('cultivation combo and crit only scale a single click, never cultPerClick', () => {
  const e = new Engine(); e.eventTimer = e.encTimer = -1e9;
  e.openBegin('new'); e.beginPending = ['jin']; e.commitBegin();
  const base = st.cultPerClick(e.S);
  for (let i = 0; i < 5; i++) e.doCultivate();
  assert.equal(e.combo.n, 5);
  assert.equal(st.cultPerClick(e.S), base);
  e.combo.at = Date.now() - 10000;
  e.doCultivate();
  assert.equal(e.combo.n, 1);
  assert.equal(e.frame().combo.n, 1);
});

test('reincarnation captures legacy, offers three options and applies the chosen one', () => {
  const e = new Engine(); e.eventTimer = e.encTimer = -1e9;
  e.S.times = 1; e.S.realmIdx = 3; e.S.layer = 2;
  e.S.gongfaBook = ['taixuan1', 'yulei1', 'taixuan2', 'yulei2']; e.S.gongfaLv = 5;
  e.S.bld = { zhen: 8, mine: 6, beast: 4, furn: 2, forge: 3, altar: 5 };
  e.S.insight = 12;
  e.die('坐化'); dispatchAction(e, 'end:continue');
  assert.equal(e.beginOpen, true);
  const d = e.frame().panel.data;
  assert.deepEqual(d.legacy.map(o => o.id), ['gongfa', 'cave', 'insight']);
  assert.ok(d.legacy.every(o => !o.disabled)); assert.equal(d.legacyChoice, null);
  dispatchAction(e, 'legacychoose:cave'); assert.equal(e.frame().panel.data.legacyChoice, 'cave');
  dispatchAction(e, 'legacychoose:cave'); assert.equal(e.frame().panel.data.legacyChoice, null);
  dispatchAction(e, 'legacychoose:gongfa');
  e.commitBegin();
  assert.equal(e.S.gongfaBook.length, 2); assert.equal(e.S.gongfaLv, 3);
  assert.equal(e.S.bld.zhen, 0); assert.equal(e.S.insight, 0);
  assert.equal(e.legacy, null); assert.equal(e.legacyChoice, null);
  // 传承跨存读档保留
  const f = new Engine(); f.openBegin('again');
  f.legacy = { gongfaBook: [], bld: { zhen: 0 }, insight: 0 }; f.legacyChoice = 'insight';
  const g = new Engine(); g.hydrate(f.serialize());
  assert.deepEqual(g.legacy, f.legacy); assert.equal(g.legacyChoice, 'insight');
});

test('auto-cultivation is anchored to click value and gains a realm bonus clicks never get', () => {
  const mk = r => { const S = st.freshState(); S.realmIdx = r; S.bld.zhen = 9; return S; };
  const s0 = mk(0), s12 = mk(12);
  // 锚定点击值：10 份（1 基础 + 9 级）自动修炼 = 点击值 × AUTO_CULT_BASE × 10
  assert.ok(Math.abs(st.zhenRate(s0) - st.cultPerClick(s0) * GX.AUTO_CULT_BASE * 10) < 1e-6);
  // 与其它加成同源：自动化 / 点击值 恒为常数，功法参悟同时放大两者
  const g = mk(0); g.gongfaLv = 4; g.gongfaBook = ['taixuan1', 'yulei1', 'taixuan2'];
  assert.ok(Math.abs(st.zhenRate(g) / st.cultPerClick(g) - st.zhenRate(s0) / st.cultPerClick(s0)) < 1e-9);
  assert.ok(st.zhenRate(g) > st.zhenRate(s0) * 5);
  // 境界加成只作用于自动化：自动化增幅 = 点击增幅 × (1 + AUTO_REALM_BONUS × 12)
  const rClick = st.cultPerClick(s12) / st.cultPerClick(s0);
  const rAuto = st.zhenRate(s12) / st.zhenRate(s0);
  assert.ok(Math.abs(rAuto / rClick - (1 + GX.AUTO_REALM_BONUS * 12)) < 1e-9);
  // 占比随境界上升：后期产出重心转向自动化
  assert.ok(st.autoShare(s0) < 0.5 && st.autoShare(s12) > 0.5);
});

test('the cave banks auto-cultivation every tick, even with no 聚灵阵 level', () => {
  const e = new Engine(); e.eventTimer = e.encTimer = -1e9;
  e.S.bld.zhen = 0;
  const base = st.zhenRate(e.S), before = e.S.cult;
  assert.ok(base > 0);
  e.tick(1);
  assert.ok(Math.abs((e.S.cult - before) - base) < 1e-6);
  e.S.spirit = 1e9; e.buyBld('zhen');
  assert.equal(e.S.bld.zhen, 1);
  assert.ok(Math.abs(st.zhenRate(e.S) - base * 2) < 1e-6);
});
