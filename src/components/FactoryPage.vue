<script setup>
/* ============ 洞府产线 ============
   工厂化视角：灵石矿供料 → 灵石池 → 道坛凝练 → 修为，聚灵阵并行直供修为。
   六座建筑是六台工位，卡片上的读数全部来自 shared/state.js 的纯函数。 */
import { computed } from 'vue';
import { game, send } from '../store/game.js';
import { GX, fmt } from '../../shared/data.js';
import * as st from '../../shared/state.js';

const S = () => game.S;
const gmax = () => st.gongfaMaxLv(S());

const mine = computed(() => st.mineRate(S()));
const zhen = computed(() => st.zhenRate(S()));
const altar = computed(() => st.altarRate(S()));
const altarOn = computed(() => S().bld.altar > 0 && S().altarEnabled !== false);
const cultRate = computed(() => zhen.value + (altarOn.value ? altar.value : 0));
const starved = computed(() => altarOn.value && altar.value > mine.value + 1e-9);
/* 修为由谁产出：聚灵阵 / 道坛 / 手动，界面上的构成条直接读这份占比 */
const mix = computed(() => st.outputMix(S()));
const pct = v => Math.round(v * 100);
const running = computed(() => GX.BLDS.filter(b => (S().bld[b.id] || 0) > 0).length);
const idle = computed(() => GX.BLDS.length - running.value);

const FORGE_TIERS = ['未建成', '凡品', '灵品', '玄品', '仙品'];
function forgeTier(s) {
  const lv = s.bld.forge || 0;
  return FORGE_TIERS[Math.min(lv, FORGE_TIERS.length - 1)];
}

/* 每台工位的读数：主数值 + 单位 + 一行注脚 */
function readout(id, s) {
  switch (id) {
    case 'zhen': return { v: `+${fmt(st.zhenRate(s))}`, u: '修为/秒', n: `${st.autoUnits(s).toFixed(1)} 份打坐/秒 · 随境界放大` };
    case 'mine': return { v: `+${fmt(st.mineRate(s))}`, u: '灵石/秒', n: '全产线唯一原料来源' };
    case 'beast': return { v: `+${Math.round(4 * (s.bld.beast || 0))}%`, u: '全产出', n: '乘区加成，作用于修为与灵石' };
    case 'furn': return { v: (s.bld.furn || 0) > 0 ? `${Math.max(1, s.bld.furn)} 粒` : '—', u: '每 5 分钟', n: '自动炼制聚灵丹入库' };
    case 'forge': return { v: forgeTier(s), u: '炼制上限', n: '决定可炼法宝品阶' };
    case 'altar': return { v: `+${fmt(st.altarRate(s))}`, u: '修为/秒', n: `燃灵石 ${fmt(st.altarRate(s))}/秒，1:1 转化` };
    default: return { v: '—', u: '', n: '' };
  }
}

/* 扩建预览：把等级 +1 后重新跑一遍共享纯函数，告诉玩家这一下买到多少产能 */
function withLv(s, id, lv) { return { ...s, bld: { ...s.bld, [id]: lv } }; }
function nextText(id, s) {
  const lv = s.bld[id] || 0;
  const n = withLv(s, id, lv + 1);
  switch (id) {
    case 'zhen': return `+${fmt(st.zhenRate(n))}/秒`;
    case 'mine': return `+${fmt(st.mineRate(n))}/秒`;
    case 'beast': return `全产出 +${Math.round(4 * (lv + 1))}%`;
    case 'furn': return `${Math.max(1, lv + 1)} 粒 / 5 分钟`;
    case 'forge': return FORGE_TIERS[Math.min(lv + 1, FORGE_TIERS.length - 1)];
    case 'altar': return `+${fmt(st.altarRate(n))}/秒`;
    default: return '—';
  }
}

