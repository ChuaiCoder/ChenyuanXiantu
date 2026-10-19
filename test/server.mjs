import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import Engine from '../server/engine.mjs';
import { saveEngine } from '../server/persistence.mjs';
import * as st from '../shared/state.js';
import { seedRealmRequirements } from './progression-bot.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
function message(ws, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', onMessage); reject(new Error('等待服务器消息超时')); }, 5000);
    function onMessage(raw) {
      const value = JSON.parse(raw);
      if (!predicate(value)) return;
      clearTimeout(timer); ws.off('message', onMessage); resolve(value);
    }
    ws.on('message', onMessage);
  });
}
async function start(t, engine, { file = path.join(mkdtempSync(path.join(tmpdir(), 'xiuxian-server-')), 'save.json'), port = '0' } = {}) {
  if (engine) saveEngine(engine, file);
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: root, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', SAVE_FILE: file },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stderr.on('data', data => { output += data; });
  t.after(() => { child.kill(); });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`服务器启动超时：${output}`)), 20000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`服务器退出 ${code}：${output}`)); });
    child.stdout.on('data', data => {
      output += data;
      const match = /http:\/\/127\.0\.0\.1:(\d+)/.exec(output);
      if (match) { clearTimeout(timer); resolve(`ws://127.0.0.1:${match[1]}/ws`); }
    });
  });
  async function connect() {
    const ws = new WebSocket(url); t.after(() => ws.terminate());
    const initial = await message(ws, m => m.type === 'state');
    return { ws, initial };
  }
  async function stop() {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill(); await exited;
  }
  return { connect, child, file, url, stop };
}
const act = (ws, value) => ws.send(JSON.stringify({ type: 'act', act: value }));

test('repeated process restarts preserve the same life, roots, progress and active task', async t => {
  const e = new Engine(); e.S.times = 3; e.S.root = ['bing']; e.S.life = st.lifeCap(e.S);
  e.S.layer = 4; e.S.cult = 1234; e.S.spirit = 5678; e.startMed();
  let server = await start(t, e);
  let client = await server.connect();
  for (let restart = 0; restart < 2; restart++) {
    const { ws } = client;
    const closed = new Promise(resolve => ws.once('close', resolve)); ws.close(); await closed;
    await server.stop();
    const saved = JSON.parse(readFileSync(server.file, 'utf8'));
    server = await start(t, null, { file: server.file });
    client = await server.connect();
    const restored = client.initial.state;
    assert.equal(restored.ended, false); assert.equal(restored.panel, null);
    assert.equal(restored.S.times, 3); assert.deepEqual(restored.S.root, ['bing']);
    // 自动修炼自聚灵阵 0 级起就持续产出，重连会结算断线期间的离线收益；
    // 因此 cult 只校验不倒退、不失控，其余进度字段仍须逐项一致。
    const strip = s => { const { cult, ...rest } = { ...s, lastTs: 0 }; return rest; };
    assert.deepEqual(strip(restored.S), strip(saved.S));
    assert.ok(restored.S.cult >= saved.S.cult && restored.S.cult - saved.S.cult < 3600);
    assert.deepEqual(JSON.parse(readFileSync(server.file, 'utf8')).runtime.clock, saved.runtime.clock);
  }
});

test('a second server cannot open the same save on a different port or alter either snapshot', async t => {
  const e = new Engine(); e.S.times = 3; e.S.layer = 4;
  const server = await start(t, e);
  const before = [readFileSync(server.file, 'utf8'), readFileSync(`${server.file}.bak`, 'utf8')];
  await assert.rejects(start(t, null, { file: server.file }), /存档正在被另一个游戏服务使用/);
  assert.deepEqual([readFileSync(server.file, 'utf8'), readFileSync(`${server.file}.bak`, 'utf8')], before);
  assert.equal((await server.connect()).initial.state.S.times, 3);
});

test('a port conflict cannot save on exit or leave the other save locked', async t => {
  const server = await start(t, new Engine());
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'xiuxian-port-conflict-')), 'save.json');
  const e = new Engine(); e.S.times = 7; saveEngine(e, file);
  const before = readFileSync(file, 'utf8');
  await assert.rejects(start(t, null, { file, port: new URL(server.url).port }), /EADDRINUSE/);
  assert.equal(readFileSync(file, 'utf8'), before); assert.equal(readFileSync(`${file}.bak`, 'utf8'), before);
  const retry = await start(t, null, { file });
  assert.equal((await retry.connect()).initial.state.S.times, 7);
});

