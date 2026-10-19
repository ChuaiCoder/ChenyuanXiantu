import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Engine from '../server/engine.mjs';
import { executeAction, handleMessage } from '../server/protocol.mjs';
import { saveEngine } from '../server/persistence.mjs';
import { GX } from '../shared/data.js';
import { fmt } from '../shared/format.js';
import { addPills, removePills, takePill, validatePillGrades } from '../shared/inventory.js';
import { pillDescription, encounterOptions, secretOptions } from '../shared/presentation.js';
import * as st from '../shared/state.js';
import { createGameClient } from '../src/store/connection.js';

test('shared imports are acyclic and configuration has no dependency on state or presentation', () => {
  const root = fileURLToPath(new URL('../shared/', import.meta.url));
  const graph = new Map(readdirSync(root).filter(name => name.endsWith('.js')).map(name => {
    const source = readFileSync(path.join(root, name), 'utf8');
    const dependencies = [...source.matchAll(/(?:import|export)\s[^;]*?from\s*['"]\.\/([^'"]+)['"]/g)].map(match => match[1]);
    return [name, dependencies];
  }));
  const done = new Set();
  function visit(name, stack = []) {
    assert.ok(!stack.includes(name), `Cycle: ${[...stack, name].join(' -> ')}`);
    if (done.has(name)) return;
    for (const child of graph.get(name) || []) visit(child, [...stack, name]);
    done.add(name);
  }
  for (const name of graph.keys()) visit(name);
  for (const name of ['data.js', 'combat-data.js', 'progression-data.js', 'relic-data.js', 'format.js']) {
    for (const dep of graph.get(name)) assert.ok(dep.endsWith('-data.js') || dep === 'format.js', `${name} -> ${dep}`);
  }
});

test('dynamic descriptions use the same prices and life rules without modifying configuration', () => {
  const S = st.freshState(); S.root = ['shui']; S.realmIdx = 3; S.bld.mine = 8;
  const before = JSON.stringify([GX.ENCOUNTERS, GX.SECRET_EVENTS]);
  assert.equal(pillDescription(S, 'juli'), `修为 +${fmt(GX.JULI_MULT * st.cultPerClick(S))}（60×点击值）`);
  const options = encounterOptions(S, 'heimi');
  assert.equal(options[0].detail, `${fmt(st.merchantPrices(S).shards)} 灵石`);
  assert.ok(secretOptions(S, 'beast')[0].detail.includes(`${st.battleLifeLoss(S)} 年`));
  options[0].disabled = true; options.push({ id: 'extra' });
  assert.equal(JSON.stringify([GX.ENCOUNTERS, GX.SECRET_EVENTS]), before);
});

test('serializing and editing a detached snapshot never repairs or mutates live state', () => {
  const e = new Engine();
  const before = structuredClone(e.S);
  const snapshot = e.serialize();
  assert.deepEqual(e.S, before); assert.equal(e.S.lifeLedger, null);
  snapshot.S.pills.huichun = 100; snapshot.runtime.pending.herb = { remaining: 1 };
  assert.deepEqual(e.S, before); assert.equal(e.pending.herb, null);
  const r = new Engine(); r.hydrate(e.serialize());
  assert.deepEqual(r.serialize(), e.serialize());
});

test('a failed save leaves the in-memory timestamp and gameplay untouched', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'xiuxian-save-failure-')), 'save.json');
  mkdirSync(`${file}.bak.tmp`); // Force a real write failure without touching a player save.
  const e = new Engine(); e.S.lastTs = 123;
  const before = e.serialize();
  assert.throws(() => saveEngine(e, file));
  assert.deepEqual(e.serialize(), before);
});

test('mixed-tier rewards, quest payments and consumption preserve exact grades before any save', () => {
  const e = new Engine(); e.S.layer = 3;
  addPills(e.S, 'huichun', 2, 0); addPills(e.S, 'huichun', 1, 1);
  assert.equal(executeAction(e, 'seek:ren_visit').ok, true);
  assert.equal(executeAction(e, 'seek:ren_care').ok, true);
  assert.equal(e.S.pills.huichun, 2); assert.equal(e.S.pillGrades.huichun[0], 1);
  assert.equal(takePill(e.S, 'huichun', 1), true);
  const before = structuredClone(e.S);
  assert.equal(removePills(e.S, 'huichun', 2), false);
  assert.deepEqual(e.S, before); validatePillGrades(e.S, true);
  const r = new Engine(); r.hydrate(e.serialize());
  assert.deepEqual(r.S.pillGrades, e.S.pillGrades);
});

test('v10 inventory migrates once; v11 mismatches fail without replacing live state', () => {
  const e = new Engine(), old = e.serialize(); old.S.v = 10;
  old.S.pills.huichun = 3; old.S.pillGrades.huichun = { 0: 1 };
  e.hydrate(old);
  assert.equal(e.S.v, st.STATE_VERSION); assert.deepEqual(e.S.pillGrades.huichun, { 0: 3 });
  const before = e.serialize(), bad = structuredClone(before); bad.S.pills.huichun++;
  assert.throws(() => e.hydrate(bad), /药阶/); assert.deepEqual(e.serialize(), before);
  const copy = new Engine(); copy.hydrate(before); assert.deepEqual(copy.serialize(), before);
});