const stations = computed(() => {
  const s = S();
  return GX.BLDS.map((b, i) => {
    const lv = s.bld[b.id] || 0;
    const cost = st.bldCost(s, b.id);
    const locked = b.id === 'altar' && s.realmIdx < 3;
    return {
      id: b.id, icon: b.icon, name: b.name, lv, cost, locked,
      idx: String(i + 1).padStart(2, '0'),
      desc: b.desc(lv),
      ...readout(b.id, s),
      next: nextText(b.id, s),
      ratio: cost > 0 ? Math.min(1, s.spirit / cost) : 1,
      afford: !locked && s.spirit >= cost,
      off: b.id === 'altar' && lv > 0 && s.altarEnabled === false,
    };
  });
});

const books = computed(() => (S().gongfaBook || []).map(id => GX.GONGFA_BY_ID[id]).filter(Boolean));
const fxLine = computed(() => {
  const fx = st.gongfaFx(S());
  const parts = [];
  if (fx.cult) parts.push(`修为 +${Math.round(fx.cult * 100)}%`);
  if (fx.spirit) parts.push(`灵石 +${Math.round(fx.spirit * 100)}%`);
  if (fx.trib) parts.push(`渡劫 +${Math.round(fx.trib * 100)}%`);
  if (fx.life) parts.push(`寿元 +${Math.round(fx.life * 100)}%`);
  if (fx.luck) parts.push(`机缘 +${Math.round(fx.luck * 100)}%`);
  if (fx.build) parts.push(`扩建 -${Math.round(fx.build * 100)}%`);
  if (fx.battle) parts.push(`讨伐 +${Math.round(fx.battle * 100)}%`);
  return parts.join(' · ');
});
</script>