test('command acknowledgements follow durable changes and rejected commands do not rewrite saves', async t => {
  const e = new Engine(); e.S.daoFruit = 100; e.openBegin('new');
  const { connect, file } = await start(t, e); const { ws, initial } = await connect();
  assert.equal(Object.hasOwn(initial, 'logDelta'), false);
  const before = readFileSync(file, 'utf8');
  const rejected = message(ws, m => m.type === 'actionResult' && m.requestId === 'bad');
  ws.send(JSON.stringify({ type: 'act', act: 'shop:missing', requestId: 'bad' }));
  const failure = await rejected;
  assert.equal(failure.ok, false); assert.equal(failure.changed, false); assert.ok(failure.message);
  assert.equal(readFileSync(file, 'utf8'), before);
  const accepted = message(ws, m => m.type === 'actionResult' && m.requestId === 'buy');
  ws.send(JSON.stringify({ type: 'act', act: 'shop:pills', requestId: 'buy' }));
  assert.equal((await accepted).ok, true);
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(saved.S.daoFruit, 92); assert.equal(saved.runtime.shopBought.pills, true);
  const duplicate = message(ws, m => m.type === 'actionResult' && m.requestId === 'again');
  ws.send(JSON.stringify({ type: 'act', act: 'shop:pills', requestId: 'again' }));
  assert.equal((await duplicate).changed, false);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), saved);
});

test('a failed checkpoint never acknowledges a durable success', async t => {
  const e = new Engine(); e.S.daoFruit = 100; e.openBegin('new');
  const { connect, file } = await start(t, e); const { ws } = await connect();
  const before = readFileSync(file, 'utf8');
  mkdirSync(`${file}.bak.tmp`);
  const acknowledged = message(ws, m => m.type === 'actionResult' && m.requestId === 'buy');
  ws.send(JSON.stringify({ type: 'act', act: 'shop:pills', requestId: 'buy' }));
  const result = await acknowledged;
  assert.equal(result.ok, false); assert.equal(result.changed, true);
  assert.equal(result.reasonCode, 'storage_unavailable'); assert.equal(readFileSync(file, 'utf8'), before);
  const paused = message(ws, m => m.type === 'error');
  act(ws, 'begincommit'); assert.match((await paused).message, /暂停/);
});

test('real WebSocket publishes fifteen-minute years and preserves a lethal battle result', async t => {
  const e = new Engine(); e.S.life = 1; e.taoStart(1);
  e.battle.pPh = 1; e.battle.eHp = e.battle.eMax = 100000; e.battle.pAuto = 0;
  const { connect } = await start(t, e); const { ws, initial } = await connect();
  assert.deepEqual(initial.state.rules, { secondsPerYear: 900, battleLifeLoss: 0.05 });
  const died = message(ws, m => m.state?.ended);
  act(ws, 'taoact:guard'); act(ws, 'taoact:guard');
  const state = (await died).state;
  assert.equal(state.S.life, 0); assert.equal(state.panel.data.cause, '战败身陨');
  assert.equal(state.battle, null);
  const reconnected = (await connect()).initial.state;
  assert.equal(reconnected.S.life, 0); assert.deepEqual(reconnected.panel, state.panel);
});

test('the last disconnect freezes an activity and the first reconnect settles idle income once', async t => {
  const e = new Engine(); e.S.bld.zhen = e.S.bld.mine = 1; e.startHerb();
  const { connect, file } = await start(t, e); const { ws } = await connect();
  const closed = new Promise(resolve => ws.once('close', resolve)); ws.close(); await closed;
  // Give the real server a few ticks with no sockets; its saved clock must stay frozen.
  await new Promise(resolve => setTimeout(resolve, 250));
  const offline = JSON.parse(readFileSync(file, 'utf8'));
  assert.ok(offline.runtime.presence.offlineSince > 0);
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), offline);
  const r = (await connect()).initial.state;
  assert.equal(r.pending.herb, offline.runtime.pending.herb.remaining);
  assert.equal(r.S.life, offline.S.life); assert.ok(r.S.cult > offline.S.cult);
  const second = (await connect()).initial.state;
  assert.ok(second.S.cult - r.S.cult < st.zhenRate(e.S));
});

