<script setup>
import { computed } from 'vue';
import { game, send } from '../store/game.js';
import { GX, fmt, fmtTime } from '../../shared/data.js';
import * as st from '../../shared/state.js';
import { SPELLS, SPELL_DESCRIPTIONS, MODES, STRATEGIES, COMBAT_ITEMS } from '../../shared/combat-data.js';
import { combatStats, effectiveLoadout, availableSpells, chapterOf, chapterMax } from '../../shared/combat.js';
import { actionInfo } from '../../shared/combat-simulation.js';
const S = computed(() => game.S), B = computed(() => game.battle);
const modern = computed(() => B.value?.version === 2);
const stats = computed(() => combatStats(S.value));
const ready = computed(() => game.activity?.canStart && S.value.taoCd <= 0 && S.value.buffs.shock <= 0);
const nodes = computed(() => GX.TAO_MAP.map(node => ({ ...node, enemy: st.taoEnemy(S.value, node.id) })));
const loadout = computed(() => effectiveLoadout(S.value));
const choices = computed(() => availableSpells(S.value));
const study = computed(() => Object.entries(SPELLS).filter(([id, skill]) => id.endsWith('2') && st.rootIds(S.value.root).includes(skill.root) && !S.value.combat?.learned.includes(id)));
const actions = computed(() => {
  if (!modern.value) return [];
  const b = B.value;
  const ids = ['strike', 'guard', 'breathe', ...b.loadout.map(id => `spell_${id}`), 'treasure', 'beast', ...(b.playerCharge ? ['release', 'cut'] : []), ...COMBAT_ITEMS.map(id => `pill_${id}`)];
  return ids.map(id => {
    const info = actionInfo(b, id);
    return { id, ...info, label: id.startsWith('pill_') ? GX.PILLS[id.slice(5)].name : info.name || (id === 'treasure' ? '法宝' : '灵兽') };
  });
});
const queuedName = computed(() => actions.value.find(a => a.id === B.value?.queued)?.label);
const statusText = side => {
  const s = B.value?.status?.[side]; if (!s) return '';
  const r = B.value.turn + 1, labels = [];
  if (s.shield && s.shieldUntil >= r) labels.push(`护盾 ${fmt(s.shield)}`);
  if (s.burn.length) labels.push(`灼烧 ×${s.burn.length}`);
  if (s.brokenUntil >= r) labels.push('破甲');
  if (s.vineUntil >= r) labels.push('缠绕');
  if (s.chill && s.chillUntil >= r) labels.push(`寒意 ×${s.chill}`);
  if (s.immuneUntil >= r) labels.push(`定心 ${s.immuneUntil - r + 1} 回合`);
  if (s.stun) labels.push('受控');
  return labels.join(' · ') || '状态平稳';
};
</script>

