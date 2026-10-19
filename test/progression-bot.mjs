/* 节奏/整世模拟使用真实行动筹备：不直接改写角色资源或突破条件。 */
import { GX } from '../shared/data.js';
import * as st from '../shared/state.js';
import { SEEK_GRADES } from '../shared/relic-data.js';
import { seekSteps, stepInfo, foundationKit, kitIds, alignmentKey, legacyRoot } from '../shared/relic-state.js';

export function safeChoice(e) {
  const opts = e.panel?.data?.opts || [];
  return opts.find(o => ['retreat', 'later', 'sit', 'blow', 'ride'].includes(o.id)) || opts[0];
}
export function preparePill(e, id) {
  const info = st.craftInfo(e.S, id);
  if (info.ok) { e.craftPill(id); return; }
  for (const [key, n] of Object.entries(GX.PILLS[id].materials || {})) {
    if (e.S.materials[key] < n) { e.buyMaterial(key); return; }
  }
}
export function playBattle(e) {
  if (!e.battle) return false;
  e.setBattleMode('auto');
  if (!e.battle.autoPills) e.setCombatOption('autopills');
  return true;
}

function prepareSeek(e, route) {
  const S = e.S;
  if (S.seek.active || S.med > 0 || e.battle || foundationKit(S, route).ok) return;
  if (S.insight < SEEK_GRADES[route].insight && S.medCd <= 0) { e.startMed(); return; }
  for (const step of seekSteps(S, route)) {
    if (S.seek.done[step.id]) continue;
    const info = stepInfo(S, step);
    // 同时推进已开放分支；层数、功法、冷却不足时等待正常修炼。
    if (info.requirements.some(r => !r.group && r.have < r.need)) continue;
    for (const r of info.requirements.filter(r => r.group && r.have < r.need)) {
      if (r.group === 'pills') preparePill(e, r.id);
      else if (!GX.MATERIALS[r.id].bound) e.buyMaterial(r.id);
      else if (GX.MATERIALS[r.id].activity === 'herb') e.startHerb();
    }
    if (stepInfo(S, step).ok) { e.seekAction(step.id); return; }
  }
}

export function prepareProgression(e, route = 'tian') {
  if (playBattle(e)) return;
  if (!e.canAct() || e.panel) return;
  const S = e.S, gate = GX.BREAKTHROUGHS[S.realmIdx];
  if (st.foundationCapped(S)) return;
  const pill = gate.to === 1 ? GX.FOUNDATIONS[route].pill : gate.pill;
  if (gate.to === 1 && !legacyRoot(S)) prepareSeek(e, route);
  const relic = gate.to === 1 && legacyRoot(S) ? GX.FOUNDATION_RELICS[route] : null;
  if (relic && !S.relics[route]) {
    // 战斗以真实丹药和回合推进，强敌前备足丹药并手动介入。
    if (e.battle) {
      if (e.battle.pAuto) e.taoToggle();
      const heal = e.battle.pPh < e.battle.pMax * .55;
      const id = heal ? 'huichun' : 'juli';
      if (!S.pills[id]) e.craftPill(id);
      e.taoAct(S.pills[id] ? `pill_${id}` : S.treasure ? 'treasure' : 'strike');
      return;
    }
    for (const [id, n] of Object.entries(relic.materials)) {
      if (S.materials[id] >= n) continue;
      const m = GX.MATERIALS[id];
      if (!m.bound) e.buyMaterial(id);
      else if (m.activity === 'herb') e.startHerb();
      else if (m.activity === 'roam') e.startRoam();
      else if (id === 'dao_page' && S.secretCd <= 0 && S.med <= 0) { e.openSecret(); return; }
      else if (m.node && S.taoCd <= 0 && S.med <= 0) {
        if (S.pills.juli < 6) { e.craftPill('juli'); return; }
        if (S.pills.huichun < 3) { e.craftPill('huichun'); return; }
        e.taoStart(Math.min(m.node, S.taoMax));
        return;
      }
    }
    e.forgeRelic(route);
  }
  if (S.insight < Math.max(gate.insight, relic?.insight || 0) && S.med <= 0 && S.medCd <= 0) e.startMed();
  if (S.pills[pill] > 0) return;
  const recipe = GX.PILLS[pill];
  if (S.bld.furn < recipe.furnace) {
    if (S.spirit >= st.bldCost(S, 'furn')) e.buyBld('furn');
    return;
  }
  for (const [id, n] of Object.entries(recipe.materials)) {
    // 单次迭代最多补一份，避免大库存下批量买光灵石。
    if (S.materials[id] < n) { e.buyMaterial(id); return; }
  }
  e.craftPill(pill);
}
export function chooseProgression(e, route = 'tian') {
  if (e.panel?.kind === 'seek') {
    const step = seekSteps(e.S, e.panel.data.stepId.split('_')[0]).find(s => s.id === e.panel.data.stepId);
    e.applySeekOption(`pick${step.puzzle.answer}`);
  }
  if (e.panel?.kind === 'realm') e.applyRealmOption(e.S.realmIdx === 0 ? route : 'advance');
}

/* 单元场景的显式前置条件；整世模拟不调用。 */
export function seedRealmRequirements(e, route = 'tian') {
  const S = e.S, gate = GX.BREAKTHROUGHS[S.realmIdx];
  S.insight = Math.max(S.insight, gate.insight);
  S.gongfaBook = GX.GONGFA_BOOKS.slice(0, gate.book - 1).map(tier => tier[0].id);
  S.gongfaLv = 1 + S.gongfaBook.length;
  S.pills[gate.to === 1 ? GX.FOUNDATIONS[route].pill : gate.pill] = 1;
  if (gate.to === 1) {
    for (const id of kitIds(S, route)) S.relics[id] = 1;
    if (S.root.length > 1) S.seek.aligned[alignmentKey(S, route)] = true;
  }
}