test('manual action spam consumes one round and persists the same queued decision', async t => {
  const e = new Engine(); e.setBattleMode('manual'); e.taoStart(1);
  const { connect, file } = await start(t, e); const { ws } = await connect();
  const progressed = message(ws, m => m.state?.battle?.turn === 1);
  for (let i = 0; i < 30; i++) act(ws, 'taoact:strike');
  const frame = (await progressed).state;
  assert.ok(frame.battle.waiting); assert.equal(frame.S.lifeLedger.damage, 0);
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(saved.runtime.battle.turn, 1);
  assert.equal(saved.runtime.clock.elapsed, 1.6);
  const other = (await connect()).initial.state;
  assert.equal(other.battle.turn, 1); assert.equal(other.S.life, frame.S.life);
});

test('real WebSocket rejects wrong-root quests and stage skips, and resumes a once-only timed reward', async t => {
  const e = new Engine(); e.S.root = ['jin', 'huo']; e.S.layer = 9;
  e.S.relics.di_jin = 1; e.S.relics.di_huo = 1;
  e.seekAction('di_jade'); e.S.seek.active.remaining = 1;
  const { connect } = await start(t, e); const { ws } = await connect();
  for (const action of ['seek:di_lei_take', 'seekfight:di_jin_take', 'seek:di_align', 'seek:di_jade', 'seekmode:di_five', 'seek:constructor']) act(ws, action);
  const earned = await message(ws, m => m.state?.S.seek.done.di_jade);
  assert.equal(earned.state.S.seek.jade.di, 1); assert.equal(earned.state.S.seek.done.di_jin_take, undefined);
  const aligned = message(ws, m => m.state?.S.seek.done.di_align);
  act(ws, 'seek:di_align'); act(ws, 'seek:di_align'); act(ws, 'seek:di_jade');
  const s = (await aligned).state.S;
  assert.equal(s.seek.jade.di, 0); assert.equal(s.relics.di_jin, 1); assert.equal(s.relics.di_huo, 1);
  const other = await connect(); assert.equal(other.initial.state.S.seek.jade.di, 0); assert.ok(other.initial.state.S.seek.done.di_align);
});

test('real WebSocket restores a clue scene, rejects a wrong answer and rewards its root only once', async t => {
  const e = new Engine(); e.S.layer = 3; e.S.materials.earth = 2; e.S.materials.essence = 2;
  e.seekAction('ren_visit'); e.seekAction('ren_jin_supply');
  e.S.seek.done.ren_care = true; e.S.seek.done.ren_escort1 = true; e.S.seek.done.ren_escort2 = true;
  e.seekAction('ren_jin_proof');
  const { connect } = await start(t, e); const { ws, initial } = await connect();
  assert.equal(initial.state.panel.kind, 'seek');
  act(ws, 'choice:pick2'); act(ws, 'seek:ren_jin_take'); act(ws, 'seek:ren_huo_take');
  const still = (await connect()).initial.state; assert.equal(still.panel.kind, 'seek'); assert.equal(still.S.relics.ren_jin, 0);
  const solved = message(ws, m => m.state?.S.seek.done.ren_jin_proof); act(ws, 'choice:pick0'); await solved;
  const reward = message(ws, m => m.state?.S.relics.ren_jin === 1);
  act(ws, 'seek:ren_jin_take'); act(ws, 'seek:ren_jin_take');
  const s = (await reward).state.S; assert.equal(s.relics.ren_jin, 1); assert.equal(s.relics.ren_huo, 0);
});