<template>
  <div class="panel grow combat-panel">
    <h2>{{ B ? '斗 法 · 临 阵' : '讨 伐 · 备 战' }}</h2>
    <p class="ds">战败折寿 {{ st.battleLifeLoss(S) }} 年；正常撤离不额外折寿。每回合只有一次主行动。</p>
    <p v-if="!B" class="ds">讨伐是可选试炼：产出的都是可挂机或可购买的资源，破境不要求打赢任何一场战斗。寻道录里的取物试炼也另有「稳妥取物」一途。</p>
    <template v-if="!B">
      <div class="combat-summary"><span>气血 <b>{{ fmt(S.combat?.hp ?? stats.hp) }}/{{ fmt(stats.hp) }}</b></span><span>真元 <b>{{ fmt(S.combat?.mana ?? 100) }}/100</b></span><span>攻击 {{ fmt(stats.atk) }} · 护甲 {{ fmt(stats.armor) }}</span><span>药力 {{ S.combat?.medicine || 0 }}/3</span></div>
      <button class="btn-sm" :disabled="!game.activity?.canStart" @click="send('recover')">回府调息 · 60秒</button>
      <p v-if="S.taoCd > 0 || S.buffs.shock > 0 || game.activity?.busy" class="ds">{{ game.activity?.busy ? `正在${game.activity.label}` : S.buffs.shock > 0 ? `伤势恢复 ${fmtTime(S.buffs.shock)}` : `出征间隔 ${fmtTime(S.taoCd)}` }}</p>
      <div class="combat-config">
        <label v-for="(id, slot) in loadout" :key="slot">术法 {{ slot + 1 }}<select :value="id" :disabled="!game.activity?.canStart" @change="send(`battleloadout:${slot}_${$event.target.value}`)"><option v-for="key in choices" :key="key" :value="key">{{ SPELLS[key].name }}</option></select><small>{{ SPELL_DESCRIPTIONS[SPELLS[id].effect] }}</small></label>
        <label>出战灵兽<select :value="S.combat?.pet || ''" :disabled="!game.activity?.canStart" @change="send('pet:' + $event.target.value)"><option value="" disabled>自动选择已有灵兽</option><option v-for="(pet, id) in GX.BEASTS" :key="id" :value="id" :disabled="!S.beasts[id]">{{ pet.name }} · {{ S.beasts[id] }}星</option></select></label>
      </div>
      <details v-if="study.length"><summary>本系进阶术法</summary><div class="row" v-for="[id, skill] in study" :key="id"><div class="info"><b>{{ skill.name }}</b><small>{{ SPELL_DESCRIPTIONS[skill.effect] }} 练气四层起，灵石60、灵液2，参悟60秒。</small></div><button class="btn-xs" :disabled="!game.activity?.canStart || (S.realmIdx === 0 && S.layer < 4) || S.spirit < 60 || S.materials.essence < 2" @click="send('study:' + id)">参悟</button></div></details>
    </template>
    <div v-if="!B || modern" class="combat-config">
      <label>战斗模式<select :value="B?.mode || S.combat?.mode || 'semi'" @change="send('battlemode:' + $event.target.value)"><option v-for="(label, id) in MODES" :key="id" :value="id">{{ label }}</option></select></label>
      <label>自动策略<select :value="B?.strategy || S.combat?.strategy || 'balanced'" @change="send('strategy:' + $event.target.value)"><option v-for="(label, id) in STRATEGIES" :key="id" :value="id">{{ label }}</option></select></label>
      <label class="check"><input type="checkbox" :checked="B?.autoPills ?? S.combat?.autoPills ?? false" @change="send('combatoption:autopills')">允许自动使用行囊恢复丹</label>
      <label class="check"><input type="checkbox" :checked="B?.combos ?? S.combat?.combos ?? false" @change="send('combatoption:combos')">木火连携：消耗缠绕加强赤焰</label>
    </div>
    <template v-if="modern">
      <div class="intent-card" :class="{ danger: B.paused || B.waiting }" role="status"><b>{{ B.e.name }} · {{ B.intent.name }}</b><p>{{ B.intent.kind === 'charge' ? '正在蓄力，下回合释放；准备守御或打断。' : `本回合直接伤害上界约 ${fmt(B.intent.maxDamage)}，尚未计入你将采取的防护。` }}</p><small>{{ B.intent.interruptible ? '当前蓄力可以打断' : '当前没有可打断的蓄力' }}</small><p v-if="B.paused || B.waiting">已暂停人物与洞府计时。选择行动后继续。</p></div>
      <div class="tao-bars"><div class="tao-side"><div>你 · {{ fmt(B.pPh) }}/{{ fmt(B.pMax) }}</div><div class="bar"><i :style="{ width: 100 * B.pPh / B.pMax + '%' }"></i></div><small>真元 {{ fmt(B.pMana) }}/100 · {{ statusText('player') }}</small></div><div class="tao-vs">第 {{ B.turn + 1 }} 回合</div><div class="tao-side"><div>{{ B.e.name }} · {{ fmt(B.eHp) }}/{{ fmt(B.eMax) }}</div><div class="bar foe"><i :style="{ width: 100 * B.eHp / B.eMax + '%' }"></i></div><small>{{ statusText('enemy') }}</small></div></div>
      <p v-if="B.pet" class="ds">{{ GX.BEASTS[B.pet.kind].name }} · 气血 {{ fmt(B.petHp) }}/{{ fmt(B.petMax) }}{{ B.petHp <= 0 ? ' · 已退场，回府调息护理' : '' }}</p>
      <p v-if="B.quest" class="ds">胜利完成当前寻物步骤；撤离或败退返还封存阵材，已用丹符不退。</p>
      <div class="tao-acts"><button v-for="a in actions" :key="a.id" class="btn-sm" :class="{ selected: B.queued === a.id }" :disabled="!a.ok" :title="a.reason" @click="send('taoact:' + a.id)">{{ a.label }}<small>{{ a.ok ? a.id.startsWith('pill_') ? `行囊 ×${B.supplies[a.id.slice(5)]}` : a.cost ? `${a.cost} 真元` : '一次主行动' : a.reason }}</small></button><button class="btn-sm" @click="send('taoflee')">撤离<small>放弃本场奖励</small></button></div>
      <p class="ds">{{ queuedName ? `已选：${queuedName}，在本回合行动时机执行。` : '自动与手动共用1.6秒节拍，选择动作会替换下一次自动出手。' }} 恢复丹药力 {{ B.medicine }}/3。</p>
    </template>
    <template v-else-if="B">
      <p>旧版战斗续接 · {{ B.e.name }} · 回合 {{ B.turn }}</p><p>气血 {{ fmt(B.pPh) }}/{{ fmt(B.pMax) }}；敌方 {{ fmt(B.eHp) }}/{{ fmt(B.eMax) }}</p><p class="ds">这场按旧规则收尾，下一次出战使用新系统。</p>
      <div class="tao-acts"><button v-for="[id, label] in [['strike','出手'],['guard','守御'],['treasure','法宝'],['beast','灵兽'],['pill_huichun','回春丹']]" :key="id" class="btn-sm" @click="send('taoact:' + id)">{{ label }}</button><button class="btn-sm" @click="send('taotoggle')">切换自动／手动</button><button class="btn-sm" @click="send('taoflee')">撤退</button></div>
    </template>
    <template v-else>
      <hr><label class="combat-chapter">地域篇章<select :value="chapterOf(S)" :disabled="!game.activity?.canStart" @change="send('chapter:' + $event.target.value)"><option v-for="(realm, id) in GX.REALMS.slice(0, S.realmIdx + 1)" :key="id" :value="id">{{ realm.name }}篇</option></select></label>
      <p class="ds">每篇敌人与奖励固定。各类恢复丹与符最多携带3件，战中不能补货。</p>
      <div class="tao-map"><div v-for="m in nodes" :key="m.id" :class="['tao-node', { lock: m.id > chapterMax(S) }]"><div class="tao-ico">{{ m.icon }}</div><div class="tao-bd"><b>{{ m.name }}</b><p class="ds">{{ m.enemy.name }} · 气血 {{ fmt(m.enemy.hp) }} · 攻击 {{ fmt(m.enemy.atk) }}</p><small>灵石 {{ fmt(m.enemy.spirit) }} · 地脉精华1{{ m.id === 5 ? ' · 天灵晶1' : '' }}</small><div class="tao-btnrow"><button class="btn-xs" :disabled="!ready || m.id > chapterMax(S)" @click="send('tao:' + m.id)">{{ m.id > chapterMax(S) ? '尚未开启' : '出战' }}</button></div></div></div></div>
    </template>
  </div>
