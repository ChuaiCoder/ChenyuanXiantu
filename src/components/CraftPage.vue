<script setup>
import { pillDescription } from '../../shared/presentation.js';
import { computed, ref } from 'vue';
import { game, send } from '../store/game.js';
import { GX, fmt } from '../../shared/data.js';
import * as st from '../../shared/state.js';
import RelicWorkshop from './RelicWorkshop.vue';
import { legacyRoot } from '../../shared/relic-state.js';
import { pillMaterials } from '../../shared/inventory.js';

const S = () => game.S;
const supportsProgression = computed(() => S().v >= 7);
const materials = computed(() => Object.fromEntries(Object.entries(GX.MATERIALS).filter(([id]) => legacyRoot(S()) || !/^(vein_jade|dao_page|origin_)/.test(id) || S().materials[id] > 0)));
const materialSource = (id, m) => !legacyRoot(S()) && S().seek?.converted[id] > 0 ? '旧世遗存，已折入本世寻道经历' : m.source;
const shardNm = { fan: '凡品', ling: '灵品', xuan: '玄品', di: '地品' };
const allRecipes = ref(false);
const forgeType = ref('wu');
const grades = id => Object.entries(S().pillGrades?.[id] || {}).filter(([, n]) => n > 0).map(([r, n]) => `${GX.REALMS[r].name}阶 ×${n}`).join(' · ');
const ordinaryPills = Object.fromEntries(Object.entries(GX.PILLS).filter(([, p]) => !p.breakthrough));
const recipes = computed(() => {
  const needed = st.foundationCapped(S()) ? [] : st.realmPlans(S()).map(p => p.pill);
  return Object.entries(GX.PILLS).filter(([k, p]) => p.breakthrough && (allRecipes.value || (needed.includes(k) && !st.pillBlockReason(S(), k)) || S().pills[k] > 0));
});
</script>

