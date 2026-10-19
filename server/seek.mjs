import { GX, fmt } from '../shared/data.js';
import * as st from '../shared/state.js';
import { SEEK_GRADES, RELIC_ITEMS } from '../shared/relic-data.js';
import { seekSteps, stepInfo, alignmentKey, legacyRoot } from '../shared/relic-state.js';
import { addPills, removePills } from '../shared/inventory.js';

export function findStep(S, id) {
  const grade = typeof id === 'string' ? id.split('_')[0] : '';
  return seekSteps(S, grade).find(s => s.id === id);
}
function spend(S, costs, sign = -1) {
  for (const [group, items] of Object.entries(costs || {})) for (const [id, n] of Object.entries(items)) {
    if (group === 'pills') {
      if (sign > 0) addPills(S, id, n);
      else if (!removePills(S, id, n)) throw new Error('寻道丹药库存不一致');
    } else S[group][id] += sign * n;
  }
}
export function seekPanelData(step) {
  const opts = step.puzzle.choices.map((label, i) => ({ id: `pick${i}`, label }));
  const offset = step.id.length % opts.length;
  return { stepId: step.id, name: step.title, text: `现场线索：${step.puzzle.clue}<br>请选择本阶段的操作。选错可依线索重试，已布置的工具与进度保留。`, opts: [...opts.slice(offset), ...opts.slice(0, offset), { id: 'exit', label: '暂离现场', detail: '保留已完成进度' }] };
}
export const seekActions = {
  setSeekMode(value) {
    if (!this.canAct() || this.panel || this.battle || this.S.seek.active || this.S.realmIdx !== 0 || this.S.foundation || legacyRoot(this.S)) return;
    const [grade, mode, extra] = value.split('_');
    if (extra !== undefined || !Object.hasOwn(SEEK_GRADES, grade) || !['elements','five','legacy'].includes(mode)) return;
    if (mode === 'five' && st.rootIds(this.S.root).length !== 5 || mode === 'legacy' && !this.S.relics[grade]) return;
    if (this.S.seek.modes[grade] === mode) return { ok: true, changed: false };
    this.S.seek.modes[grade] = mode;
    return true;
  },
  seekAction(id) {
    if (!this.canStartActivity()) return;
    const step = findStep(this.S, id);
    if (!stepInfo(this.S, step).ok) return;
    if (step.puzzle) {
      // 选项顺序固定旋转，线索而不是固定按钮位置给出解法。
      this.panel = { kind: 'seek', data: seekPanelData(step) };
    } else this.startSeekStep(step);
    return true;
  },
  applySeekOption(id) {
    if (this.ended || this.beginOpen || this.S.life <= 0 || this.panel?.kind !== 'seek') return;
    if (id === 'exit') { this.panel = null; return true; }
    const step = findStep(this.S, this.panel.data.stepId);
    if (!step?.puzzle || !stepInfo(this.S, step).ok || !this.panel.data.opts.some(o => o.id === id)) return;
    if (id !== `pick${step.puzzle.answer}`) { this.log(`操作尚未契合现场，重新核对线索：${step.puzzle.clue}`, 'dim'); return; }
    this.panel = null;
    this.startSeekStep(step);
    return true;
  },
  startSeekStep(step) {
    if (!this.canStartActivity() || !stepInfo(this.S, step).ok) return;
    spend(this.S, step.cost);
    if (step.secretEntry) this.S.secretCd = GX.SECRET_CD;
    if (step.align) { this.S.seek.jade[step.grade]--; this.S.seek.aligned[alignmentKey(this.S, step.grade)] = true; }
    if (step.duration) {
      this.S.seek.active = { step: step.id, remaining: step.duration };
      this.log(`寻道：${step.title}（${step.duration}秒）`, 'good');
    } else this.finishSeekStep(step.id);
  },
  finishSeekStep(id) {
    const step = findStep(this.S, id);
    if (!step || this.S.seek.done[id]) return;
    // 取物试炼的两条路都收束到这里：战斗胜利用 finishSeekBattle 调用，
    // 稳妥取物由 seekTick 计时到点后调用，两者都要解锁整条试炼链。
    for (const done of step.fight?.completes || []) this.S.seek.done[done] = true;
    this.S.seek.done[id] = true;
    if (step.jade) this.S.seek.jade[step.grade] = (this.S.seek.jade[step.grade] || 0) + 1;
    if (step.reward) {
      this.S.relics[step.reward]++;
      this.log(`☯️ 取得 <b>${RELIC_ITEMS[step.reward].name}</b>，筑基失败保留，成功才融入道基。`, 'good');
    } else this.log(`寻道完成：${step.title}${step.text ? '。' + step.text : ''}`, 'good');
  },
  pauseSeek() {
    if (!this.canAct() || this.panel || !this.S.seek.active) return;
    this.S.seek.active = null;
    this.log('暂离寻物现场，已完成的阶段与布置的阵具保留，当前计时阶段可重做。', 'dim');
    return true;
  },
  seekTick(dt) {
    const active = this.S.seek.active;
    if (!active) return;
    active.remaining = Math.max(0, active.remaining - dt);
    if (!active.remaining) { this.S.seek.active = null; this.finishSeekStep(active.step); }
  },
  seekFight(id) {
    if (!this.canStartActivity() || this.S.taoCd > 0) return;
    const step = findStep(this.S, id);
    if (!stepInfo(this.S, step, true).ok) return;
    const f = step.fight;
    const grade = id.split('_')[0];
    if (!this.createBattle({ name: f.name, hp: f.hp, atk: f.atk, icon: '⚔️', armor: grade === 'ren' ? 10 : 40, speed: 105, boss: grade === 'tian' },
      { node: 1, source: 'quest', quest: id, reserved: structuredClone(f.cost) })) return;
    // 预留封存材料，败退原数归还，胜利后消耗；战斗消耗丹药不返还。
    spend(this.S, f.cost);
    this.log(`⚔️ 寻物试炼：${step.title}，${f.name}现身。观察蓄力，运用术法、法宝与守御应对。`, 'good');
    return true;
  },
  finishSeekBattle(battle, win) {
    const step = findStep(this.S, battle.quest);
    if (!win) {
      spend(this.S, battle.reserved, 1);
      const loss = Math.min(this.S.cult, Math.ceil(st.cultPerClick(this.S) * 20));
      this.S.cult -= loss; this.S.buffs.shock = Math.max(this.S.buffs.shock, 60);
      this.log('寻物败退：封存材料已归还，调查进度保留；可再战，或改走稳妥取物（更耗时，必定成功）。', 'bad');
    } else if (step && !this.S.seek.done[step.id]) {
      this.grantTrialLoot(step);
      this.finishSeekStep(step.id);
    }
    this.S.taoCd = 30;
  },
  /* 战斗捷径的独有回报：战斗因此成为可选支柱，而不是纯亏本的绕路。 */
  grantTrialLoot(step) {
    const S = this.S, loot = GX.SEEK_TRIAL.loot[step.id.split('_')[0]];
    if (!loot) return;
    const cult = Math.ceil(st.cultPerClick(S) * loot.cult);
    S.cult += cult;
    S.shards[loot.shard] += GX.SEEK_TRIAL.shardN;
    const parts = [`修为 +${fmt(cult)}`, `${loot.shardName} ×${GX.SEEK_TRIAL.shardN}`];
    if (loot.heaven) { S.materials.heaven += loot.heaven; parts.push(`天灵晶 ×${loot.heaven}`); }
    if (loot.insight) { S.insight += loot.insight; parts.push(`悟道心得 ×${loot.insight}`); }
    this.log(`🏆 试炼之赏：${parts.join('、')}`, 'good');
  },
  refundSeekBattle(battle) { spend(this.S, battle.reserved, 1); },
};
