<script setup>
import { computed, ref, watch } from 'vue';
import { game } from '../store/game.js';
import { GX, fmt, fmtTime } from '../../shared/data.js';
import * as st from '../../shared/state.js';

const S = () => game.S;

const coreEl = ref(null);
let brokeTimer = null;
watch(() => game.S.realmIdx, (n, o) => {
  if (n <= o || !coreEl.value) return;
  coreEl.value.classList.add('broke');
  clearTimeout(brokeTimer);
  brokeTimer = setTimeout(() => coreEl.value && coreEl.value.classList.remove('broke'), 800);
});

const realmColor = computed(() => GX.REALM_COLORS[Math.min(S().realmIdx, GX.REALM_COLORS.length - 1)]);
const ringP = computed(() => Math.min(100, S().cult / st.layerNeed(S()) * 100).toFixed(1));
const realmLabel = computed(() => st.isFinalRealm(S()) && st.isTopLayer(S()) ? '证道圆满' : GX.REALMS[S().realmIdx].name);
const root = computed(() => st.rootProfile(S().root));
const constitution = computed(() => GX.CONSTITUTIONS.find(x => x.id === S().constitution) || null);
const cap = computed(() => st.lifeCap(S()));
const lifePct = computed(() => Math.min(100, S().life / cap.value * 100));
const cultPct = computed(() => Math.min(100, S().cult / st.layerNeed(S()) * 100));
const cultRate = computed(() => st.zhenRate(S()) + (S().bld.altar > 0 && S().altarEnabled !== false ? st.altarRate(S()) : 0));

const G = 'rgba(216,180,94,';
function ringLayers(ri) {
  const layers = [];
  if (ri >= 1) layers.push({ r: 88, cls: 'dash', sp: 80 });
  if (ri >= 2) layers.push({ r: 80, cls: 'ticks', sp: -46, rot: 'reverse' });
  if (ri >= 3) layers.push({ r: 72, cls: 'orbit', sp: 24 });
  if (ri >= 4) layers.push({ r: 64, cls: 'dots', sp: -30 });
  if (ri >= 5) layers.push({ r: 56, cls: 'seg', sp: 18 });
  if (ri >= 6) layers.push({ r: 48, cls: 'dash', sp: -60 });
  if (ri >= 7) layers.push({ r: 42, cls: 'ticks', sp: 36 });
  if (ri >= 8) layers.push({ r: 96, cls: 'halo', sp: 0 });
  return layers;
}
function layerStyle(l) {
  const ri = S().realmIdx;
  const a = Math.min(0.55, 0.22 + ri * 0.03);
  const s = { position: 'absolute', borderRadius: '50%', animation: `spin ${l.sp}s linear infinite` };
  if (l.cls === 'dash') { s.inset = (100 - l.r) / 2 + '%'; s.border = `1px dashed ${G}${a})`; }
  else if (l.cls === 'ticks') {
    s.inset = (100 - l.r) / 2 + '%'; s.border = 'none';
    s.background = `repeating-conic-gradient(${G}${a}) 0 10deg,transparent 10deg 30deg)`;
    s.webkitMask = s.mask = 'radial-gradient(farthest-side,transparent calc(100% - 7px),#000 calc(100% - 6px))';
    if (l.rot === 'reverse') s.animationDirection = 'reverse';
  } else if (l.cls === 'orbit') {
    s.inset = (100 - l.r) / 2 + '%'; s.border = '1px solid rgba(216,180,94,.12)';
    s.background = `radial-gradient(circle at 50% 0,${G}${a + 0.2}) 3px,transparent 4px)`;
  } else if (l.cls === 'dots') {
    s.inset = (100 - l.r) / 2 + '%'; s.border = 'none';
    s.background = `radial-gradient(circle,${G}${a + 0.2}) 1.5px,transparent 2px)`;
    s.backgroundSize = '13% 13%';
    s.webkitMask = s.mask = 'radial-gradient(farthest-side,transparent calc(100% - 4px),#000 calc(100% - 3px))';
    s.animationDirection = 'reverse';
  } else if (l.cls === 'seg') {
    s.inset = (100 - l.r) / 2 + '%'; s.border = 'none';
    s.background = `conic-gradient(from 20deg,${G}${a}) 0 25deg,transparent 25deg 72deg,${G}${a * 0.7}) 72deg 97deg,transparent 97deg 144deg,${G}${a}) 144deg 169deg,transparent 169deg 216deg,${G}${a * 0.7}) 216deg 241deg,transparent 241deg 288deg,${G}${a}) 288deg 313deg,transparent 313deg)`;
    s.webkitMask = s.mask = 'radial-gradient(farthest-side,transparent calc(100% - 5px),#000 calc(100% - 4px))';
  } else if (l.cls === 'halo') {
    s.inset = (100 - l.r) / 2 + '%'; s.border = `1px solid ${G}0.12)`;
    s.boxShadow = `0 0 26px ${G}0.18),inset 0 0 26px ${G}0.10)`;
    s.animationName = 'halopulse'; s.animationDuration = '4s';
    s.animationTimingFunction = 'ease-in-out'; s.animationIterationCount = 'infinite';
  }
  return s;
}
const ringList = computed(() => ringLayers(S().realmIdx).map(layerStyle));
</script>

