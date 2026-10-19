<script setup>
import { computed } from 'vue';
import { game, send } from '../store/game.js';

const p = computed(() => game.panel);
const data = computed(() => p.value ? p.value.data : null);
const title = computed(() => {
  if (!p.value || !data.value) return '';
  const k = p.value.kind;
  if (k === 'trib') return `⚡ ${data.value.isXian ? '仙劫' : '天劫'} · ${data.value.name}`;
  if (k === 'encounter') return `📜 奇遇 · ${data.value.title}`;
  if (k === 'secret') return `🏔️ 秘境 · ${data.value.name}（${data.value.turn}/3）`;
  if (k === 'gongfa') return `📖 参悟 · ${data.value.tierName}功法（耗灵石 ${data.value.costTxt}）`;
  if (k === 'realm') return `☯️ 破境 · ${data.value.name}`;
  if (k === 'seek') return `🧭 寻道 · ${data.value.name}`;
  return '';
});
</script>

<template>
  <div v-if="data" class="choice">
    <div class="enc-title">{{ title }}</div>
    <div class="enc-text" v-html="data.text"></div>
    <div class="enc-opts">
      <button v-for="o in data.opts" :key="o.id" class="btn-sm enc-btn"
        :disabled="!!o.disabled" @click="send('choice:' + o.id)">
        {{ o.label }}<small v-if="o.detail">{{ o.detail }}</small>
      </button>
    </div>
  </div>
</template>
