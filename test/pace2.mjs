import { safeChoice } from './progression-bot.mjs';
/* ============ 需求曲线自动校准 + 自动化占比测量 ============
   活跃画像：手动 N 次/秒 + 闭关链 + 全系统（秘境/讨伐/丹药/建筑/功法）。
   1 循环 = 1 现实秒（dt=1s）；通过真实行动积累筑基之物、购买普通灵材和闭关准备破境。
   用法: node test/pace2.mjs [迭代次数] [目标分布JSON] [每秒点击次数]
   例:   node test/pace2.mjs 8                        # 用内置目标分布
         node test/pace2.mjs 8 '[1.24,0.35,...]' 2    # 自定义目标（如保持改动前分布）
         node test/pace2.mjs 1 '' 0                   # 完全不点击（纯挂机下界）
   同时报告每境「自动修炼 / 手动点击」的产出占比，用于验证自动化是否在后期接手。 */
import { Engine } from '../server/engine.mjs';
import { GX } from '../shared/data.js';
import * as st from '../shared/state.js';
import { prepareProgression, chooseProgression } from './progression-bot.mjs';

const H = 3600;
// 目标：每境耗时（小时），合计 ~99h
const DEFAULT_TARGET = [0.5, 1, 2, 3.5, 5, 6, 7, 8, 9, 11, 13, 15, 18];

const ITERS = parseInt(process.argv[2] || '6', 10);
const TARGET = JSON.parse(process.argv[3] || 'null') || DEFAULT_TARGET;
const CLICKS = Math.max(0, parseFloat(process.argv[4] ?? '2'));

function runOnce(ramp) {
  const origNeed = GX.REALM_NEED.slice();
  for (let r = 0; r < 13; r++) GX.REALM_NEED[r] = origNeed[r] * ramp[r];

  const E = new Engine();
  E.S = st.freshState();
  E.S.root = 'jin';
  E.closeBegin(); E.beginOpen = false; E.panel = null;

  const enter = [0]; let sec = 0;
  const cap = 24 * 30 * H;
  // 每境按秒累加产出速率：sum(自动)/sum(自动+点击) 即该境的时间加权占比。
  const acc = Array.from({ length: 13 }, () => ({ auto: 0, click: 0 }));
  const lv = Array(13).fill(0);
  let clickAcc = 0;

  while (sec < cap && !E.ended) {
    const r = E.S.realmIdx;
    acc[r].auto += st.zhenRate(E.S);
    acc[r].click += st.cultPerClick(E.S) * CLICKS;
    lv[r] = Math.max(lv[r], E.S.bld.zhen);
    prepareProgression(E);
    chooseProgression(E);
    if (!E.panel && !E.battle) {
      if (E.S.med <= 0 && E.S.medCd <= 0) E.startMed();
      if (E.S.med <= 0) { clickAcc += CLICKS; while (clickAcc >= 1) { E.doCultivate(); clickAcc--; } }
    }
    if (!E.panel) {
      for (const b of GX.BLDS) if (E.S.spirit >= st.bldCost(E.S, b.id)) E.buyBld(b.id);
      if (E.S.spirit >= st.gongfaCost(E.S)) E.buyGongfa();
      for (const k in GX.PILLS) if (!GX.PILLS[k].breakthrough && E.S.pills[k] < (k === 'huichun' ? 6 : 3) && E.S.spirit >= st.pillCost(E.S, k)) E.craftPill(k);
      if (E.S.foundation && E.S.pills.juli > 0) E.usePill('juli');
      if (E.S.combat?.hp < E.S.combat?.maxHp * .6) E.startRecovery();
      if (E.S.pills.yanshou > 0) E.usePill('yanshou');
      if (E.S.pills.xuan > 0 && !E.S._xuanActive) E.usePill('xuan');
      if (E.S.secretCd <= 0) E.openSecret();
      if (E.S.foundation && E.S.taoCd <= 0 && E.S.med <= 0) E.taoStart(Math.min(E.S.taoMax, 3)); // 筑基后优先低风险讨伐。
    }
    if (E.panel) {
      const p = E.panel;
      if (p.kind === 'trib') { const o = p.data.opts.find(x => x.id === 'fruit' && !x.disabled) || p.data.opts[0]; E.applyTribOption(o.id); }
      else if (p.kind === 'secret') E.applySecretOption(safeChoice(E).id);
      else if (p.kind === 'encounter') E.applyEncOption(safeChoice(E).id);
      else if (p.kind === 'gongfa') { const o = p.data.opts.find(x => x.school === 'cult') || p.data.opts[0]; E.applyGongfaOption(o.id); }
    }
    if (E.breakInfo().ok && !E.panel) E.doBreak();
    E.tick(1); sec++;
    if (E.S.realmIdx >= enter.length) enter.push(sec);
  }

  for (let r = 0; r < 13; r++) GX.REALM_NEED[r] = origNeed[r];

  const times = [];
  const share = [];
  for (let r = 0; r < 13; r++) {
    times.push(enter[r + 1] !== undefined ? (enter[r + 1] - enter[r]) / H : null);
    const t = acc[r].auto + acc[r].click;
    share.push(t > 0 ? acc[r].auto / t : null);
  }
  const done = E.ended && E.S.realmIdx === 12 && E.S.layer >= 9;
  return { times, share, lv, total: sec / H, done, died: E.ended && !done, diedAt: `${GX.REALMS[E.S.realmIdx].name}${E.S.layer}层` };
}

function report(r, label) {
  console.log(`${label}: 总 ${r.total.toFixed(1)}h ${r.done ? '证道' : r.died ? '坐化@' + r.diedAt : '超时'}`);
  console.log('  每境: ' + r.times.map(t => t === null ? '-' : t.toFixed(2)).join(' '));
  console.log('  自动化占比: ' + r.share.map(s => s === null ? '-' : Math.round(s * 100) + '%').join(' '));
  console.log('  聚灵阵等级: ' + r.lv.join(' '));
}

let ramp = Array(13).fill(1); // REALM_NEED 已固化校准结果；ramp 留作后续微调入口
console.log(`画像: 每秒点击 ${CLICKS} 次\n`);

for (let it = 1; it <= ITERS; it++) {
  const r = runOnce(ramp);
  report(r, `迭代${it}`);
  if (r.died) { console.log('  （坐化：提前终止，放大瓶颈前段）'); }
  // 阻尼调整：ramp *= (target/measured)^0.6，单次限幅 [0.3, 3]
  for (let i = 0; i < 13; i++) {
    const m = r.times[i];
    if (m === null || m <= 0) { if (r.died) ramp[i] *= 0.6; continue; }
    const f = Math.pow(TARGET[i] / m, 0.6);
    ramp[i] *= Math.min(3, Math.max(0.3, f));
  }
  console.log('');
}

console.log('最终 ramp:');
console.log(JSON.stringify(ramp.map(x => Math.round(x * 100) / 100)));
const fin = runOnce(ramp);
report(fin, '验证');
console.log('  目标: ' + TARGET.join(' '));