<template>
  <div>
    <div v-if="!supportsProgression" class="panel" style="margin-bottom:12px">
      <h2>丹 器</h2>
      <p class="ds">请重启游戏服务以加载新版寻道与破境玩法。当前可继续使用下方已有的炼丹、炼器功能。</p>
    </div>
    <RelicWorkshop v-if="supportsProgression" />
    <div v-if="supportsProgression" class="panel" style="margin-bottom:12px">
      <h2>破 境 · 丹 方</h2>
      <div v-if="st.foundationCapped(S())" class="cap-notice">
        {{ st.foundationName(S()) }}已至上限，无需再炼下一境丹药。转世重修可重新选择道基。
        <button class="btn-sm" style="display:block;margin-top:8px" @click="send('prestige')">转世重修 · 道行 +{{ st.prestigeGain(S()) }}</button>
      </div>
      <p v-else class="ds">丹房按方炼制，材料齐备必成。筑基须另备对应筑基之物，其他破境条件在「道途」页查看。</p>
      <label class="ds"><input type="checkbox" v-model="allRecipes"> 显示全部丹方（含未解锁）</label>
      <div v-for="[k, p] in recipes" :key="k" class="recipe-card">
        <div class="nm">{{ p.icon }} {{ p.name }} <b>×{{ S().pills[k] }}</b></div>
        <div v-if="st.pillBlockReason(S(), k)" class="ds">{{ st.pillBlockReason(S(), k) }}</div>
        <div class="ds">{{ GX.REALMS[p.minRealm].name }}解锁 · 丹房 {{ p.furnace }} 级 · 灵石 {{ fmt(st.pillCost(S(), k)) }}</div>
        <div class="material-chips">
          <span v-for="(n, id) in p.materials" :key="id" :class="['badge', { on: S().materials[id] >= n }]" :title="GX.MATERIALS[id].source">{{ GX.MATERIALS[id].name }} {{ S().materials[id] }}/{{ n }}</span>
        </div>
        <button class="btn-sm" :disabled="!st.craftInfo(S(), k).ok" @click="send('craft:' + k)">炼制{{ p.name }}</button>
        <div class="ds" v-if="!st.craftInfo(S(), k).ok">尚缺：{{ st.craftInfo(S(), k).missing.join('、') }}</div>
      </div>
    </div>
    <div v-if="supportsProgression" class="panel" style="margin-bottom:12px">
      <h2>灵 材 · 行 囊</h2>
      <p class="ds">普通灵材可用灵石购买，低阶材料不随境界涨价；筑基专属灵材只能亲历获得。</p>
      <div v-for="(m, id) in materials" :key="id" class="row material-row">
        <div class="info">
          <div class="nm">{{ m.name }} <b>×{{ S().materials[id] }}</b></div>
          <div class="ds">{{ materialSource(id, m) }}{{ S().realmIdx < m.minRealm ? `（${GX.REALMS[m.minRealm].name}解锁）` : '' }}</div>
        </div>
        <span v-if="m.bound" class="badge">亲历所得</span>
        <button v-else class="btn-sm" :disabled="S().realmIdx < m.minRealm || S().spirit < st.materialCost(S(), id)" @click="send('material:' + id)">购 1 份<small>{{ fmt(st.materialCost(S(), id)) }} 灵石</small></button>
      </div>
    </div>
    <div class="panel">
      <h2>仙 丹</h2>
      <div class="row" v-for="(p, k) in ordinaryPills" :key="k">
        <div class="info">
          <div class="nm">{{ p.icon }} {{ p.name }} <b>×{{ S().pills[k] }}</b></div>
          <div class="ds">{{ pillDescription(S(), k) }}</div>
          <div v-if="p.graded" class="ds">{{ grades(k) || '暂无库存' }} · 低一境药效50%，更低25%</div>
          <div class="ds">{{ Object.entries(pillMaterials(S(), k)).map(([id, n]) => `${GX.MATERIALS[id].name} ${S().materials[id]}/${n}`).join(' · ') }}</div>
          <div v-if="!st.craftInfo(S(), k).ok" class="ds">尚缺：{{ st.craftInfo(S(), k).missing.join('、') }}</div>
        </div>
        <button class="btn-sm" :disabled="S().pills[k] <= 0 || k === 'dujie' || p.battleOnly" @click="send('pill:' + k)">{{ p.battleOnly ? '战斗使用' : k === 'dujie' ? '自动护体' : '服用' }}</button>
        <button class="btn-sm" :disabled="!st.craftInfo(S(), k).ok" @click="send('craft:' + k)">炼({{ fmt(st.pillCost(S(), k)) }})</button>
      </div>
    </div>

    <div class="panel" style="margin-top:12px">
      <h2>炼 器 · 缘 物</h2>
      <label class="ds">器型 <select v-model="forgeType"><option v-for="(type, id) in GX.TREASURE_TYPES" :key="id" :value="id">{{ type.name }}</option></select></label>
      <div class="row" v-for="t in GX.TREASURES" :key="t.q">
        <div class="info">
          <div class="nm">🔨 {{ t.name }}法宝</div>
          <div class="ds">{{ GX.TREASURE_TYPES[forgeType].desc(t.q) }}{{ S().bld.forge < t.q ? `（需炼器台Lv${t.q}）` : '' }}</div>
          <div v-if="S().bld.forge >= t.q" class="cost">{{ shardNm[st.shardCost(S(), t.q).key] }}残片 ×{{ st.shardCost(S(), t.q).n }}</div>
        </div>
        <button class="btn-sm" :disabled="S().bld.forge < t.q || S().shards[st.shardCost(S(), t.q).key] < st.shardCost(S(), t.q).n"
          @click="send('forgekind:' + t.q + '_' + forgeType)">炼造</button>
      </div>
      <div class="row" style="border:0">
        <div class="info">
          <div v-if="S().treasure" class="nm">本命法宝：{{ GX.TREASURES[S().treasure.q - 1].name }}{{ GX.TREASURE_TYPES[S().treasure.type].name }}</div>
          <div v-else class="nm">本命法宝：无</div>
          <div v-if="S().treasure" class="ds">{{ GX.TREASURE_TYPES[S().treasure.type].desc(S().treasure.q) }}（重炼熔旧折现，保留已有词条）</div>
          <div v-else class="ds">炼造即装备，可替换；成器后可祭炼加词条</div>
          <div v-if="S().treasure && S().treasure.words && Object.keys(S().treasure.words).length" class="ds" style="margin-top:4px">
            <span v-for="(lv, id) in S().treasure.words" :key="id" :class="['badge', 'on']" :title="GX.REFINE_WORDS[id].desc(lv)">
              {{ GX.REFINE_WORDS[id].name }}·{{ lv }}
            </span>
          </div>
        </div>
        <button v-if="S().treasure" class="btn-sm"
          :disabled="st.refineCost(S()) && (S().spirit < st.refineCost(S()).spirit || S().shards[st.refineCost(S()).shardKey] < st.refineCost(S()).shard || Object.keys(GX.REFINE_WORDS).every(id => st.wordLevel(S(), id) >= 3))"
          @click="send('refine')">
          祭炼<small>{{ fmt(st.refineCost(S()).spirit) }}灵石+残片×{{ st.refineCost(S()).shard }}</small>
        </button>
      </div>
      <hr>
      <div class="row">
        <div class="info">
          <div class="nm egg-list">
            <span v-for="(e, k) in GX.EGGS" :key="k" class="egg-item">
              {{ e.name }}×{{ S().eggs[k] }}
              <button class="btn-xs" :disabled="S().eggs[k] <= 0 || S().beasts[k] >= GX.BEASTS[k].stars" @click="send('hatch:' + k)">孵化</button>
              <button class="btn-xs" :disabled="S().eggs[k] <= 0" @click="send('egg:' + k)">放({{ fmt(st.eggPrice(S(), k)) }})</button>
            </span>
          </div>
          <div class="ds">灵兽蛋 · 孵化升星（每星全产出+2%）或放生换灵石</div>
        </div>
      </div>
    </div>
  </div>
</template>
