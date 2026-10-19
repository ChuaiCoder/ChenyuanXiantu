<script setup>
import { computed, ref } from 'vue';
import { game, send } from '../store/game.js';
import { GX, fmtTime } from '../../shared/data.js';
import * as st from '../../shared/state.js';
import { SEEK_GRADES, RELIC_ITEMS } from '../../shared/relic-data.js';
import { seekSteps, stepInfo, foundationKit, seekMode, legacyRoot } from '../../shared/relic-state.js';

const grade = ref('ren'), all = ref(false);
const S = () => game.S;
const kit = computed(() => foundationKit(S(), grade.value));
const mode = computed(() => seekMode(S(), grade.value));
const steps = computed(() => seekSteps(S(), grade.value));
const completed = computed(() => steps.value.filter(s => S().seek?.done[s.id]).length);
const active = computed(() => Object.keys(SEEK_GRADES).flatMap(g => seekSteps(S(), g)).find(s => s.id === S().seek?.active?.step));
const busy = computed(() => !!game.panel || !!game.battle || !!S().seek?.active || S().med > 0 || game.ended);
const rows = computed(() => {
  if (!S().seek) return [];
  return steps.value.filter(s => all.value || !S().seek.done[s.id] && (s.requires.every(id => S().seek.done[id]) || s.fight?.requires?.every(id => S().seek.done[id])))
    .map(step => ({ step, info: stepInfo(S(), step), fight: step.fight ? stepInfo(S(), step, true) : null }));
});
const costText = info => info.requirements.filter(r => r.group).map(r => `${r.label} ${r.have}/${r.need}`).join('、');
const lootOf = step => {
  const l = GX.SEEK_TRIAL.loot[step.grade];
  if (!l) return '';
  const parts = [`修为 +${l.cult} 倍点击值`, `${l.shardName} ×${GX.SEEK_TRIAL.shardN}`];
  if (l.heaven) parts.push(`天灵晶 ×${l.heaven}`);
  if (l.insight) parts.push(`悟道心得 ×${l.insight}`);
  return parts.join('、');
};
</script>

