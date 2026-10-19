import { addPills } from '../shared/inventory.js';
import { initLife } from '../shared/life.js';
import { safeChoice } from './progression-bot.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import Engine from '../server/engine.mjs';
import { GX } from '../shared/data.js';
import * as st from '../shared/state.js';
import { ELEMENTS, MUTANTS } from '../shared/roots.js';
import { SEEK_GRADES } from '../shared/relic-data.js';
import { seekSteps, stepInfo, foundationKit, kitIds, alignmentKey } from '../shared/relic-state.js';
import { dispatchAction } from '../server/protocol.mjs';

// Unit fixtures fund ordinary preparation; stage completion always uses public actions and ticks.
function fixture(root = ['jin']) {
  const e = new Engine(); e.S.root = root; e.S.layer = 9; e.S.insight = 6;
  e.S.gongfaBook = [GX.GONGFA_BOOKS[0][0].id]; e.S.gongfaLv = 2;
  e.S.cult = st.layerNeed(e.S); e.S.life = st.lifeCap(e.S);
  for (const id of Object.keys(e.S.materials)) e.S.materials[id] = 1000;
  addPills(e.S, 'huichun', 100); e.S.pills.juli = 100;
  e.eventTimer = e.encTimer = -1e6;
  return e;
}
function reload(e) { const r = new Engine(); r.hydrate(e.serialize()); return r; }
function tick(e, dt) { e.tick(dt); if (e.S.life < 20) e.usePill('huichun'); }
function advance(e, grade, stop = () => false) {
  for (let i = 0; i < 200 && !stop(e); i++) {
    if (e.S.seek.active) { tick(e, e.S.seek.active.remaining); continue; }
    const step = seekSteps(e.S, grade).find(s => stepInfo(e.S, s).ok);
    if (!step) {
      if (e.S.secretCd > 0) { tick(e, e.S.secretCd); continue; }
      break;
    }
    dispatchAction(e, `seek:${step.id}`);
    if (e.panel?.kind === 'seek') dispatchAction(e, `choice:pick${step.puzzle.answer}`);
  }
}
function through(e, grade, id) { advance(e, grade, e => !!e.S.seek.done[id]); assert.ok(e.S.seek.done[id], id); }
function fixedRandom(n, fn) { const old = Math.random; Math.random = () => n; try { return fn(); } finally { Math.random = old; } }

test('all 34 root sets have three complete safe routes; five roots also support each elemental route', () => {
  const sets = [...Array.from({ length: 31 }, (_, n) => ELEMENTS.filter((_, i) => (n + 1) & (1 << i))), ...MUTANTS.map(id => [id])];
  fixedRandom(.99, () => {
    for (const root of sets) for (const grade of Object.keys(SEEK_GRADES)) for (const mode of root.length === 5 ? ['five','elements'] : ['elements']) {
      let e = fixture(root); e.setSeekMode(`${grade}_${mode}`);
      advance(e, grade); e = reload(e);
      const kit = foundationKit(e.S, grade);
      assert.ok(kit.ok, `${root}/${grade}/${mode}: ${kit.requirements.filter(r => r.have < r.need).map(r => r.label)}`);
      assert.equal(kit.ids.length, mode === 'five' ? 1 : root.length);
      assert.ok(seekSteps(e.S, grade).every(s => e.S.seek.done[s.id]));
      const before = e.serialize(); for (const s of seekSteps(e.S, grade)) dispatchAction(e, `seek:${s.id}`);
      assert.deepEqual(e.serialize(), before, 'completed rewards cannot repeat');
    }
  });
});