</template>
<style scoped>
.combat-panel { display: flex; flex-direction: column; gap: 12px; }
.combat-panel.panel { flex: 0 0 auto; min-height: 100%; }
.tao-map { flex: none; overflow: visible; }
.combat-summary, .combat-config { display: flex; flex-wrap: wrap; gap: 12px 20px; }
.combat-summary { padding: 12px; border: 1px solid var(--line, #d7c9ae); border-radius: 6px; }
.combat-config label { flex: 1 1 150px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.combat-config label.check { flex-basis: 100%; flex-direction: row; align-items: center; }
small { display: block; opacity: .8; line-height: 1.7; }
select { padding: 7px; border: 1px solid var(--line, #d7c9ae); border-radius: 4px; color: inherit; background: transparent; }
.combat-chapter { display: flex; gap: 15px; align-items: center; }
.intent-card { padding: 14px; border-left: 3px solid #a37c38; background: #a37c3812; }
.intent-card.danger { border-color: #a14a37; background: #a14a3714; }
.intent-card p { margin: 6px 0; line-height: 1.6; }
.selected { outline: 2px solid #a37c38; }
.tao-side { min-width: 0; }.tao-side small { font-size: 12px; }.tao-acts { gap: 8px; }
@media(max-width: 600px) { .tao-bars { flex-wrap: wrap; }.tao-side { flex-basis: 100%; }.tao-vs { text-align: center; width: 100%; } }
</style>