<template>
  <div class="factory">

    <!-- ① 产线走向：谁给谁供料，一眼看清 -->
    <section class="panel pipe-panel">
      <h2>产 线<span class="pipe-tag">{{ running }} 台运转 · {{ idle }} 台待建</span></h2>
      <div class="pipe">
        <div class="pipe-row">
          <div class="pn">
            <em>⛏️</em>
            <span class="pn-n">灵石矿</span>
            <b class="pn-v">+{{ fmt(mine) }}/秒</b>
          </div>
          <span class="flow" :class="{ on: mine > 0 }"><em>灵石</em></span>
          <div class="pn stock">
            <em>💠</em>
            <span class="pn-n">灵石池</span>
            <b class="pn-v">{{ fmt(S().spirit) }}</b>
          </div>
          <span class="flow" :class="{ on: altarOn }"><em>燃灵</em></span>
          <div class="pn" :class="{ off: !altarOn }">
            <em>🏮</em>
            <span class="pn-n">道坛</span>
            <b class="pn-v">{{ altarOn ? fmt(altar) + '/秒' : '未开炉' }}</b>
          </div>
        </div>
        <div class="pipe-row sub">
          <div class="pn">
            <em>🌀</em>
            <span class="pn-n">聚灵阵</span>
            <b class="pn-v">+{{ fmt(zhen) }}/秒</b>
          </div>
          <span class="flow" :class="{ on: zhen > 0 }"><em>打坐</em></span>
          <div class="pn ghost">
            <em>🧘</em>
            <span class="pn-n">自动打坐</span>
            <b class="pn-v">{{ st.autoUnits(S()).toFixed(1) }} 份/秒</b>
          </div>
          <span class="flow plus"><em>并行</em></span>
          <div class="pn ghost">
            <em>✋</em>
            <span class="pn-n">手动打坐</span>
            <b class="pn-v">+{{ fmt(st.cultPerClick(S())) }}/次</b>
          </div>
        </div>
        <div class="pipe-out">
          <span class="po-k">成品</span>
          <span class="po-v">+{{ fmt(cultRate) }}</span>
          <span class="po-u">修为/秒</span>
          <span class="po-bar"><i :style="{ width: pct(mix.autoPct) + '%' }"></i></span>
          <span class="po-s">自动化占 {{ pct(mix.autoPct) }}%</span>
        </div>
      </div>
      <div class="pipe-foot">
        <span class="pf-k">修为构成</span>
        <span class="pf-bar">
          <i class="s-zhen" :style="{ width: (mix.zhenShare * 100).toFixed(1) + '%' }"></i>
          <i class="s-altar" :style="{ width: (mix.altarShare * 100).toFixed(1) + '%' }"></i>
          <i class="s-click" :style="{ width: (mix.clickShare * 100).toFixed(1) + '%' }"></i>
        </span>
        <span class="pf-legend">
          <b class="l-zhen">聚灵阵 {{ pct(mix.zhenShare) }}%</b>
          <b v-if="mix.altar > 0" class="l-altar">道坛 {{ pct(mix.altarShare) }}%</b>
          <b class="l-click">手动 {{ pct(mix.clickShare) }}%</b>
        </span>
      </div>
      <div v-if="starved" class="pipe-warn">⚠ 道坛抽灵快于矿产，灵石池会被抽干，凝练将停摆</div>
    </section>

    <!-- ② 工位：六台机床，谁在跑、下一级值多少 -->
    <div class="sec-head">
      <span class="sh-t">工 位</span>
      <span class="sh-n">{{ stations.length }} 台 · {{ running }} 台运转</span>
      <span class="sh-r">灵石储备 <b>{{ fmt(S().spirit) }}</b></span>
    </div>
    <section class="station-grid">
      <article v-for="s in stations" :key="s.id"
        :class="['station', { built: s.lv > 0, ready: s.afford, off: s.off, locked: s.locked }]">
        <div class="st-idx">{{ s.idx }}</div>
        <div class="st-ico">{{ s.icon }}</div>
        <div class="st-body">
          <div class="st-head">
            <span class="st-name">{{ s.name }}</span>
            <b class="st-lv">Lv.{{ s.lv }}</b>
            <span class="st-state">
              <template v-if="s.locked">元婴解锁</template>
              <template v-else-if="s.off">已熄炉</template>
              <template v-else-if="s.lv > 0">运转</template>
              <template v-else>待建</template>
            </span>
          </div>
          <div class="st-read"><b>{{ s.v }}</b><span>{{ s.u }}</span></div>
          <div class="st-note">{{ s.desc }}</div>
          <div class="st-next">下一级 <i>→</i> {{ s.next }}</div>
          <div class="st-foot">
            <span class="st-gauge" :title="`灵石储备 / 扩建成本`">
              <i :style="{ width: (s.ratio * 100).toFixed(1) + '%' }"></i>
            </span>
            <span class="st-cost">{{ s.lv > 0 ? '下一级' : '建造' }} {{ fmt(s.cost) }}</span>
            <button class="btn-sm" :disabled="s.locked || S().spirit < s.cost" @click="send('bld:' + s.id)">扩建</button>
          </div>
          <div v-if="s.id === 'altar' && s.lv > 0" class="st-altar">
            <button class="btn-xs" @click="send('altar')">{{ S().altarEnabled === false ? '开炉' : '熄炉留存灵石' }}</button>
          </div>
        </div>
      </article>
    </section>

    <!-- ③ 心法：唯一影响全产线的长期乘区 -->
    <section class="panel gf-bar" :title="fxLine ? '心法汇流：' + fxLine : ''">
      <span class="gf-tag">心 法</span>
      <span class="gf-tier">{{ st.gongfaTierName(S()) }} · 第 {{ S().gongfaLv }} 重</span>
      <span class="gf-note">每重修为 ×1.8</span>
      <span class="gf-books">
        <span v-for="b in books" :key="b.id" class="badge on" :title="b.text">
          {{ GX.GONGFA_SCHOOL_ICON[b.school] }} {{ b.name }}
        </span>
      </span>
      <button class="btn-sm" :disabled="S().spirit < st.gongfaCost(S()) || S().gongfaLv >= gmax()" @click="send('gongfa')">
        {{ S().gongfaLv >= gmax() ? `已至 ${st.gongfaTierName(S())} 封顶` : `参悟 · ${fmt(st.gongfaCost(S()))} 灵石` }}
      </button>
    </section>
  </div>
</template>
