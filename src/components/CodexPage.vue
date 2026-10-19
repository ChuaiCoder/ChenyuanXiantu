<script setup>
import { computed } from 'vue';
import { game } from '../store/game.js';
import { GX } from '../../shared/data.js';
import * as st from '../../shared/state.js';

const S = () => game.S;
const groups = computed(() => {
  const tTypes = Object.keys(GX.TREASURE_TYPES);
  return [
    { t: '灵 根', gk: 'roots', items: st.codexRoots(S()).map(id => ({ k: id, n: GX.ROOTS[id].icon + GX.ROOTS[id].name })) },
    { t: '法 宝', gk: 'treasures', items: (() => { const a = []; for (const t of GX.TREASURES) for (const ty of tTypes) a.push({ k: t.q + '_' + ty, n: t.name + GX.TREASURE_TYPES[ty].name }); return a; })() },
    { t: '灵 兽', gk: 'beasts', items: Object.keys(GX.BEASTS).map(id => ({ k: id, n: GX.BEASTS[id].name })) },
    { t: '奇 遇', gk: 'encs', items: GX.ENCOUNTERS.map(e => ({ k: e.id, n: e.title })) },
    { t: '讨伐妖', gk: 'tao', items: GX.TAO_MAP.map(m => ({ k: String(m.id), n: m.icon + m.beast })) },
  ];
});
</script>

<template>
  <div class="panel grow" style="display:flex;flex-direction:column">
    <h2>道 果 · 图 鉴</h2>
    <div class="fruit-line">
      🍑 道果 <b>{{ S().daoFruit }}</b> · 轮回方结（元婴以上始凝，此生预估 +{{ st.lifeFruit(S()) }}）
      ｜ 图鉴 <b>{{ st.codexCount(S()) }}/{{ st.codexTotal(S()) }}</b> 项 · 全产出 <span class="fx">+{{ (st.codexCount(S()) * 0.2).toFixed(1) }}%</span>
    </div>
    <div v-for="g in groups" :key="g.gk" class="codex-group">
      <div class="cg-t">{{ g.t }}<span class="cg-c">{{ (S().seen[g.gk] ? Object.keys(S().seen[g.gk]).length : 0) }}/{{ g.items.length }}</span></div>
      <div class="cg-grid">
        <div v-for="x in g.items" :key="x.k" :class="['cg-item', { lit: !!(S().seen[g.gk] && S().seen[g.gk][x.k]) }]">
          <span v-if="!(S().seen[g.gk] && S().seen[g.gk][x.k])" class="cg-ico">✦</span>{{ x.n }}
        </div>
      </div>
    </div>
  </div>
</template>
