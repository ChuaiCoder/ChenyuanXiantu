<script setup>
import { ref, watch, watchEffect, onMounted, onUnmounted } from 'vue';
import { game, connected, send, startConnection, stopConnection } from './store/game.js';
import { THEMES, theme, setTheme } from './store/theme.js';
import { flashFx, sealStamp } from './fx.js';
import BgCanvas from './components/BgCanvas.vue';
import CorePanel from './components/CorePanel.vue';
import ActionPanel from './components/ActionPanel.vue';
import FactoryPage from './components/FactoryPage.vue';
import FactoryBar from './components/FactoryBar.vue';
import CraftPage from './components/CraftPage.vue';
import CodexPage from './components/CodexPage.vue';
import CombatPage from './components/CombatPage.vue';
import PathPage from './components/PathPage.vue';
import LogPanel from './components/LogPanel.vue';
import ChoicePanel from './components/ChoicePanel.vue';
import BeginModal from './components/BeginModal.vue';
import EndModal from './components/EndModal.vue';

const tab = ref('cave');
/* 桌面外壳（Electron）：显示可拖拽顶栏；浏览器访问时保持原样 */
const isDesktop = !!window.gameShell?.desktop;
watch(() => !!game.battle, now => {
  if (now) tab.value = 'tao';
});
const TABS = [
  { id: 'cave', label: '产 线' },
  { id: 'craft', label: '丹 器' },
  { id: 'codex', label: '图 鉴' },
  { id: 'tao', label: '讨 伐' },
  { id: 'path', label: '道 途' },
];

function onKey(e) {
  if (e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
  const el = e.target, tag = el?.tagName;
  // 焦点落在按钮/输入控件上时保留原生行为（空格、回车用于激活或输入）。
  if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
  e.preventDefault();
  if (!game.activity?.canStart || !connected.value) return;
  send('cultivate');
  flashFx();
}
onMounted(() => { startConnection(); document.addEventListener('keydown', onKey); });
onUnmounted(() => { stopConnection(); document.removeEventListener('keydown', onKey); });

/* 境界提升 → 朱砂盖章；证道飞升 → 盖「仙」 */
watch(() => game.S.realmIdx, (n, o) => { if (n > o) sealStamp('道'); });
watch(() => game.panel, p => {
  if (p && p.kind === 'end' && p.data && p.data.cause === '证道') sealStamp('仙');
});

/* 灵气潮汐 / 重伤 → 全局换肤（旧版优先级：潮汐先于重伤） */
watchEffect(() => {
  const b = game.S.buffs || {};
  document.body.classList.toggle('tide', b.tide > 0);
  document.body.classList.toggle('shock', !(b.tide > 0) && b.shock > 0);
});
</script>

<template>
  <BgCanvas />

  <div v-if="isDesktop" class="titlebar">
    <span class="tb-name">尘缘仙途</span>
    <span class="tb-sep"></span>
    <span :class="['tb-state', { off: !connected }]">{{ connected ? '灵息相连' : '灵息未续' }}</span>
    <span class="tb-right">第 {{ (game.S?.times || 0) + 1 }} 世</span>
  </div>

  <header class="masthead">
    <div class="title-block">
      <h1>尘缘仙途</h1>
      <div class="seal" aria-hidden="true">仙</div>
    </div>
    <div class="sub">文字修仙 · 道在朝夕</div>
    <div class="theme-dots" role="group" aria-label="界面主题">
      <button v-for="t in THEMES" :key="t.id" :class="['theme-dot', { on: theme === t.id }]"
        :style="{ background: t.dot }" :title="t.name" @click="setTheme(t.id)"></button>
    </div>
    <div class="mh-right">
      <div v-if="game.calendar" class="day" :title="game.calendar.continued ? '旧档未记录历史修行时间；从更新后的续修开始计时，原有余寿保留。' : `现实每 ${game.rules ? game.rules.secondsPerYear / 60 : 1} 分钟流逝一个修行年，每年365天；读档延续，转世重新计时。`">
        <template v-if="game.calendar.years">{{ game.calendar.years }}年{{ game.calendar.days }}天</template>
        <template v-else>第 {{ game.calendar.days + 1 }} 天</template>
        <small>{{ game.calendar.continued ? '续修岁月' : '本世岁月' }}</small>
      </div>
      <div v-else class="day" title="当前服务尚未加载修行计时修复，重启游戏服务后显示本世岁月。">第 {{ game.S.times + 1 }} 世<small>洞府岁月</small></div>
    </div>
  </header>
  <div class="mh-line"></div>

  <nav class="tabbar">
    <button v-for="t in TABS" :key="t.id" :class="['tab', { active: tab === t.id }]" @click="tab = t.id">
      {{ t.label }}
      <span v-if="t.id === 'tao' && game.battle" class="tab-dot">战</span>
      <span v-if="t.id === 'codex' && game.S.daoFruit > 0" class="tab-dot">{{ game.S.daoFruit }}</span>
    </button>
  </nav>

  <FactoryBar />

  <div class="app">
    <div class="col">
      <CorePanel />
      <ActionPanel />
    </div>

    <div class="col">
      <div class="pages">
        <section :class="['page', 'cave', { active: tab === 'cave' }]"><fieldset class="page-controls" :disabled="!game.activity?.canManage"><FactoryPage /></fieldset></section>
        <section :class="['page', 'craft', { active: tab === 'craft' }]"><fieldset class="page-controls" :disabled="!game.activity?.canManage"><CraftPage /></fieldset></section>
        <section :class="['page', 'codex', { active: tab === 'codex' }]"><CodexPage /></section>
        <section :class="['page', 'tao', { active: tab === 'tao' }]"><CombatPage /></section>
        <section :class="['page', 'path', { active: tab === 'path' }]"><fieldset class="page-controls" :disabled="!game.activity?.canManage"><PathPage /></fieldset></section>
      </div>
    </div>

    <div class="col">
      <LogPanel />
    </div>
  </div>

  <div id="fx"></div>
  <div id="seal" aria-hidden="true"><span>道</span></div>
  <div v-if="!connected" class="net">灵息未续 · 重连中…</div>
  <div v-if="game.error" class="net" role="alert">{{ game.error }}</div>
  <div v-else-if="game.actionError" class="net" role="status">{{ game.actionError }}</div>
  <ChoicePanel v-if="game.panel && game.panel.kind !== 'begin' && game.panel.kind !== 'end'" />
  <BeginModal v-if="game.panel && game.panel.kind === 'begin'" />
  <EndModal v-if="game.panel && game.panel.kind === 'end'" />
</template>

<style scoped>
.page-controls { border: 0; margin: 0; padding: 0; min-width: 0; min-height: 0;
  display: flex; flex-direction: column; flex: 1 1 auto; }
</style>
