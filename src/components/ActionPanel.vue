<script setup>
import { computed, watch } from 'vue';
import { game, send } from '../store/game.js';
import { GX, fmt, fmtTime } from '../../shared/data.js';
import * as st from '../../shared/state.js';
import { flashFx, floatText } from '../fx.js';
import { legacyRoot } from '../../shared/relic-state.js';

const S = () => game.S;
const bi = computed(() => st.breakInfo(S()));
const med = computed(() => S().med > 0);
const canStart = computed(() => !!game.activity?.canStart);
/* 连击：窗口内连续点击的层数；由每 200ms 的状态帧驱动刷新。 */
const combo = computed(() => {
  const c = game.combo;
  if (!c || c.n < 2 || Date.now() - c.at > GX.COMBO.windowMs) return 0;
  return c.n;
});
const comboBonus = computed(() => Math.round((combo.value - 1) * GX.COMBO.step * 100));
let lastCritAt = 0;
watch(() => game.combo, c => {
  if (c?.hit && c.at !== lastCritAt) {
    lastCritAt = c.at;
    floatText(`暴击 ×${GX.CRIT.mult}`, innerWidth / 2, 120, 'crit');
  }
});
const secret = computed(() => {
  let cur = null;
  for (const s of GX.SECRETS) if (S().realmIdx >= s.minRealm) cur = s;
  return cur;
});
const secretHint = computed(() => secret.value
  ? (S().secretCd > 0 ? `冷却 ${fmtTime(S().secretCd)}` : `${secret.value.name} · 完成3轮得${legacyRoot(S()) ? '问道残篇' : '天灵晶'}`)
  : '尚未开启');
const herbT = computed(() => game.pending.herb ? fmtTime(game.pending.herb) : '15秒');
const roamT = computed(() => game.pending.roam ? fmtTime(game.pending.roam) : '45秒');

function cultivate(e) {
  if (!canStart.value) return;
  send('cultivate');
  flashFx();
  const r = e.currentTarget.getBoundingClientRect();
  floatText(`修为 +${fmt(st.cultPerClick(S()))}`, r.left + r.width / 2, r.top + 6);
}
</script>

<template>
  <section class="panel grow act-panel">
    <h2>行 动</h2>

    <div v-if="game.activity?.busy" class="ds act-busy" role="status">
      当前：{{ game.activity.label }}{{ game.activity.remaining ? ` · ${fmtTime(game.activity.remaining)}` : '' }}{{ game.activity.paused ? ' · 等待决策，岁月暂停' : '' }}
      <button v-if="['med', 'seek', 'recovery', 'herb', 'roam'].includes(game.activity.kind) && !game.panel" class="btn-xs" @click="send('cancelactivity')">停止</button>
    </div>
    <div v-for="task in game.suspended" :key="task.kind" class="ds">
      旧档暂存：{{ { med: '闭关', herb: '采药', roam: '巡采' }[task.kind] }} · {{ fmtTime(task.remaining) }}
      <button class="btn-xs" :disabled="!canStart" @click="send('resumeactivity:' + task.kind)">继续</button>
    </div>

    <!-- 手动：唯一的点击入口，越到后期越无关紧要 -->
    <div class="act-group">
      <div class="ag-t">手动</div>
      <button class="primary wide" :disabled="!canStart" @click="cultivate">
        修 炼<small>修为 +{{ fmt(st.cultPerClick(S())) }}</small>
        <span v-if="combo" class="pill">连击 ×{{ combo }} +{{ comboBonus }}%</span>
      </button>
    </div>

    <!-- 挂机：交给洞府自己跑 -->
    <div class="act-group">
      <div class="ag-t">挂机</div>
      <div class="actions three">
        <button :disabled="!canStart" title="采药寻宝：必得灵草、草木生机，供药与温养辅材" @click="send('herb')">
          🌿 采药 <span class="pill">{{ herbT }}</span>
        </button>
        <button :disabled="!canStart" title="安全巡采：归来必得灵液、地脉精华，取物阵材" @click="send('roam')">
          🧭 巡采 <span class="pill">{{ roamT }}</span>
        </button>
        <button v-if="!med" :disabled="S().medCd > 0 || !canStart"
          :title="S().medCd > 0 ? `调息中，${fmtTime(S().medCd)} 后可再入定` : '闭关 120 秒：点击力×2/秒，完成得 1 点悟道心得'"
          @click="send('med')">
          🧘 闭关 <span class="pill">{{ S().medCd > 0 ? fmtTime(S().medCd) : '120秒' }}</span>
        </button>
        <button v-else :disabled="true">闭关中 <span class="pill">{{ fmtTime(S().med) }}</span></button>
      </div>
    </div>

    <!-- 突破：卡进度的关键节点 -->
    <div class="act-group">
      <div class="ag-t">突破</div>
      <div class="actions">
        <button :disabled="!secret || S().secretCd > 0 || !canStart" @click="send('secret')">
          🏔️ 秘境<small>{{ secretHint }}</small>
        </button>
        <button :class="{ breakable: bi.ok && canStart }" :disabled="!bi.ok || !canStart" @click="send('break')">
          ⚡ {{ bi.txt }}
          <small v-if="S().pills.dujie > 0 && bi.ok">渡劫丹待命 +20%</small>
        </button>
      </div>
      <button v-if="st.foundationCapped(S())" class="btn-xs act-more" :disabled="!canStart" @click="send('prestige')">
        道基已至上限 · 转世重修（道行 +{{ st.prestigeGain(S()) }}）
      </button>
      <button v-else class="btn-xs act-more" :disabled="!canStart" @click="send('prepare')">
        筹备破境 · {{ GX.BREAKTHROUGHS[S().realmIdx].name }} 所需材料
      </button>
    </div>
  </section>
</template>