test('matching grade, every element and completed alignment are all required; rejected breakthrough consumes nothing', () => {
  const e = fixture(['jin','huo']); e.S.pills.zhuji_di = 1;
  e.S.relics.di_jin = 1; e.S.relics.ren_huo = 1; e.S.relics.tian_huo = 1; e.S.relics.di_mu = 1;
  e.openRealm();
  const reject = () => { const before = e.serialize(); e.applyRealmOption('di'); assert.deepEqual(e.serialize(), before); };
  reject(); e.S.relics.di_huo = 1; reject();
  e.S.seek.aligned[alignmentKey(e.S, 'ren')] = true; reject();
  e.panel = null; e.seekAction('di_align'); assert.equal(e.S.seek.done.di_align, undefined);
  e.seekAction('di_jade'); assert.ok(e.S.seek.active); tick(e, 59); assert.equal(e.S.seek.jade.di, undefined); tick(e, 1);
  assert.equal(e.S.seek.jade.di, 1); e.seekAction('di_align'); assert.equal(e.S.seek.jade.di, 0);
  assert.equal(e.S.relics.di_jin, 1); assert.equal(e.S.relics.di_huo, 1);
  e.seekAction('di_align'); assert.equal(e.S.seek.jade.di, 0);
  e.S.relics.di_huo = 0; e.openRealm(); reject(); e.panel = null; e.S.relics.di_huo = 1;
  e.openRealm(); fixedRandom(.999, () => e.applyRealmOption('di'));
  assert.equal(e.S.foundation, null); assert.equal(e.S.pills.zhuji_di, 0);
  assert.ok(foundationKit(e.S, 'di').ok); assert.ok(reload(e).S.seek.aligned[alignmentKey(e.S, 'di')]);
  e.S.pills.zhuji_di = 1; e.S.cult = st.layerNeed(e.S); e.openRealm(); fixedRandom(0, () => e.applyRealmOption('di'));
  assert.equal(e.S.foundation, 'di'); for (const id of ['di_jin','di_huo']) assert.equal(e.S.relics[id], 0);
  for (const id of ['ren_huo','tian_huo','di_mu']) assert.equal(e.S.relics[id], 1);
});

test('each grade grants its own alignment jade; five-element substitutes never cover partial or mutant roots', () => {
  for (const root of [['jin'],['jin','huo'],['bing'],['lei'],['feng']]) {
    const e = fixture(root);
    for (const grade of Object.keys(SEEK_GRADES)) {
      e.S.relics[`${grade}_five`] = 1; e.setSeekMode(`${grade}_five`);
      assert.ok(!foundationKit(e.S, grade).ok); assert.equal(e.S.seek.modes[grade], undefined);
    }
  }
  const e = fixture(['jin','huo']);
  for (const grade of Object.keys(SEEK_GRADES)) {
    for (const id of kitIds(e.S, grade)) e.S.relics[id] = 1;
    assert.ok(!foundationKit(e.S, grade).ok); e.seekAction(`${grade}_jade`); tick(e, 60); e.seekAction(`${grade}_align`);
    assert.ok(foundationKit(e.S, grade).ok); assert.equal(e.S.seek.jade[grade], 0);
  }
  const five = fixture([...ELEMENTS]); five.S.relics.di_five = 1;
  assert.ok(foundationKit(five.S, 'di').ok); five.setSeekMode('di_elements'); assert.ok(!foundationKit(five.S, 'di').ok);
  five.setSeekMode('di_five'); assert.ok(foundationKit(five.S, 'di').ok);
});

test('wrong answers, exit and restart retain preparation; timers finish only their own stage', () => {
  let e = fixture(['tu']); through(e, 'di', 'di_tu_prep');
  const materials = structuredClone(e.S.materials), progress = structuredClone(e.S.seek.done);
  e.seekAction('di_tu_trial0'); assert.equal(e.panel.kind, 'seek');
  const snapshot = e.serialize(); tick(e, 40); assert.deepEqual(e.serialize(), snapshot, 'puzzle freezes world clock');
  e.applySeekOption('pick2'); assert.deepEqual(e.S.seek.done, progress); assert.deepEqual(e.S.materials, materials);
  const altered = e.serialize(); altered.runtime.panel.data.opts = []; const r = new Engine(); r.hydrate(altered);
  assert.equal(r.panel.data.opts.length, 4, 'restore authoritative choices');
  e = reload(r); e.applySeekOption('exit'); e.seekAction('di_tu_trial0'); e.applySeekOption('pick0');
  tick(e, 13); e = reload(e); assert.equal(e.S.seek.active.remaining, 27);
  e.pauseSeek(); assert.equal(e.S.seek.active, null); assert.deepEqual(e.S.materials, materials);
  e.seekAction('di_tu_trial0'); e.applySeekOption('pick0'); assert.equal(e.S.seek.active.remaining, 40);
  tick(e, 100); assert.equal(e.S.seek.active, null); assert.ok(e.S.seek.done.di_tu_trial0); assert.equal(e.S.seek.done.di_tu_trial1, undefined);
  assert.deepEqual(e.S.materials, materials);
});

