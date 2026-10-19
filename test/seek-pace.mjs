import { safeChoice } from './progression-bot.mjs';
/* 首世寻道多种子样本，资源只通过真实操作取得。可选 JSON 报告路径。 */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import Engine from '../server/engine.mjs';
import { GX } from '../shared/data.js';
import * as st from '../shared/state.js';
import { kitIds, seekSteps } from '../shared/relic-state.js';
import { prepareProgression, chooseProgression } from './progression-bot.mjs';

const roots = [['jin'], ['jin','huo'], ['mu','shui','tu'], ['jin','mu','huo','tu'], ['jin','mu','shui','huo','tu'], ['bing'], ['lei'], ['feng']];
const results = [], originalRandom = Math.random;
try {
  for (const root of roots) for (const route of ['ren','di','tian']) for (const seed0 of [20260915, 17, 991]) {
    let seed = seed0; Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const e = new Engine(); e.S.root = root; e.S.life = st.lifeCap(e.S);
    const metric = { root: root.join('+'), route, seed: seed0, heard: null, supplies: null, acquired: null, foundation: null };
    const prep = seekSteps(e.S, route).filter(s => s.cost);
    for (let sec = 0; sec < 18000 && e.S.realmIdx === 0 && !e.ended; sec++) {
      prepareProgression(e, route); e.doCultivate(); e.doCultivate();
      if (!e.panel) {
        for (const b of GX.BLDS) e.buyBld(b.id);
        e.buyGongfa(); if (!e.S.pills.huichun) e.craftPill('huichun');
        if (e.S.combat?.hp < e.S.combat?.maxHp * .6) e.startRecovery();
      }
      const p = e.panel;
      if (p?.kind === 'gongfa') e.applyGongfaOption(p.data.opts[0].id);
      else if (p?.kind === 'encounter') e.applyEncOption(safeChoice(e).id);
      else if (p?.kind === 'secret') e.applySecretOption(safeChoice(e).id);
      chooseProgression(e, route);
      if (metric.heard === null && e.S.seek.done[`${route}_visit`]) metric.heard = sec;
      if (metric.supplies === null && prep.every(s => e.S.seek.done[s.id])) metric.supplies = sec;
      if (metric.acquired === null && kitIds(e.S, route).every(id => e.S.relics[id] > 0)) metric.acquired = sec;
      if (e.breakInfo().ok) e.doBreak(); chooseProgression(e, route); e.tick(1);
      if (e.S.foundation) metric.foundation = sec + 1;
    }
    assert.equal(e.S.foundation, route, JSON.stringify(metric)); assert.equal(e.S.times, 0); assert.equal(e.S.prestige, 0);
    assert.ok(metric.acquired !== null, JSON.stringify(metric)); results.push(metric);
  }
} finally { Math.random = originalRandom; }
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(results, null, 2));
for (const root of roots) {
  const name = root.join('+');
  const values = ['ren','di','tian'].map(route => { const times = results.filter(x => x.root === name && x.route === route).map(x => x.foundation); return `${route} ${Math.min(...times)}–${Math.max(...times)}s`; });
  console.log(`${name}: ${values.join(' / ')}`);
}
console.log(`${results.length} first-life runs passed`);
