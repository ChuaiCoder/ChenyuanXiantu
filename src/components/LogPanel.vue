<script setup>
import { ref, watch, nextTick } from 'vue';
import { game } from '../store/game.js';
const listRef = ref(null);
const atBottom = ref(true);
const unread = ref(false);
function onScroll() {
  const el = listRef.value;
  atBottom.value = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 32;
  if (atBottom.value) unread.value = false;
}
function toBottom() {
  if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight;
  atBottom.value = true; unread.value = false;
}
watch(() => game.logs.at(-1)?.id, async () => {
  const follow = atBottom.value;
  await nextTick();
  if (follow) toBottom(); else unread.value = true;
});
</script>

<template>
  <div class="panel grow log-panel">
    <h2>修 行 录</h2>
    <ul ref="listRef" class="loglist" @scroll="onScroll">
      <li v-for="l in game.logs" :key="l.id" :class="l.cls" v-html="l.text"></li>
    </ul>
    <button v-if="unread" class="btn-sm" @click="toBottom">有新的修行记录 ↓</button>
  </div>
</template>
