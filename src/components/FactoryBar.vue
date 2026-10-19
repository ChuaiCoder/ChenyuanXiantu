<script setup>
/* ============ 产能带（全局 HUD） ============
   挂在页签下方、三栏之上，用「工厂仪表」的语言回答四个问题：
   原料进多少、成品出多少、自动化到什么程度、挂机一晚能拿多少。
   所有数值都来自 shared/state.js 的纯函数，前端不重写任何公式。 */
import { computed } from 'vue';
import { game } from '../store/game.js';
import { GX, fmt, fmtTime } from '../../shared/data.js';
import * as st from '../../shared/state.js';

const S = () => game.S;

const spiritRate = computed(() => st.mineRate(S()));
const zhen = computed(() => st.zhenRate(S()));
const altar = computed(() => st.altarRate(S()));
const altarOn = computed(() => S().bld.altar > 0 && S().altarEnabled !== false);
/* 道坛抽灵快过矿产时灵石池会被抽干——这是整套产线唯一的真实瓶颈 */
const starved = computed(() => altarOn.value && altar.value > spiritRate.value + 1e-9);
const cultRate = computed(() => zhen.value + (altarOn.value ? altar.value : 0));
const mix = computed(() => st.outputMix(S()));
const autoPct = computed(() => Math.round(mix.value.autoPct * 100));
const offline = computed(() => st.offlineForecast(S()));
const units = computed(() => st.autoUnits(S()));
</script>

<template>
  <div class="hud">
    <div class="hud-cell">
      <div class="hud-top">
        <span class="hud-k">灵石入库</span>
        <span class="hud-v">+{{ fmt(spiritRate) }}<small>/秒</small></span>
      </div>
      <span class="hud-s">矿产 · 库存 {{ fmt(S().spirit) }}</span>
    </div>

    <div class="hud-cell">
      <div class="hud-top">
        <span class="hud-k">修为产出</span>
        <span class="hud-v">+{{ fmt(cultRate) }}<small>/秒</small></span>
      </div>
      <span class="hud-s">
        聚灵阵 {{ fmt(zhen) }}<template v-if="altarOn"> · 道坛 {{ fmt(altar) }}</template>
      </span>
    </div>

    <div class="hud-cell">
      <div class="hud-top">
        <span class="hud-k">自动化率</span>
        <span class="hud-v" :class="{ hot: autoPct >= 50 }">{{ autoPct }}<small>%</small></span>
      </div>
      <span class="hud-bar"><i :style="{ width: autoPct + '%' }"></i></span>
      <span class="hud-s">{{ units.toFixed(1) }} 份/秒打坐 · 手动 {{ fmt(st.cultPerClick(S())) }}/次</span>
    </div>

    <div class="hud-cell">
      <div class="hud-top">
        <span class="hud-k">离线 {{ fmtTime(offline.seconds) }}</span>
        <span class="hud-v">+{{ fmt(offline.cult) }}<small>修为</small></span>
      </div>
      <span class="hud-s">灵石 +{{ fmt(offline.spirit) }} · 效率 {{ Math.round(GX.OFFLINE_EFF * 100) }}%</span>
    </div>

    <div v-if="starved" class="hud-alert" title="道坛每秒抽取的灵石多于灵石矿产出，灵石池会被抽干，凝练随之停摆">
      ⚠ 道坛抽灵 {{ fmt(altar) }}/秒 &gt; 矿产 {{ fmt(spiritRate) }}/秒
    </div>
  </div>
</template>
