import { safeChoice } from './progression-bot.mjs';
import { pillMaterials } from '../shared/inventory.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import Engine from '../server/engine.mjs';
import { GX } from '../shared/data.js';
import * as st from '../shared/state.js';
import { kitIds } from '../shared/relic-state.js';
import { ELEMENTS, MUTANTS } from '../shared/roots.js';
import { dispatchAction } from '../server/protocol.mjs';
import { seedRealmRequirements, prepareProgression, chooseProgression } from './progression-bot.mjs';

function random(value, fn) { const old = Math.random; Math.random = () => value; try { return fn(); } finally { Math.random = old; } }
function ready(realm = 0, route = 'tian') {
  const e = new Engine(); e.S.realmIdx = realm; e.S.layer = 9;
  e.S.cult = st.layerNeed(e.S); seedRealmRequirements(e, route);
  return e;
}

test('all 31 five-element subsets and three exclusive mutants can be drawn without duplicates', () => {
  for (const value of [0, .5, .999999]) random(value, () => {
    const roots = st.rollRoots(st.freshState(), 99);
    assert.equal(roots.length, 34);
    assert.equal(new Set(roots.map(r => r.join(','))).size, 34);
    for (const root of roots) {
      assert.ok(st.validRoot(root));
      assert.equal(root.length, new Set(root).size);
      if (root.some(id => MUTANTS.includes(id))) assert.equal(root.length, 1);
      else assert.ok(root.every(id => ELEMENTS.includes(id)));
    }
    assert.ok(roots.some(r => r.length === 5));
  });
  assert.deepEqual(st.rollRoots(st.freshState(), 0), []);
  for (const root of [[], ['jin', 'jin'], ['bing', 'shui'], ['lei', 'feng'], ['yinyang', 'jin'], '__proto__']) assert.equal(st.validRoot(root), false);
});

test('mixed roots combine scaled benefits and five elements gain harmony', () => {
  const S = st.freshState(); S.root = ['shui', 'huo'];
  assert.ok(st.lifeCap(S) > 100); assert.ok(st.lifeCap(S) < 120);
  assert.ok(st.pillCost(S, 'juli') < 20); assert.ok(st.pillCost(S, 'juli') > 14);
  const mixed = st.cultPerClick(S); S.root = ['shui']; assert.ok(st.cultPerClick(S) > mixed);
  S.root = [...ELEMENTS]; const fx = st.rootFx(S);
  for (const id of ['life', 'pill', 'build', 'forge', 'shard', 'egg', 'luck', 'trib', 'cult']) assert.ok(fx[id] > 0, id);
  assert.match(st.rootProfile(S.root).name, /五灵根/);
  for (const id of MUTANTS) assert.equal(st.rootProfile([id]).type, '变异单灵根');
  S.root = ['bing']; assert.equal(st.lifeCap(S), 115); assert.ok(st.tribChance(S, 'realm') > .6);
});

test('legacy roots and attained realms migrate once, including previously unknown version', () => {
  for (const root of ['jin', 'yinyang', 'tiandao']) {
    const old = st.freshState(); old.v = 6; old.root = root; old.realmIdx = 5; old.cult = 1234;
    const e = new Engine(); e.hydrate(old);
    assert.deepEqual(e.S.root, [root]); assert.equal(e.S.foundation, 'legacy');
    assert.equal(e.S.realmIdx, 5); assert.equal(e.S.cult, 1234);
    assert.equal(Object.keys(e.S.milestones).length, 5);
    assert.ok(e.S.insight >= 7); assert.equal(st.foundationCapped(e.S), false);
    const snapshot = e.serialize(); const r = new Engine(); r.hydrate(snapshot);
    assert.deepEqual(r.serialize(), snapshot);
    if (GX.ROOTS[root].legacy) {
      e.markSeen('roots', root, GX.ROOTS[root].name);
      assert.equal(st.codexTotal(e.S), st.codexTotal() + 1);
    }
  }
  const e = new Engine(); e.hydrate({ realmIdx: 1, layer: 2, cult: 9, root: 'mu' });
  assert.equal(e.S.foundation, 'legacy');
  const oldBegin = new Engine(); oldBegin.openBegin('new'); oldBegin.beginPending = ['jin', 'shui', 'huo'];
  const r = new Engine(); r.hydrate(oldBegin.serialize()); assert.deepEqual(r.frame(), oldBegin.frame());
});

