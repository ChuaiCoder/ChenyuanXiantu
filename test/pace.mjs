import { safeChoice } from './progression-bot.mjs';
/* ============ 节奏分析：不同玩法画像下"一世证道"的现实耗时 ============
   直接驱动 server/engine.mjs，1 循环 = 1 现实秒（dt=1s）。
   所有计时均由 tick 驱动；所有画像均主动筹备破境必需品，含讨伐、秘境和闭关。 */
import { Engine } from '../server/engine.mjs';
import { GX } from '../shared/data.js';
import * as st from '../shared/state.js';
import { prepareProgression, chooseProgression } from './progression-bot.mjs';

const H = 3600;

function runProfile(name, opts) {
  const E = new Engine();
  E.S = st.freshState();
  E.S.root = [opts.root || 'jin'];
  E.closeBegin(); E.beginOpen = false; E.panel = null;

  const realmAt = []; // 到达每个境界的秒数
  let seen = 0, sec = 0, clicks = 0;
  const cap = (opts.capH || 24 * 30) * H;

  while (sec < cap && !E.ended) {
    prepareProgression(E);
    chooseProgression(E);
    // ---- 玩家行为 ----
    if (!E.panel && !E.battle) {
      if (opts.med && E.S.med <= 0) E.startMed();
      if (!opts.med && opts.cps) for (let i = 0; i < opts.cps; i++) { E.doCultivate(); clicks++; }
    }
    if (!E.panel) {
      for (const b of GX.BLDS) if (E.S.spirit >= st.bldCost(E.S, b.id)) E.buyBld(b.id);
      if (opts.gongfa !== false && E.S.spirit >= st.gongfaCost(E.S)) E.buyGongfa();
      for (const k in GX.PILLS) if (!GX.PILLS[k].breakthrough && E.S.pills[k] < 3 && E.S.spirit >= st.pillCost(E.S, k)) E.craftPill(k);
      if (E.S.foundation && E.S.pills.juli > 0) E.usePill('juli');
      if (E.S.combat?.hp < E.S.combat?.maxHp * .6) E.startRecovery();
      if (E.S.pills.xuan > 0 && !E.S._xuanActive) E.usePill('xuan');
      if (opts.secret && E.S.secretCd <= 0) E.openSecret();
      if (E.S.foundation && opts.tao && E.S.taoCd <= 0 && E.S.med <= 0) E.taoStart(Math.min(5, E.S.taoMax));
    }
    if (E.panel) {
      const p = E.panel;
      if (p.kind === 'trib') { const o = p.data.opts.find(x => x.id === 'fruit' && !x.disabled) || p.data.opts[0]; E.applyTribOption(o.id); }
      else if (p.kind === 'secret') E.applySecretOption(safeChoice(E).id);
      else if (p.kind === 'encounter') E.applyEncOption(safeChoice(E).id);
      else if (p.kind === 'gongfa') E.applyGongfaOption(p.data.opts[0].id);
    }
    if (E.breakInfo().ok && E.S.med <= 0 && !E.panel) E.doBreak();

    E.tick(1);
    sec++;
    while (seen <= E.S.realmIdx && E.S.realmIdx >= seen) { realmAt.push({ r: seen, sec }); seen++; }
  }

  const end = E.S.realmIdx === 12 && E.S.layer >= 9 && E.ended ? '证道' : (E.ended ? '坐化/终结' : '超时未完');
  console.log(`\n=== ${name} ===`);
  console.log(`结局: ${end}  总耗时: ${(sec / H).toFixed(1)}h  境界: ${E.S.realmIdx < 13 ? GX.REALMS[E.S.realmIdx].name + E.S.layer + '层' : '大罗圆满'}  点击: ${clicks}  寿元: ${E.S.life.toFixed(0)}/${st.lifeCap(E.S)}`);
  let prev = 0;
  for (const r of realmAt) {
    if (r.r > 12) break;
    console.log(`  ${GX.REALMS[r.r].name} 到达于 ${(r.sec / H).toFixed(2)}h（本境耗时 ${((r.sec - prev) / H).toFixed(2)}h）`);
    prev = r.sec;
  }
  return sec;
}

// A. 闭关链 + 全系统（闭关收益按 GX.MED_RATE 计算）
runProfile('A 肝帝：闭关链 + 全系统', { med: true, secret: true, tao: true });
// B. 正常活跃：手动 2 次/秒 + 全系统（不闭关）
runProfile('B 活跃：手动2次/秒 + 全系统', { cps: 2, secret: true, tao: true });
// C. 正常活跃 + 闭关链（真实最优玩法）
runProfile('C 活跃+闭关链', { cps: 2, med: true, secret: true, tao: true });
// D. 建筑为主，仍主动筹备必需破境条件（在线模拟，不结算离线收益）
runProfile('D 建筑为主 + 主动筹备（未扣离线帽）', { med: false, secret: false, tao: false });