test('quest fights reserve full cost, refund once on flee/loss, consume used pills and never award conquest loot', () => {
  let e = fixture(['tu']); through(e, 'di', 'di_survey_tu_11');
  const before = structuredClone(e.S.materials);
  e.S.materials.earth = 2; e.seekFight('di_tu_take'); assert.equal(e.battle, null); e.S.materials.earth = before.earth;
  e.seekFight('di_tu_take'); assert.equal(e.S.materials.earth, before.earth - 3); assert.equal(e.S.materials.essence, before.essence - 4);
  e = reload(e); const fleeLife = e.S.life; e.battle.pPh = 1; e.taoAct('pill_huichun'); tick(e, 1.6); assert.equal(e.S.pills.huichun, 99); e.taoFlee();
  assert.ok(Math.abs(e.S.life - (fleeLife - 1.6 / 900)) < 1e-9);
  assert.deepEqual(e.S.materials, before); e.taoFlee(); assert.deepEqual(e.S.materials, before);
  tick(e, 30); e.seekFight('di_tu_take'); const lossLife = e.S.life;
  e.battle.pPh = 1; e.taoAct('guard'); tick(e, 1.6);
  assert.ok(Math.abs(e.S.life - (lossLife - st.battleLifeLoss(e.S) - 1.6 / 900)) < 1e-9);
  const afterLoss = e.serialize(); e.taoFinish(false); assert.deepEqual(e.serialize(), afterLoss);
  assert.equal(e.battle, null); assert.deepEqual(e.S.materials, before); assert.equal(e.S.relics.di_tu, 0);
  e.startRecovery(); tick(e, 60); e.seekFight('di_tu_take'); e.setBattleMode('auto'); e.setCombatOption('autopills'); tick(e, 65);
  assert.equal(e.battle, null); assert.equal(e.S.relics.di_tu, 1); assert.ok(e.S.seek.done.di_tu_trial2);
  assert.equal(e.S.taoKills, 0); assert.deepEqual(e.S.seen.tao, {}); assert.equal(e.S.materials.origin_tu, before.origin_tu);
  assert.equal(e.S.materials.earth, before.earth - 3); const done = e.serialize(); e.taoFinish(true); e.seekFight('di_tu_take'); assert.deepEqual(e.serialize(), done);
});

test('lethal quest defeat refunds reserved materials without awarding the relic or losing the end screen', () => {
  const e = fixture(['tu']); through(e, 'di', 'di_survey_tu_11');
  const before = structuredClone(e.S.materials), progress = structuredClone(e.S.seek.done);
  e.S.life = 1; e.S.lifeLedger = null; initLife(e.S); e.seekFight('di_tu_take'); e.battle.pPh = 1; e.taoAct('guard'); tick(e, 1.6);
  assert.equal(e.S.life, 0); assert.equal(e.ended, true); assert.equal(e.panel.data.cause, '战败身陨');
  assert.equal(e.battle, null); assert.equal(e.S.relics.di_tu, 0);
  assert.deepEqual(e.S.materials, before); assert.deepEqual(e.S.seek.done, progress);
  const r = reload(e); assert.equal(r.ended, true); assert.equal(r.panel.kind, 'end');
  const snapshot = r.serialize(); r.taoFinish(false); r.tick(30); assert.deepEqual(r.serialize(), snapshot);
});