test('invalid root mixtures, negative materials and stale realm panels cannot hydrate', () => {
  const e = new Engine(), before = e.serialize();
  for (const mutation of [
    s => { s.S.root = ['bing', 'jin']; }, s => { s.S.materials.herb = -1; },
    s => { s.S.foundation = 'unknown'; }, s => { s.S.realmFails = 1.2; },
    s => { s.runtime.panel = { kind: 'realm', data: { realmIdx: 3 } }; },
  ]) { const bad = structuredClone(before); mutation(bad); assert.throws(() => e.hydrate(bad)); assert.deepEqual(e.serialize(), before); }
});

test('materials are guaranteed from activities; secret crystals require three completed rounds', () => {
  const e = new Engine(); e.S.realmIdx = 11; e.S.life = st.lifeCap(e.S);
  e.eventTimer = e.encTimer = -1e6; e.startHerb(); e.tick(15); e.startRoam(); random(.99, () => e.tick(45));
  assert.equal(e.S.materials.herb, 3); assert.equal(e.S.materials.essence, 2);
  assert.equal(e.S.materials.earth, 1); assert.equal(e.S.materials.soul, 1);
  assert.equal(e.S.materials.void, 1); assert.equal(e.S.materials.immortal, 1); assert.equal(e.S.materials.dao, 1);
  assert.equal(e.ended, false); assert.ok(Math.abs(e.S.life - (st.lifeCap(e.S) - 60 * GX.LIFE_PER_SEC)) < 1e-8);
  e.openSecret(); e.applySecretOption('exit'); assert.equal(e.S.materials.heaven, 0);
  e.S.secretCd = 0; e.openSecret();
  for (let i = 0; i < 3; i++) e.applySecretOption(safeChoice(e).id);
  assert.equal(e.S.materials.heaven, 1);
  e.startMed(); e.tick(60); assert.equal(e.S.insight, 0);
  e.tick(60); assert.equal(e.S.insight, 1); e.tick(60); assert.equal(e.S.insight, 1);
});

test('every recipe and prerequisite unlocks before its realm transition', () => {
  for (const gate of GX.BREAKTHROUGHS) {
    const S = st.freshState(); S.realmIdx = gate.to - 1;
    assert.ok(gate.book <= st.gongfaMaxLv(S), gate.name);
    const pills = gate.to === 1 ? Object.values(GX.FOUNDATIONS).map(f => f.pill) : [gate.pill];
    for (const id of pills) {
      const p = GX.PILLS[id]; assert.ok(p.minRealm <= S.realmIdx);
      for (const key of Object.keys(p.materials)) assert.ok(GX.MATERIALS[key].minRealm <= S.realmIdx, `${id}:${key}`);
    }
  }
});

test('crafting rechecks furnace, unlock, spirit and every material before atomic consumption', () => {
  for (const [id, p] of Object.entries(GX.PILLS).filter(([, p]) => p.breakthrough)) {
    const e = new Engine(); e.S.realmIdx = p.minRealm; e.S.spirit = 1e12; e.S.bld.furn = p.furnace;
    Object.assign(e.S.materials, p.materials);
    for (const key of Object.keys(p.materials)) {
      e.S.materials[key]--; const before = e.serialize(); e.craftPill(id); assert.deepEqual(e.serialize(), before); e.S.materials[key]++;
    }
    e.S.bld.furn--; let before = e.serialize(); e.craftPill(id); assert.deepEqual(e.serialize(), before); e.S.bld.furn++;
    const cost = st.pillCost(e.S, id); e.S.spirit = cost - 1;
    before = e.serialize(); e.craftPill(id); assert.deepEqual(e.serialize(), before);
    e.S.spirit = cost; e.craftPill(id); assert.equal(e.S.pills[id], 1); assert.equal(e.S.spirit, 0);
    for (const key of Object.keys(p.materials)) assert.equal(e.S.materials[key], 0);
    e.usePill(id); assert.equal(e.S.pills[id], 1);
  }
  const e = new Engine(); e.S.spirit = 10000;
  const before = e.serialize(); for (const id of ['soul', 'void', 'missing', '__proto__']) e.buyMaterial(id);
  assert.deepEqual(e.serialize(), before);
  e.buyMaterial('herb'); assert.equal(e.S.materials.herb, 1); assert.equal(e.S.spirit, 9988);
});