test('real WebSocket rejects malformed input and publishes valid shop/actions', async t => {
  const e = new Engine(); e.S.daoFruit = 100; e.openBegin('new'); e.beginPending = 'lei';
  const { connect, child } = await start(t, e);
  const { ws, initial } = await connect();
  assert.equal(initial.state.panel.data.root.name, '雷灵根');
  for (const raw of ['null', '[]', 'true', '"hello"', '{', '{"type":"act","act":null}']) ws.send(raw);
  act(ws, 'cultivate');
  const pong = message(ws, m => m.type === 'pong'); ws.send('{"type":"ping"}'); await pong;
  assert.equal(child.exitCode, null);
  const bought = message(ws, m => m.state?.S.daoFruit === 82);
  act(ws, 'shop:reroll'); act(ws, 'shop:reroll'); act(ws, 'shop:pills');
  const state = (await bought).state;
  assert.equal(state.S.clicks, 0); assert.equal(state.panel.data.fruit, 82);
  assert.equal(state.panel.data.rerolls, 5); assert.equal(state.panel.data.shop.find(i => i.id === 'pills').sold, true);
  const committed = message(ws, m => m.type === 'state' && m.state.panel === null);
  act(ws, 'begincommit'); await committed;
  const herb = message(ws, m => m.state?.pending.herb > 0);
  act(ws, 'herb'); const h = (await herb).state.pending.herb;
  assert.ok(h <= 15 && h > 0);
  const other = await connect(); assert.ok(other.initial.state.pending.herb > 0);
  const closed = new Promise(resolve => ws.once('close', resolve));
  ws.send('x'.repeat(8193)); await closed;
  const alive = message(other.ws, m => m.type === 'pong'); other.ws.send('{"type":"ping"}'); await alive;
  assert.equal(child.exitCode, null);
});

test('real WebSocket accepts only one continuation from a restored end screen', async t => {
  const e = new Engine(); e.S.times = 1; e.S.realmIdx = 3; e.S.prestige = 20; e.die('坐化');
  const gain = e.panel.data.gain;
  const { connect } = await start(t, e); const { ws, initial } = await connect();
  assert.equal(initial.state.ended, true);
  const next = message(ws, m => m.state?.panel?.kind === 'begin');
  act(ws, 'end:continue'); act(ws, 'end:continue');
  const state = (await next).state;
  assert.equal(state.S.times, 2); assert.equal(state.S.prestige, 20 + gain);
});

test('real WebSocket cannot bypass a foundation cap or consume pills through a rejected choice', async t => {
  const e = new Engine(); e.S.realmIdx = 8; e.S.layer = 9; e.S.foundation = 'di';
  e.S.cult = st.layerNeed(e.S) * 2; seedRealmRequirements(e); e.openRealm();
  const { connect } = await start(t, e); const { ws, initial } = await connect();
  assert.ok(!initial.state.panel.data.opts.some(o => o.id === 'advance'));
  assert.ok(initial.state.panel.data.opts.some(o => o.id === 'rebirth'));
  const unchanged = message(ws, m => m.type === 'state');
  act(ws, 'choice:advance'); act(ws, 'break'); act(ws, 'pill:shengxian');
  const s = (await unchanged).state.S;
  assert.equal(s.realmIdx, 8); assert.equal(s.foundation, 'di'); assert.equal(s.pills.shengxian, 1);
  const next = message(ws, m => m.state?.panel?.kind === 'begin'); act(ws, 'prestige');
  assert.equal((await next).state.S.foundation, null);
});

test('real WebSocket cannot bypass missing relics, buy bound drops or repeat zero-progress reincarnation', async t => {
  const e = new Engine(); e.S.layer = 9; e.S.cult = st.layerNeed(e.S) * 2;
  e.S.times = 4; e.S.prestige = 20; e.S.spirit = 1e12; seedRealmRequirements(e);
  e.S.relics.tian_jin = 0; e.openRealm();
  const { connect } = await start(t, e); const { ws, initial } = await connect();
  assert.equal(initial.state.panel.data.opts.find(o => o.id === 'tian').disabled, true);
  for (let i = 0; i < 3; i++) {
    for (const action of ['choice:tian', 'material:dao_page', 'relic:tian', 'prestige', 'begincommit']) act(ws, action);
  }
  const pong = message(ws, m => m.type === 'pong'); ws.send('{"type":"ping"}'); await pong;
  const { initial: current } = await connect(); const s = current.state.S;
  assert.equal(s.realmIdx, 0); assert.equal(s.pills.zhuji_tian, 1); assert.equal(s.relics.tian_jin, 0);
  assert.equal(s.materials.dao_page, 0); assert.equal(s.times, 4); assert.equal(s.prestige, 20);
  assert.equal(current.state.panel.kind, 'realm');
});
