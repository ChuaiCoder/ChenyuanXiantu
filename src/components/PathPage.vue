<script setup>
import { computed } from 'vue';
import { game, send } from '../store/game.js';
import { GX } from '../../shared/data.js';
import * as st from '../../shared/state.js';
import RealmProgress from './RealmProgress.vue';

const S = () => game.S;
function resetGame() {
  if (window.confirm('确定清空全部存档，重入轮回？')) send('reset');
}
const pg = computed(() => st.prestigeGain(S()));
const prestigeTxt = computed(() => pg.value > 0
  ? ((st.isFinalRealm(S()) && st.isTopLayer(S())) ? `☯️ 弃道转世（道行 +${pg.value}，不如证道飞升）` : `☯️ 转世重修（道行 +${pg.value}，全产出 +${pg.value * 3}%）`)
  : S().times > 0 ? '☯️ 本世尚未筑基，暂无转世收益' : '☯️ 首世需修至道基上限或证道');
</script>

<template>
  <div class="panel grow" style="display:flex;flex-direction:column">
    <h2>道 途</h2>
    <RealmProgress />
    <hr>
    <div class="row">
      <div class="info">
        <div class="nm">转世次数</div>
        <div class="ds">
          当前道行 <b style="color:var(--gold2)">{{ S().prestige }}</b> · 全产出 +{{ S().prestige * 3 }}%<br>
          🍑 道果 <b style="color:var(--gold2)">{{ S().daoFruit }}</b> · 图鉴 {{ st.codexCount(S()) }}/{{ st.codexTotal(S()) }}<br>
          🏛️ 道行里程碑：每 10 点道行开局重抽 +1（当前 +{{ st.legacyRerollBonus(S()) }}，上限 +3）
        </div>
      </div>
    </div>
    <hr>
    <button style="width:100%" :disabled="pg <= 0" @click="send('prestige')">{{ prestigeTxt }}</button>
    <hr>
    <button class="btn-sm" style="width:100%" @click="resetGame">重入轮回（清档）</button>
    <hr>
    <div class="ach-title">功 行 · 十 四 灯</div>
    <div class="ach-box">
      <span v-for="a in GX.ACHIEVEMENTS" :key="a.id" :class="['badge', { on: !!S().achieved[a.id], ach: !!S().achieved[a.id] }]"
        :title="`${a.name}：${a.desc}（${a.fx}）`">{{ S().achieved[a.id] ? '✓ ' : '' }}{{ a.name }}</span>
    </div>
    <div class="couplet" aria-hidden="true"><span>道在朝夕</span><span>心归虚空</span></div>
  </div>
</template>