test('all thirteen major gates reject each missing requirement, recheck current state and consume exactly once', () => {
  for (let realm = 0; realm < 13; realm++) {
    for (const missing of ['cult', 'layer', 'gongfaLv', 'pill', ...(realm ? ['insight'] : ['relic'])]) {
      const e = ready(realm), plan = st.realmPlans(e.S).find(p => p.id === (realm ? 'advance' : 'tian'));
      e.openRealm();
      if (missing === 'pill') e.S.pills[plan.pill] = 0;
      else if (missing === 'relic') e.S.relics[plan.relicItems[0]] = 0;
      else e.S[missing] = 0;
      const before = e.serialize(); dispatchAction(e, `choice:${plan.id}`);
      assert.deepEqual(e.serialize(), before, `${realm}:${missing}`);
      assert.equal(e.frame().panel.data.opts.find(o => o.id === plan.id).disabled, true);
    }
    const e = ready(realm), plan = st.realmPlans(e.S).find(p => p.id === (realm ? 'advance' : 'tian'));
    e.openRealm(); const r = new Engine(); r.hydrate(e.serialize()); assert.deepEqual(r.frame(), e.frame());
    const insight = r.S.insight, books = [...r.S.gongfaBook];
    random(0, () => dispatchAction(r, `choice:${plan.id}`));
    assert.equal(r.S.pills[plan.pill], 0); assert.equal(r.S.cult, 0);
    if (plan.relic) for (const id of plan.relicItems) assert.equal(r.S.relics[id], 0);
    assert.equal(r.S.insight, insight); assert.deepEqual(r.S.gongfaBook, books);
    assert.ok(r.S.milestones[realm + 1]); assert.equal(r.S.realmIdx, Math.min(12, realm + 1));
    const after = r.serialize(); dispatchAction(r, `choice:${plan.id}`); assert.deepEqual(r.serialize(), after);
  }
});

test('failed major breakthroughs consume one pill, retain milestones and allow a different foundation on retry', () => {
  const e = ready(0, 'ren'); e.S.pills.dujie = 1;
  const cult = e.S.cult; e.openRealm(); random(.999, () => e.applyRealmOption('ren'));
  assert.equal(e.S.realmIdx, 0); assert.equal(e.S.foundation, null); assert.equal(e.S.realmFails, 1);
  assert.equal(e.S.pills.zhuji_ren, 0); assert.equal(e.S.pills.dujie, 0);
  assert.equal(e.S.relics.ren_jin, 1);
  assert.equal(e.S.cult, Math.floor(cult * .7)); assert.deepEqual(e.S.milestones, {});
  e.S.cult = cult; e.S.pills.zhuji_tian = 1; e.S.relics.tian_jin = 1;
  const base = ready(); assert.ok(st.realmPlans(e.S)[2].chance > st.realmPlans(base.S)[2].chance);
  e.openRealm(); random(0, () => e.applyRealmOption('tian'));
  assert.equal(e.S.foundation, 'tian'); assert.equal(e.S.realmFails, 0);
  assert.equal(e.S.relics.tian_jin, 0); assert.equal(e.S.relics.ren_jin, 1);
  const f = e.S.foundation; e.S.pills.zhuji_di = 1; e.usePill('zhuji_di'); assert.equal(e.S.foundation, f);
});

test('foundation caps block direct and protocol ascension, unlock first-life reincarnation, and reset the foundation', () => {
  for (const [id, cap] of [['ren', 3], ['di', 8]]) {
    const e = ready(cap); e.S.foundation = id;
    assert.equal(st.foundationCapped(e.S), true); assert.equal(st.breakInfo(e.S).ok, false);
    assert.ok(st.prestigeGain(e.S) > 0); e.openRealm();
    const before = e.serialize(); e.applyRealmOption('advance'); assert.deepEqual(e.serialize(), before);
    e.closePanel(); dispatchAction(e, 'prepare'); dispatchAction(e, 'choice:advance');
    assert.equal(e.S.realmIdx, cap);
    e.doPrestige(); assert.equal(e.beginOpen, true); assert.equal(e.S.times, 1);
    assert.equal(e.S.foundation, null); assert.equal(e.S.insight, 0); assert.deepEqual(e.S.milestones, {});
    assert.ok(Object.values(e.S.materials).every(n => n === 0));
  }
  const low = new Engine(); dispatchAction(low, 'prepare'); dispatchAction(low, 'choice:tian');
  assert.equal(low.S.realmIdx, 0);
  for (const realm of [8, 12]) {
    const e = new Engine(); e.S.realmIdx = realm; e.S.layer = 9;
    dispatchAction(e, 'prepare'); dispatchAction(e, 'choice:advance');
    assert.equal(e.S.realmIdx, realm); assert.equal(e.ended, false);
  }
});

