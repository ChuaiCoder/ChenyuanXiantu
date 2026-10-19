<script setup>
import { computed } from 'vue';
import { game, send } from '../store/game.js';

const d = computed(() => game.panel && game.panel.kind === 'begin' ? game.panel.data : null);
const root = computed(() => d.value ? d.value.root : null);
const fruit = computed(() => d.value ? d.value.fruit : game.S.daoFruit);
const legacyShown = computed(() => !!(d.value?.legacy && d.value.legacy.some(o => !o.disabled)));
const commitTxt = computed(() => d.value
  ? (d.value.mode === 'new' ? '入 世 修 行' : `转 世 重 修（第 ${game.S.times + 1} 世）`)
  : '');
</script>

<template>
  <div v-if="d" class="begin-box">
    <div class="begin-card">
      <div class="begin-title">尘缘仙途</div>
      <div class="begin-sub">{{ d.sub }}</div>
      <div class="begin-root" v-if="root">
        {{ root.icon }} {{ root.name }}<small>{{ root.desc }}</small>
      </div>
      <p class="ds" style="margin-bottom:10px">金木水火土可组合为一至五灵根；冰、雷、风为变异单灵根。单根专精修炼，杂根兼具各系收益，五根获得五行相生。</p>
      <button class="btn-sm" style="margin-bottom:12px" :disabled="d.rerolls <= 0" @click="send('beginreroll')">
        {{ d.rerolls > 0 ? `☯️ 重抽道缘（余 ${d.rerolls} 次）` : '道缘已现三次，天机不再变' }}
      </button>
      <div v-if="legacyShown" class="shop">
        <div class="shop-t">跨世传承 <span class="shop-b">择一，再点取消</span></div>
        <button v-for="o in d.legacy" :key="o.id"
          :class="['shop-it', { off: o.disabled }]"
          :style="d.legacyChoice === o.id ? { outline: '2px solid var(--gold2)' } : null"
          :disabled="o.disabled"
          @click="send('legacychoose:' + o.id)">
          <span class="shop-n">{{ o.label }}</span>
          <small>{{ o.detail }}</small>
          <span class="shop-c">{{ d.legacyChoice === o.id ? '已选' : '传承' }}</span>
        </button>
      </div>
      <div class="shop">
        <div class="shop-t">转世商店 <span class="shop-b">道果 <b>{{ fruit }}</b></span></div>
        <button v-for="it in d.shop" :key="it.id"
          :class="['shop-it', { off: it.sold || fruit < it.cost }]"
          :disabled="it.sold || fruit < it.cost"
          @click="send('shop:' + it.id)">
          <span class="shop-n">{{ it.name }}</span>
          <small>{{ it.desc }}</small>
          <span class="shop-c">{{ it.sold ? '已领' : '🍑 ' + it.cost }}</span>
        </button>
      </div>
      <button class="primary wide" style="width:100%;min-height:52px;margin-top:12px" @click="send('begincommit')">
        {{ commitTxt }}
      </button>
    </div>
  </div>
</template>