test('real actions cannot skip stages, change mode during work, overlap meditations or spend through stale UI', () => {
  const e = fixture(['jin']); e.S.layer = 2;
  const before = e.serialize();
  for (const act of ['seek:ren_visit','seek:ren_tu_take','seekfight:di_jin_take','seek:constructor','seek:__proto__','seekmode:di_five','seekmode:di_elements_extra','choice:pick0']) dispatchAction(e, act);
  assert.deepEqual(e.serialize(), before);
  e.S.layer = 9; e.seekAction('ren_visit'); e.seekAction('ren_escort1');
  const work = e.serialize(); for (const act of ['seekmode:ren_elements','med','secret','break','tao:1','seek:ren_care']) dispatchAction(e, act);
  assert.deepEqual(e.serialize(), work);
  e.pauseSeek(); e.S.materials.earth = 1; e.seekAction('ren_jin_supply'); assert.ok(!e.S.seek.done.ren_jin_supply);
  e.S.materials.earth = 2; e.seekAction('ren_jin_supply'); assert.equal(e.S.materials.earth, 0);
  const paid = e.serialize(); e.seekAction('ren_jin_supply'); assert.deepEqual(e.serialize(), paid);
});

test('v8 stocks convert once without minting new relics or bypassing required manuals', () => {
  for (const root of [['jin'], [...ELEMENTS]]) {
    const old = fixture(root); old.S.v = 8; delete old.S.seek;
    old.S.materials.vein_jade = 12; old.S.materials.dao_page = 0;
    for (const id of ELEMENTS) old.S.materials[`origin_${id}`] = 3;
    const e = new Engine(); e.hydrate(old.serialize());
    assert.equal(e.S.v, st.STATE_VERSION); assert.equal(e.S.seek.converted.vein_jade, 12); assert.ok(Object.values(e.S.relics).every(n => n === 0));
    assert.ok(!stepInfo(e.S, seekSteps(e.S, 'tian').find(s => s.id === (root.length === 5 ? 'tian_five_ritual0' : 'tian_jin_prep'))).ok);
    assert.deepEqual(reload(e).serialize(), e.serialize());
    fixedRandom(.99, () => advance(e, 'tian')); assert.ok(foundationKit(e.S, 'tian').ok);
  }
  const old = fixture(['huo']); old.S.v = 8; delete old.S.seek; old.S.relics.tian = 1;
  const e = new Engine(); e.hydrate(old.serialize()); assert.deepEqual(kitIds(e.S, 'tian'), ['tian']); assert.ok(foundationKit(e.S, 'tian').ok);
  e.S.pills.zhuji_tian = 1; e.openRealm(); fixedRandom(0, () => e.applyRealmOption('tian')); assert.equal(e.S.foundation, 'tian'); assert.equal(e.S.relics.tian, 0);
  e.S.realmIdx = 3; e.S.layer = 9; e.S.foundation = 'ren'; e.doPrestige();
  assert.equal(e.beginOpen, true); assert.deepEqual(e.S.seek, st.freshState().seek); assert.ok(Object.values(e.S.relics).every(n => n === 0));
});

test('malformed or conflicting quest saves are rejected atomically', () => {
  const e = fixture(['jin']); const initial = e.serialize();
  for (const mutate of [
    s => { s.S.seek.done.ren_jin_take = false; }, s => { s.S.seek.done.ren_lei_take = true; },
    s => { s.S.seek.jade.di = -1; }, s => { s.S.seek.modes.di = 'five'; },
    s => { s.S.seek.aligned.di_jin_huo = true; },
    s => { s.S.seek.active = { step: 'di_jin_trial0', remaining: 40 }; },
    s => { s.runtime.panel = { kind: 'seek', data: { stepId: 'di_jin_trial0' } }; },
  ]) { const bad = structuredClone(initial); mutate(bad); assert.throws(() => e.hydrate(bad)); assert.deepEqual(e.serialize(), initial); }
  e.seekAction('ren_visit'); e.seekAction('ren_escort1'); const active = e.serialize();
  for (const remaining of [0, -1, 46, '30']) { const bad = structuredClone(active); bad.S.seek.active.remaining = remaining; assert.throws(() => e.hydrate(bad)); }
  e.pauseSeek(); through(e, 'di', 'di_survey_jin_11'); e.seekFight('di_jin_take'); const fighting = e.serialize();
  for (const mutate of [s => { s.runtime.battle.reserved.materials.earth = 99; }, s => { s.runtime.battle.e.atk = 1; }, s => { s.runtime.battle.pPh = -1; }]) {
    const bad = structuredClone(fighting); mutate(bad); assert.throws(() => e.hydrate(bad)); assert.deepEqual(e.serialize(), fighting);
  }
});