test('foundation bonuses increase without changing roots and later pills cannot change the chosen cap', () => {
  const outcomes = [];
  for (const id of Object.keys(GX.FOUNDATIONS)) {
    const e = ready(0, id); e.openRealm(); random(0, () => e.applyRealmOption(id));
    assert.equal(e.S.foundation, id);
    outcomes.push([st.cultPerClick(e.S), st.lifeCap(e.S), st.tribChance(e.S, 'realm')]);
    e.S.pills.zhuji_tian = 3; e.openRealm(); e.applyRealmOption('tian');
    assert.equal(e.S.foundation, id); assert.equal(e.S.pills.zhuji_tian, 3);
  }
  for (let i = 0; i < 3; i++) assert.ok(outcomes[0][i] < outcomes[1][i] && outcomes[1][i] < outcomes[2][i]);
});

test('zero-progress reincarnation cannot grant prestige or reroll a life, including after a valid rebirth', () => {
  for (const times of [0, 1, 20]) for (const layer of [0, 9]) {
    const e = new Engine(); e.S.times = times; e.S.layer = layer; e.S.prestige = 25;
    const before = structuredClone(e.S);
    for (let i = 0; i < 5; i++) {
      assert.equal(st.prestigeGain(e.S), 0);
      dispatchAction(e, 'prestige'); dispatchAction(e, 'begincommit'); dispatchAction(e, 'end:continue');
    }
    assert.deepEqual(e.S, before); assert.equal(e.beginOpen, false); assert.equal(e.beginPending, null);
    e.die('坐化'); assert.equal(e.panel.data.gain, 0); e.continueEnd();
    assert.equal(e.S.prestige, 25); assert.equal(e.S.daoFruit, 0);
  }
  const e = ready(3); e.S.foundation = 'ren'; e.S.relics.di = 1; e.S.materials.dao_page = 8;
  const reward = st.prestigeGain(e.S); e.openRealm(); dispatchAction(e, 'choice:rebirth');
  assert.ok(reward > 0); assert.equal(e.S.prestige, reward); assert.equal(e.S.times, 1);
  assert.ok(Object.values(e.S.relics).every(n => n === 0)); assert.equal(e.S.materials.dao_page, 0);
  e.commitBegin(); const before = structuredClone(e.S);
  for (let i = 0; i < 5; i++) { e.doPrestige(); e.commitBegin(); }
  assert.deepEqual(e.S, before); assert.equal(e.beginOpen, false);
  e.S.realmIdx = 1; e.S.foundation = 'di'; e.doPrestige(); assert.equal(e.S.times, 2);
});

test('bound materials cannot be purchased; relic fusion checks ingredients, insight and consumes atomically once', () => {
  const e = new Engine(); e.S.spirit = 1e20;
  const before = e.serialize();
  for (const [id, m] of Object.entries(GX.MATERIALS)) if (m.bound) dispatchAction(e, `material:${id}`);
  for (const id of ['missing', '__proto__', 'constructor']) dispatchAction(e, `relic:${id}`);
  assert.deepEqual(e.serialize(), before);
  for (const [id, r] of Object.entries(GX.FOUNDATION_RELICS)) {
    const f = new Engine(); f.S.root = ['yinyang']; Object.assign(f.S.materials, r.materials); f.S.insight = r.insight;
    for (const key of Object.keys(r.materials)) {
      f.S.materials[key]--; const snap = f.serialize(); dispatchAction(f, `relic:${id}`);
      assert.deepEqual(f.serialize(), snap); f.S.materials[key]++;
    }
    if (r.insight) {
      f.S.insight--; const snap = f.serialize(); f.forgeRelic(id); assert.deepEqual(f.serialize(), snap); f.S.insight++;
    }
    f.S.realmIdx = 1; f.S.foundation = 'ren';
    const fixed = f.serialize(); f.forgeRelic(id); assert.deepEqual(f.serialize(), fixed);
    f.S.realmIdx = 0; f.S.foundation = null;
    dispatchAction(f, `relic:${id}`); assert.equal(f.S.relics[id], 1); assert.equal(f.S.insight, r.insight);
    assert.equal(f.S.spirit, 0);
    for (const key of Object.keys(r.materials)) assert.equal(f.S.materials[key], 0);
    Object.assign(f.S.materials, r.materials);
    const fused = f.serialize(); dispatchAction(f, `relic:${id}`); assert.deepEqual(f.serialize(), fused);
  }
});

