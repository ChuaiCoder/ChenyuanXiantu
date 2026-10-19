<script setup>
import { computed } from 'vue';
import { game, send } from '../store/game.js';
import { GX, fmt } from '../../shared/data.js';
import * as st from '../../shared/state.js';
const S = () => game.S;
const plans = computed(() => st.realmPlans(S()));
const gate = computed(() => GX.BREAKTHROUGHS[S().realmIdx]);
</script>

<template>
  <div class="realm-progress">
    <div class="nm">{{ st.foundationName(S()) }} · 悟道心得 {{ S().insight }}</div>
    <p class="ds">{{ GX.FOUNDATIONS[S().foundation]?.desc || (S().foundation === 'legacy' ? '旧存档保留已成境界与无上限道基；转世后按新规则重新筑基。' : '人道止于元婴，地道止于渡劫，天道可证道。筑基成功后，上限只能通过转世重修改变。') }}</p>
    <p v-if="st.foundationCapped(S())" class="cap-notice">此世已至道基上限。可使用下方转世按钮重修，第一世同样开放。</p>
    <div v-else>
    <div class="nm">下一步 · {{ gate.name }}</div>
    <p class="ds">{{ gate.text }}</p>
    <details v-for="p in plans" :key="p.id" class="prep-plan" :open="plans.length === 1">
      <summary>{{ p.name }} · {{ p.ok ? '条件已齐' : `还缺 ${p.missing.length} 项` }} · 成功率 {{ Math.round(p.chance * 100) }}%</summary>
      <p class="ds">{{ p.desc }}</p>
      <div v-for="r in p.requirements" :key="r.label" class="requirement">
        <div :class="{ ready: r.have >= r.need }">{{ r.have >= r.need ? '✓' : '○' }} {{ r.label }} · {{ fmt(r.have) }}/{{ fmt(r.need) }}</div>
        <small>{{ r.source }}</small>
      </div>
    </details>
    <p class="ds">丹方与筑基之物在「丹器」页筹备。功法与心得不消耗；破境丹每次尝试消耗一枚，筑基之物仅成功时融入道基。</p>
    <button class="btn-sm" :disabled="!!game.panel" @click="send('prepare')">择法破境</button>
    </div>
    <details class="prep-plan">
      <summary>查看完整道途与已成境界</summary>
      <div v-for="g in GX.BREAKTHROUGHS" :key="g.to" class="requirement">
        <div :class="{ ready: !!S().milestones[g.to] }">{{ S().milestones[g.to] ? '✓' : '○' }} {{ g.to === 13 ? '证道' : GX.REALMS[g.to].name }} · {{ S().milestones[g.to]?.name || g.name }}</div>
        <small>{{ g.pill ? GX.PILLS[g.pill].name : '筑基丹与对应筑基之物' }} · 功法 {{ g.book }} 重 · 心得 {{ g.insight }} 点{{ g.certain ? ' · 条件齐备后必成' : '' }}{{ GX.FOUNDATIONS[S().foundation]?.maxRealm < 12 && g.to > GX.FOUNDATIONS[S().foundation].maxRealm ? ' · 超出本世上限' : '' }}</small>
      </div>
    </details>
  </div>
</template>
