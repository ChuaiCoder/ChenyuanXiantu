<script setup>
import { computed } from 'vue';
import { game, send } from '../store/game.js';

const d = computed(() => game.panel && game.panel.kind === 'end' ? game.panel.data : null);
const info = computed(() => {
  if (!d.value) return {};
  const c = d.value.cause;
  return {
    ico: c === '证道' ? '🌄' : '🕯️',
    title: c === '证道' ? '证道飞升' : c === '战败身陨' ? '战败身陨' : '羽化登遐',
    sub: c === '证道' ? '道在朝夕，一念万年。' : '转世后一切归零，唯道心不灭。',
  };
});
</script>

<template>
  <div v-if="d" class="end-box">
    <div class="end-card">
      <div style="font-size:40px">{{ info.ico }}</div>
      <div class="end-title">{{ info.title }}</div>
      <div class="end-text">
        <template v-if="d.cause === '战败身陨'">此战伤及本源，余寿耗尽。</template>
        {{ game.S.name }} 一世修行至此。
        <template v-if="d.gain > 0">凝练道行 <b style="color:var(--gold2)">+{{ d.gain }}</b>，每点永久提升全产出 3%。</template>
        {{ info.sub }}
      </div>
      <button style="font-size:18px;padding:12px 30px;border-color:var(--gold);color:var(--gold2)" @click="send('end:continue')">
        转世重修（择灵根）
      </button>
    </div>
  </div>
</template>