test('legacy root sources retain bound drops and award once per completion', () => {
  const e = new Engine(); e.S.root = ['yinyang']; e.S.layer = 9;
  e.S.treasure = { q: 4, type: 'sword', words: {} };
  e.S.beasts.di = 5; e.eventTimer = e.encTimer = -1e6;
  e.startHerb(); e.tick(15); e.startRoam(); e.tick(45);
  assert.equal(e.S.materials.herb_age, 1); assert.equal(e.S.materials.vein_jade, 1);
  for (let node = 1; node <= 5; node++) {
    e.startRecovery(); e.tick(60); e.taoStart(node); e.setBattleMode('auto'); e.tick(65);
    assert.equal(e.battle, null);
    const key = Object.keys(GX.MATERIALS).find(id => GX.MATERIALS[id].node === node);
    assert.equal(e.S.materials[key], 1); assert.ok(e.S.seen.tao[node]); assert.equal(e.S.taoKills, node);
    const done = e.serialize(); e.taoFinish(true); assert.deepEqual(e.serialize(), done);
  }
  const seen = structuredClone(e.S.seen.tao), materials = structuredClone(e.S.materials);
  e.tick(30); e.taoStart(1); e.taoFlee(); assert.deepEqual(e.S.materials, materials);
  e.tick(30); e.taoStart(1); e.setBattleMode('auto'); e.tick(60);
  assert.equal(e.S.materials.origin_jin, 2); assert.deepEqual(e.S.seen.tao, seen);
  for (let rounds = 0; rounds < 3; rounds++) {
    e.S.secretCd = 0; e.openSecret();
    for (let n = 0; n < rounds; n++) e.applySecretOption(safeChoice(e).id);
    e.applySecretOption('exit'); assert.equal(e.S.materials.dao_page, 0);
  }
  e.S.secretCd = 0; e.openSecret();
  for (let n = 0; n < 3; n++) e.applySecretOption(safeChoice(e).id);
  assert.equal(e.S.materials.dao_page, 1);
  const done = e.serialize(); e.applySecretOption('exit'); e.secretFinish(); assert.deepEqual(e.serialize(), done);
});

test('v7 preserves chosen caps and pills, backfills only proven conquest wins, and does not invent relics', () => {
  for (const [max, boss, priorSeen, expected] of [
    [1, 0, {}, []], [3, 0, {}, ['1', '2']], [5, 0, {}, ['1', '2', '3', '4']],
    [5, 1, {}, ['1', '2', '3', '4', '5']], [1, 0, { 5: 123 }, ['1', '2', '3', '4', '5']],
  ]) for (const route of ['ren', 'di', 'tian']) {
    const old = st.freshState(); old.v = 7; old.realmIdx = 2; old.foundation = route;
    old.taoMax = max; old.taoBoss = boss; old.seen.tao = priorSeen;
    old.pills.zhuji_tian = 2; old.materials.herb = 19; delete old.relics;
    const e = new Engine(); e.hydrate(old);
    assert.equal(e.S.v, st.STATE_VERSION); assert.equal(e.S.foundation, route); assert.equal(e.S.realmIdx, 2);
    assert.equal(e.S.pills.zhuji_tian, 2); assert.equal(e.S.materials.herb, 19);
    assert.ok(Object.values(e.S.relics).every(n => n === 0)); assert.equal(e.S.materials.origin_tu, 0);
    assert.deepEqual(Object.keys(e.S.seen.tao), expected);
    if (priorSeen[5]) assert.equal(e.S.seen.tao[5], 123);
    const r = new Engine(); r.hydrate(e.serialize()); assert.deepEqual(r.serialize(), e.serialize());
  }
  const pre = ready(); pre.S.v = 7; delete pre.S.relics;
  const e = new Engine(); e.hydrate(pre.S); e.openRealm();
  assert.equal(e.frame().panel.data.opts.find(o => o.id === 'tian').disabled, true);
  e.applyRealmOption('tian'); assert.equal(e.S.realmIdx, 0); assert.equal(e.S.pills.zhuji_tian, 1);
  for (const count of [-1, .5, Number.MAX_SAFE_INTEGER + 1]) {
    const bad = e.serialize(); bad.S.relics.ren = count; assert.throws(() => new Engine().hydrate(bad));
  }
});