test('commands distinguish rejection, execution and unchanged preferences', () => {
  const e = new Engine();
  assert.equal(executeAction(e, 'bld:mine').changed, false);
  assert.equal(executeAction(e, 'forgekind:4_sword').ok, false);
  e.S.spirit = 10000;
  assert.equal(executeAction(e, 'bld:mine').ok, true);
  assert.equal(executeAction(e, 'battlemode:manual').changed, true);
  assert.deepEqual(executeAction(e, 'battlemode:manual'), { ok: true, changed: false, reasonCode: null, message: null });
  assert.equal(executeAction(e, 'herb').ok, true);
  assert.equal(executeAction(e, 'herb').changed, false);
  assert.equal(executeAction(e, 'cancelactivity').ok, true);
  e.openRealm(); assert.equal(executeAction(e, 'choice:later').ok, true);
  const reply = handleMessage(e, JSON.stringify({ type: 'act', act: 'cultivate', requestId: '7' }), () => {});
  assert.equal(reply.requestId, '7'); assert.equal(reply.ok, true); assert.equal(reply.checkpoint, false);
});

test('unneeded healing reports a precise rejection without initializing or changing combat state', () => {
  const e = new Engine(); addPills(e.S, 'huichun'); addPills(e.S, 'huiyuan');
  const before = e.serialize();
  assert.equal(executeAction(e, 'pill:huichun').reasonCode, 'health_full');
  assert.equal(executeAction(e, 'pill:huiyuan').reasonCode, 'mana_full');
  assert.deepEqual(e.serialize(), before);
});

test('valid early-return actions report completion for queued combat, secret exit and quest exit', () => {
  const e = new Engine(); e.eventTimer = e.encTimer = -1e9;
  executeAction(e, 'battlemode:manual');
  assert.equal(executeAction(e, 'tao:1').ok, true);
  assert.equal(executeAction(e, 'taoact:guard').ok, true);
  assert.equal(executeAction(e, 'taoflee').ok, true);
  assert.equal(executeAction(e, 'secret').ok, true);
  assert.equal(executeAction(e, 'choice:exit').ok, true);
  e.panel = { kind: 'seek', data: {} };
  assert.equal(executeAction(e, 'choice:exit').ok, true);
});

test('a failed breakthrough roll is an executed action; a missing prerequisite is rejected', t => {
  const e = new Engine(); e.S.cult = st.layerNeed(e.S);
  t.mock.method(Math, 'random', () => .999);
  const outcome = executeAction(e, 'break');
  assert.equal(outcome.ok, true); assert.equal(outcome.changed, true);
  assert.equal(e.S.layer, 0); assert.ok(e.S.cult < st.layerNeed(e.S));
  assert.equal(executeAction(e, 'break').changed, false);
});

function transportFixture() {
  let id = 0;
  const timeouts = new Map(), intervals = new Map(), sockets = [], states = [], statuses = [], results = [];
  const timers = {
    setTimeout(fn) { timeouts.set(++id, fn); return id; }, clearTimeout(key) { timeouts.delete(key); },
    setInterval(fn) { intervals.set(++id, fn); return id; }, clearInterval(key) { intervals.delete(key); },
  };
  const client = createGameClient({ url: 'ws://test/ws', timers,
    createSocket() {
      const socket = { readyState: 0, sent: [],
        send(data) { this.sent.push(JSON.parse(data)); },
        close() { this.readyState = 3; this.onclose?.(); },
        open() { this.readyState = 1; this.onopen(); },
        receive(message) { this.onmessage({ data: JSON.stringify(message) }); },
      };
      sockets.push(socket); return socket;
    },
    onState: state => states.push(state), onStatus: ready => statuses.push(ready), onActionResult: result => results.push(result),
  });
  return { client, sockets, states, statuses, results, timeouts, intervals,
    retry() { const [key, fn] = [...timeouts][0]; timeouts.delete(key); fn(); },
  };
}

test('transport starts explicitly, waits for a snapshot and cleans up on stop', () => {
  const f = transportFixture(); assert.equal(f.sockets.length, 0);
  f.client.start(); f.client.start(); assert.equal(f.sockets.length, 1);
  const ws = f.sockets[0]; ws.open(); assert.equal(f.client.send('cultivate'), null);
  ws.receive({ type: 'state', state: { S: { cult: 1 } } });
  const requestId = f.client.send('cultivate');
  assert.equal(ws.sent[0].requestId, requestId); assert.equal(f.statuses.at(-1), true);
  ws.receive({ type: 'actionResult', requestId, ok: true }); assert.equal(f.results.length, 1);
  f.client.stop(); assert.equal(f.timeouts.size, 0); assert.equal(f.intervals.size, 0);
  assert.equal(f.statuses.at(-1), false); assert.equal(f.client.send('cultivate'), null);
});

test('reconnect ignores late frames from the old socket and creates only one heartbeat', () => {
  const f = transportFixture(); f.client.start();
  const old = f.sockets[0]; old.open(); old.receive({ type: 'state', state: { S: { cult: 1 } } }); old.close();
  assert.equal(f.timeouts.size, 1); assert.equal(f.intervals.size, 0);
  f.retry(); const current = f.sockets[1]; current.open();
  old.receive({ type: 'state', state: { S: { cult: 999 } } }); old.close();
  assert.equal(f.states.length, 1); assert.equal(f.timeouts.size, 0);
  current.receive({ type: 'state', state: { S: { cult: 2 } } });
  assert.equal(f.states.at(-1).S.cult, 2); assert.equal(f.intervals.size, 1);
  f.client.stop();
});

test('importing the Vue store does not need a browser or establish a connection', async () => {
  const { connected, game } = await import('../src/store/game.js');
  assert.equal(connected.value, false); assert.equal(game.S.v, st.STATE_VERSION);
});