<template>
  <section class="panel core-panel">
    <h2>道 身</h2>

    <!-- 境界环：只放最要紧的两件事——是谁、走到哪 -->
    <div class="core-wrap" ref="coreEl">
      <div v-for="(stl, i) in ringList" :key="i + S().realmIdx" class="ring-layer" :style="stl"></div>
      <div class="core-ring" :style="{ '--p': ringP }"></div>
      <div class="core-spin"></div>
      <div class="core-inner">
        <div class="core-realm vtxt" :style="{ color: realmColor, textShadow: `0 0 16px color-mix(in srgb, ${realmColor} 65%, transparent)` }">{{ realmLabel }}</div>
        <div class="core-name">{{ S().name }}</div>
      </div>
    </div>

    <!-- 两条命脉：修为（进度）与余寿（倒计时） -->
    <div class="meter">
      <div class="meter-head">
        <span class="mk">修为</span>
        <span class="mv"><b>{{ fmt(S().cult) }}</b> / {{ fmt(st.layerNeed(S())) }}</span>
        <span class="mr">+{{ fmt(cultRate) }}/秒</span>
      </div>
      <div class="bar"><i :style="{ width: cultPct + '%' }"></i></div>
    </div>
    <div class="meter">
      <div class="meter-head">
        <span class="mk">余寿</span>
        <span class="mv"><b>{{ Math.floor(S().life) }}</b> / {{ Math.floor(cap) }} 年</span>
        <span class="mr" :class="{ bad: lifePct < 20 }">{{ Math.round(lifePct) }}%</span>
      </div>
      <div :class="['bar', 'life', { low: lifePct < 20 }]"><i :style="{ width: lifePct + '%' }"></i></div>
    </div>

    <!-- 三条出身：灵根 / 道基 / 体质 -->
    <div class="traits">
      <div class="trait" :title="root.desc">
        <span class="tr-ico">{{ root.icon }}</span>
        <span class="tr-k">灵根</span>
        <span class="tr-v">{{ root.name }}</span>
      </div>
      <div class="trait" :title="GX.FOUNDATIONS[S().foundation]?.desc || ''">
        <span class="tr-ico">⛩️</span>
        <span class="tr-k">道基</span>
        <span class="tr-v">{{ st.foundationName(S()) }}</span>
      </div>
      <div v-if="constitution" class="trait" :title="constitution.desc">
        <span class="tr-ico">🧬</span>
        <span class="tr-k">体质</span>
        <span class="tr-v">{{ constitution.name }}</span>
      </div>
    </div>

    <div class="badge-row">
      <span :class="['badge', { on: S().buffs.tide > 0, buff: S().buffs.tide > 0 }]">潮汐 {{ S().buffs.tide > 0 ? fmtTime(S().buffs.tide) : '—' }}</span>
      <span :class="['badge', { on: S().buffs.shock > 0, debuff: S().buffs.shock > 0 }]">重伤 {{ S().buffs.shock > 0 ? fmtTime(S().buffs.shock) : '—' }}</span>
      <span :class="['badge', { on: S().times > 0 }]">转世 ×{{ S().times }}</span>
      <span v-if="S()._xuanActive" class="badge on">玄丹护体</span>
      <span v-if="S().tribBless" class="badge on">天劫庇佑</span>
    </div>

    <!-- 细节收进折叠区，避免左栏被说明文字撑满 -->
    <details class="core-more">
      <summary>寿元与规则</summary>
      <div class="ds">寿元流逝：现实每 {{ (game.rules?.secondsPerYear ?? 900) / 60 }} 分钟 1 年</div>
      <div v-if="game.calendar?.continued" class="ds">旧档余寿沿用，顶部仅计续修时间。</div>
      <div v-if="S().lifeLedger" class="ds">
        自然消耗 {{ S().lifeLedger.age.toFixed(2) }} 年 · 本源损伤 {{ fmt(S().lifeLedger.damage) }} 年<br>
        可修复 {{ fmt(S().lifeLedger.repairable) }} 年 · 延寿 {{ fmt(S().lifeLedger.extension) }} 年
        <span v-if="S().lifeLedger.unknown > 0"> · 旧档消耗 {{ S().lifeLedger.unknown.toFixed(2) }} 年</span>
      </div>
      <div class="ds">{{ root.icon }} {{ root.name }} · {{ root.desc }}</div>
      <div class="ds">⛩️ {{ st.foundationName(S()) }} · {{ GX.FOUNDATIONS[S().foundation]?.desc || (S().foundation === 'legacy' ? '保留旧世修行，不设道基上限' : '练气圆满后择法筑基') }}</div>
      <div v-if="constitution" class="ds">🧬 {{ constitution.name }} · {{ constitution.desc }}</div>
    </details>
  </section>
</template>