test('pill recipes above the lifelong cap are blocked early, while ordinary consumables and final heaven pill work', () => {
  for (const [foundation, realm, pill] of [['ren', 1, 'huashen'], ['ren', 3, 'huashen'], ['di', 8, 'shengxian']]) {
    const e = new Engine(); e.S.realmIdx = realm; e.S.foundation = foundation;
    e.S.spirit = 1e30; e.S.bld.furn = 100; Object.assign(e.S.materials, GX.PILLS[pill].materials);
    assert.match(st.pillBlockReason(e.S, pill), /道基上限/);
    const before = e.serialize(); dispatchAction(e, `craft:${pill}`); assert.deepEqual(e.serialize(), before);
    Object.assign(e.S.materials, pillMaterials(e.S, 'huichun')); e.craftPill('huichun'); assert.equal(e.S.pills.huichun, 1);
  }
  const e = ready(12); e.S.foundation = 'tian'; e.S.pills.zhengdao = 0;
  e.S.spirit = 1e30; e.S.bld.furn = 4; Object.assign(e.S.materials, GX.PILLS.zhengdao.materials);
  e.craftPill('zhengdao'); assert.equal(e.S.pills.zhengdao, 1);
  assert.match(st.pillBlockReason(e.S, 'zhuji_tian'), /已完成/);
});

test('all foundation objects are attainable in a first life with mixed roots using real actions and two clicks per second', () => {
  const old = Math.random;
  try {
    for (const route of ['ren', 'di', 'tian']) {
      let seed = 20260915;
      Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      const e = new Engine(); e.S.root = ['jin', 'mu', 'huo', 'tu'];
      let sec = 0;
      for (; sec < 14400 && e.S.realmIdx === 0 && !e.ended; sec++) {
        prepareProgression(e, route);
        e.doCultivate(); e.doCultivate();
        if (!e.panel) {
          for (const b of GX.BLDS) e.buyBld(b.id);
          e.buyGongfa();
          if (!e.S.pills.huichun) e.craftPill('huichun');
          if (e.S.life < st.lifeCap(e.S) * .6) e.usePill('huichun');
        }
        const p = e.panel;
        if (p?.kind === 'gongfa') e.applyGongfaOption(p.data.opts[0].id);
        else if (p?.kind === 'encounter') e.applyEncOption(p.data.opts[0].id);
        else if (p?.kind === 'secret') e.applySecretOption(p.data.opts[0].id);
        else if (p?.kind === 'realm') chooseProgression(e, route);
        if (e.breakInfo().ok) e.doBreak();
        chooseProgression(e, route);
        e.tick(1);
      }
      assert.equal(e.S.foundation, route, `${route} at ${sec}s: ${JSON.stringify(e.S)}`);
      assert.equal(e.S.prestige, 0); assert.equal(e.S.times, 0);
      assert.equal(e.S.milestones[1].relic, route); for (const id of kitIds(e.S, route)) assert.equal(e.S.relics[id], 0);
      if (route === 'tian') { assert.equal(Object.keys(e.S.seek.done).filter(id => id.includes('_survey_')).length, 15); assert.ok(e.S.seek.done.tian_align); assert.equal(e.S.taoKills, 0); }
      console.log(`首世四灵根 ${route}: ${sec}s 筑基，讨伐 ${e.S.taoKills} 次`);
    }
  } finally { Math.random = old; }
});