<template>
  <div v-if="S().realmIdx === 0" class="panel relic-workshop" style="margin-bottom:12px">
    <h2>筑 基 · 寻 道 录</h2>
    <p v-if="!S().seek" class="ds">寻道录已更新，请重启游戏服务以载入本世进度。</p>
    <template v-else>
      <p class="ds">{{ st.rootProfile(S().root).name }} · 依灵根寻取同品级主材。混合灵根须逐系备齐并合灵；五灵根也可寻完整五行之物。筑基失败保留主材与合灵，成功才融入道基。</p>
      <div class="seek-tabs" role="group" aria-label="寻道品级">
        <button v-for="(g, id) in SEEK_GRADES" :key="id" class="btn-sm" :class="{ selected: grade === id }" :aria-pressed="grade === id" @click="grade = id">{{ g.name }}筑基</button>
      </div>
      <p class="ds">{{ GX.FOUNDATIONS[grade].desc }} 练气{{ SEEK_GRADES[grade].layer }}层开启寻物。道基一经筑成，本世无法更换，须转世重修。</p>
      <div v-if="st.rootIds(S().root).length === 5 || S().relics[grade] > 0" class="seek-tabs" role="group" aria-label="主材方案">
        <button class="btn-sm" :disabled="busy || legacyRoot(S())" :class="{ selected: mode === 'elements' }" @click="send('seekmode:' + grade + '_elements')">逐系取物</button>
        <button v-if="st.rootIds(S().root).length === 5" class="btn-sm" :disabled="busy" :class="{ selected: mode === 'five' }" @click="send('seekmode:' + grade + '_five')">完整五行之物</button>
        <button v-if="S().relics[grade] > 0" class="btn-sm" :disabled="busy" :class="{ selected: mode === 'legacy' }" @click="send('seekmode:' + grade + '_legacy')">沿用旧世宝物</button>
      </div>
      <div v-for="r in kit.requirements" :key="r.label" class="requirement">
        <div :class="{ ready: r.have >= r.need }">{{ r.have >= r.need ? '✓' : '○' }} {{ r.label }} {{ r.have }}/{{ r.need }}</div>
        <small>{{ r.source }}</small>
      </div>
      <template v-if="mode === 'legacy'">
        <p class="ds">沿用本世旧法筑基之物。已持有的通用宝物可直接用于对应筑基；转世后按新灵根重新寻物。</p>
        <template v-if="legacyRoot(S())">
          <div v-for="r in st.relicInfo(S(), grade).requirements" :key="r.label" class="requirement">{{ r.label }} {{ r.have }}/{{ r.need }}<small>{{ r.source }}</small></div>
          <button class="btn-sm" :disabled="busy || !st.relicInfo(S(), grade).ok" @click="send('relic:' + grade)">依旧法凝聚{{ GX.FOUNDATION_RELICS[grade].name }}</button>
        </template>
      </template>
      <template v-else>
        <div v-if="active" class="seek-active">
          <b>{{ active.title }}</b><div>进行中 · 余 {{ fmtTime(S().seek.active.remaining) }}</div>
          <button class="btn-sm" :disabled="!!game.panel" @click="send('seekpause')">暂离 · 保留已完成阶段</button>
          <small>当前阶段计时重新开始，已布阵具不重复收取。</small>
        </div>
        <p class="ds">已完成 {{ completed }}/{{ steps.length }} 阶段 · 领取宝物不会锁定筑基路线。</p>
        <label class="ds"><input type="checkbox" v-model="all"> 查看全部阶段与已完成经历</label>
        <article v-for="{ step, info, fight } in rows" :key="step.id" class="seek-stage" :data-step="step.id">
          <div class="nm">{{ S().seek.done[step.id] ? '✓ ' : '' }}{{ step.title }}</div>
          <p v-if="step.text" class="ds">{{ step.text }}</p>
          <p v-if="step.puzzle" class="ds">线索：{{ step.puzzle.clue }}</p>
          <div v-if="costText(info)" class="ds">所需：{{ costText(info) }}</div>
          <template v-if="!S().seek.done[step.id]">
            <div class="seek-tabs">
              <button class="btn-sm" :disabled="busy || !info.ok" @click="send('seek:' + step.id)">{{ fight ? '稳妥取物' : step.puzzle ? '进入现场' : step.reward ? '取回宝物' : '开始行动' }}{{ step.duration ? ' · ' + fmtTime(step.duration) : '' }}</button>
              <button v-if="fight" class="btn-sm" :disabled="busy || !fight.ok || S().taoCd > 0" @click="send('seekfight:' + step.id)">战斗捷径 · 挑战{{ step.fight.name }}</button>
            </div>
            <div v-if="!info.ok" class="ds">尚需：{{ info.missing.join('、') }}</div>
            <div v-if="fight" class="ds">稳妥取物 · 挂机 {{ fmtTime(step.duration) }}，不战而取，必定成功，无额外奖励。</div>
            <div v-if="fight" class="ds">战斗捷径 · 敌方气血 {{ step.fight.hp }} / 攻击 {{ step.fight.atk }}。{{ costText(fight) ? '封存材料：' + costText(fight) + '。' : '' }}败退归还封存材料，服用的丹药不返还。胜则另有试炼之赏：{{ lootOf(step) }}。{{ S().taoCd > 0 ? '战斗冷却 ' + fmtTime(S().taoCd) : '' }}</div>
            <div v-if="fight && game.rules" class="ds">战败折寿 {{ st.battleLifeLoss(S()) }} 年，寿尽身陨；主动撤退不折寿。打不过就走稳妥取物，主线不会被战斗卡住。</div>
          </template>
        </article>
        <p v-if="kit.ok" class="ds ready">主材已备妥。备好对应筑基丹并修至练气圆满后，在「筹备破境」择法筑基。</p>
      </template>
      <details class="prep-plan">
        <summary>八系灵物与完整五行之物</summary>
        <div v-for="(item, id) in RELIC_ITEMS" :key="id" class="requirement">
          <div>{{ SEEK_GRADES[item.grade].name }} · {{ item.name }} ×{{ S().relics[id] || 0 }}</div><small>{{ item.source }}</small>
        </div>
      </details>
    </template>
  </div>
</template>