test('every trial fight step also offers a steady path, so no main-line material is gated behind battle', () => {
  for (const root of [['jin'], ['jin','huo'], ['tu'], ['bing'], [...ELEMENTS]]) {
    const e = fixture(root);
    for (const grade of Object.keys(SEEK_GRADES)) for (const step of seekSteps(e.S, grade)) if (step.fight)
      assert.equal(step.duration, GX.SEEK_TRIAL.steady[grade], `${step.id} 缺少稳妥取物时长`);
  }
});

test('steady retrieval walks preparation plus puzzles and an idle timer, and never fights', () => {
  const e = fixture(['tu']);
  const before = structuredClone(e.S.materials);
  through(e, 'di', 'di_tu_take');
  assert.equal(e.S.relics.di_tu, 1);
  assert.ok(e.S.seek.done.di_tu_prep && e.S.seek.done.di_tu_trial2, '稳妥路径仍要走完备物与勘读');
  assert.equal(e.S.materials.earth, before.earth - 6, '稳妥取物按备物全额消耗');
  assert.equal(e.S.materials.essence, before.essence - 8);
  assert.equal(e.S.taoKills, 0, '稳妥路径不产生讨伐战绩');
});

test('the fight shortcut skips preparation, costs half the reserves and pays trial loot', () => {
  const e = fixture(['tu']); through(e, 'di', 'di_survey_tu_11');
  const before = structuredClone(e.S.materials), shards = { ...e.S.shards };
  e.seekFight('di_tu_take'); assert.ok(e.battle);
  e.setBattleMode('auto'); e.setCombatOption('autopills'); tick(e, 65);
  assert.equal(e.battle, null); assert.equal(e.S.relics.di_tu, 1);
  assert.ok(e.S.seek.done.di_tu_prep, '战斗胜利一并解锁整条试炼链');
  assert.equal(e.S.materials.earth, before.earth - 3, '战斗捷径只消耗半数封存材料');
  assert.equal(e.S.materials.essence, before.essence - 4);
  assert.equal(e.S.materials.heaven, before.heaven + 1, '试炼之赏：天灵晶');
  assert.equal(e.S.shards[GX.SEEK_TRIAL.loot.di.shard], shards[GX.SEEK_TRIAL.loot.di.shard] + GX.SEEK_TRIAL.shardN);
  assert.ok(e.S.cult > 0);
});

test('modern activities yield ordinary materials but no obsolete survey credits, origins or random manuals', () => {
  const e = new Engine(); e.eventTimer = e.encTimer = -1e6;
  e.startHerb(); tick(e, 15); e.startRoam(); fixedRandom(.99, () => e.tick(45));
  assert.equal(e.S.materials.herb_age, 1); assert.equal(e.S.materials.vein_jade, 0); assert.equal(e.S.materials.earth, 1);
  e.S.pills.juli = 20; addPills(e.S, 'huichun', 20); e.taoStart(1);
  e.setBattleMode('auto'); e.tick(60);
  assert.equal(e.S.taoKills, 1); assert.equal(e.S.materials.origin_jin, 0);
  e.openSecret(); for (let i = 0; i < 3; i++) e.applySecretOption(safeChoice(e).id);
  assert.equal(e.S.materials.heaven, 1); assert.equal(e.S.materials.dao_page, 0);
});
