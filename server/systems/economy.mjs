import { GX, fmt } from '../../shared/data.js';
import * as st from '../../shared/state.js';
import { legacyRoot } from '../../shared/relic-state.js';
import { ensureCombat } from '../../shared/combat.js';
import { initLife, syncLife, repairLife, extendLife } from '../../shared/life.js';
import { pillMaterials, addPills, bestPillTier, pillPotency, takePill } from '../../shared/inventory.js';

export const economyActions = {
  toggleAltar() {
    if (!this.canAct() || this.S.bld.altar <= 0) return;
    this.S.altarEnabled = this.S.altarEnabled === false;
    this.log(this.S.altarEnabled ? '道坛开炉，继续燃灵凝练修为。' : '道坛熄炉，保留灵石用于经营与破境筹备。', 'dim');
    return true;
  },
  doCultivate() {
    if (!this.canStartActivity()) return;
    const S = this.S, now = Date.now(), combo = this.combo;
    // 连击：窗口内连续点击累积，仅放大本次点击收益，不改 cultPerClick()。
    combo.n = now - combo.at > GX.COMBO.windowMs ? 1 : Math.min(GX.COMBO.max, combo.n + 1);
    combo.at = now;
    combo.hit = Math.random() < st.critChance(S);
    const mult = (1 + (combo.n - 1) * GX.COMBO.step) * (combo.hit ? GX.CRIT.mult : 1);
    S.cult += Math.ceil(st.cultPerClick(S) * mult);
    S.clicks++;
    this.rollDrops();
    return true;
  },
  rollDrops() {
    const S = this.S, msgs = [];
    if (Math.random() < st.dropChance(S, 'spirit')) {
      let n = Math.ceil(20 * (S.realmIdx + 1));
      if (st.hasRoot(S, 'tiandao')) n *= 2;
      S.spirit += n; msgs.push(`💠 灵气汇聚，灵石 +${fmt(n)}`);
    }
    if (Math.random() < st.dropChance(S, 'shard')) {
      const r = Math.random(), key = r < 0.50 ? 'fan' : r < 0.80 ? 'ling' : r < 0.95 ? 'xuan' : 'di';
      S.shards[key]++;
      msgs.push(`🔨 拾得${{ fan: '凡品', ling: '灵品', xuan: '玄品', di: '地品' }[key]}法宝残片×1`);
    }
    if (Math.random() < st.dropChance(S, 'egg')) {
      const r = Math.random(), egg = r < 0.60 ? 'fan' : r < 0.85 ? 'ling' : r < 0.95 ? 'xuan' : 'di';
      S.eggs[egg]++; S.eggsGot++;
      msgs.push(`🥚 机缘蛋现世（${GX.EGGS[egg].name}）`);
    }
    if (msgs.length) this.log('✨ 机缘：' + msgs.join('；'), 'good');
  },

  startHerb() {
    if (!this.canStartActivity()) return;
    this.pending.herb = { remaining: 15 };
    this.log('你负箧采药，深入山林…（15秒）');
    return true;
  },
  startRoam() {
    if (!this.canStartActivity()) return;
    this.pending.roam = { remaining: 45 };
    this.log('你沿熟悉的山道巡采…（45秒，安全取得灵液与地脉精华）');
    return true;
  },

  usePill(k) {
    const S = this.S, p = GX.PILLS[k];
    if (!this.canAct() || !Object.hasOwn(GX.PILLS, k) || !(S.pills[k] > 0)) return;
    if (p.breakthrough) { this.log('破境丹需在筹备破境中择法使用', 'dim'); return; }
    if (p.battleOnly) { this.log('符箓需在战斗行囊中使用。', 'dim'); return; }
    if (k === 'dujie') { this.log('渡劫丹将在渡劫时自动消耗，无需提前服用', 'dim'); return; }
    if (k === 'xuan' && S._xuanActive) { this.log('玄丹之力已在体内，无需再服', 'dim'); return; }
    const tier = bestPillTier(S, k);
    if (k === 'huichun' || k === 'huiyuan') {
      const current = S.combat;
      if (current?.medicine >= 3) return { ok: false, changed: false, reasonCode: 'medicine_limit' };
      if (k === 'huichun' && (!current || current.hp >= current.maxHp) && S.buffs.shock <= 0) return { ok: false, changed: false, reasonCode: 'health_full' };
      if (k === 'huiyuan' && (!current || current.mana >= 100)) return { ok: false, changed: false, reasonCode: 'mana_full' };
      const c = ensureCombat(S), factor = [1, .8, .6][c.medicine] * pillPotency(S, k, tier);
      if (!takePill(S, k, tier)) return;
      if (k === 'huichun') { c.hp = Math.min(c.maxHp, c.hp + Math.floor(c.maxHp * .3 * factor)); S.buffs.shock = Math.max(0, S.buffs.shock - 15); }
      else c.mana = Math.min(100, c.mana + Math.floor(30 * factor));
      c.medicine++;
      this.log(`服下${p.name}，恢复${k === 'huichun' ? '气血' : '真元'}；当前药力 ${c.medicine}/3。`, 'good');
    } else if (k === 'yangyuan' || k === 'yanshou') {
      if (!this.canStartActivity() || tier == null || tier < S.realmIdx - 1) return;
      const gain = k === 'yangyuan' ? repairLife(S, Math.ceil(GX.REALMS[tier].life * .02)) : extendLife(S, Math.ceil(GX.REALMS[tier].life * .04));
      if (!gain) { this.log('暂无可用的本源修复或延寿额度，未消耗丹药。', 'dim'); return; }
      takePill(S, k, tier);
      this.log(`${p.name}生效，余寿 +${gain} 年；自然修行岁月保持不变。`, 'good');
    } else {
      takePill(S, k);
      if (k === 'juli') { const v = Math.ceil(st.cultPerClick(S) * GX.JULI_MULT); S.cult += v; this.log(`服下聚灵丹，修为 +${fmt(v)}`, 'good'); }
      else if (k === 'xuan') { S._xuanActive = true; this.log('玄丹入腹，护持下一次渡劫。', 'good'); }
    }
    return true;
  },
  craftPill(k) {
    if (!this.canAct() || !Object.hasOwn(GX.PILLS, k)) return;
    const c = st.pillCost(this.S, k);
    if (!st.craftInfo(this.S, k).ok) return;
    for (const [id, n] of Object.entries(pillMaterials(this.S, k))) this.S.materials[id] -= n;
    this.S.spirit -= c; addPills(this.S, k);
    this.log(`炼丹成功：${GX.PILLS[k].icon}${GX.PILLS[k].name} ×1（耗灵石 ${fmt(c)}）`, 'good');
    return true;
  },
  buyMaterial(id) {
    if (!this.canAct() || !Object.hasOwn(GX.MATERIALS, id)) return;
    const m = GX.MATERIALS[id], cost = st.materialCost(this.S, id);
    if (m.bound || this.S.realmIdx < m.minRealm || this.S.spirit < cost) return;
    this.S.spirit -= cost; this.S.materials[id]++;
    this.log(`购入${m.name} ×1（灵石 -${fmt(cost)}）`, 'dim');
    return true;
  },
  forgeRelic(id) {
    if (!this.canAct() || !st.relicInfo(this.S, id).ok) return;
    const r = GX.FOUNDATION_RELICS[id];
    for (const [key, n] of Object.entries(r.materials)) this.S.materials[key] -= n;
    this.S.relics[id]++;
    this.log(`☯️ ${r.verb}成功：<b>${r.name}</b>。筑基失败仍保留，成功时融入道基。`, 'good');
    return true;
  },
  gatherMaterials(activity) {
    const gained = [];
    for (const [id, m] of Object.entries(GX.MATERIALS)) {
      if (m.activity !== activity || this.S.realmIdx < m.minRealm) continue;
      if (id === 'vein_jade' && !legacyRoot(this.S)) continue;
      this.S.materials[id] += m.amount;
      gained.push(`${m.name} ×${m.amount}`);
    }
    if (gained.length) this.log(`行囊入库：${gained.join('、')}`, 'good');
  },
  buyBld(id) {
    if (!this.canAct() || !GX.BLDS.some(b => b.id === id)) return;
    if (id === 'altar' && this.S.realmIdx < 3) { this.log('道坛灵机未开，元婴方可设坛', 'dim'); return; }
    const cost = st.bldCost(this.S, id);
    if (this.S.spirit < cost) return;
    this.S.spirit -= cost; this.S.bld[id]++;
    this.log(`洞府扩建：${GX.BLDS.find(x => x.id === id).icon}${GX.BLDS.find(x => x.id === id).name} 升至 ${this.S.bld[id]} 级（耗灵石 ${fmt(cost)}）`, 'good');
    return true;
  },
  buyGongfa() {
    if (!this.canAct()) return;
    const S = this.S;
    if (S.gongfaLv >= st.gongfaMaxLv(S)) { this.log('功法已至当前境界所能承载的品阶，待境界提升再参悟', 'dim'); return; }
    if (this.panel) { this.log('心绪未定，暂且无法参悟', 'dim'); return; }
    const cost = st.gongfaCost(S);
    if (S.spirit < cost) { this.log(`灵石不足，参悟需 ${fmt(cost)}`, 'dim'); return; }
    const tier = S.gongfaLv - 1; // 即将参悟的品阶（0 起）
    const books = GX.GONGFA_BOOKS[tier];
    this.panel = { kind: 'gongfa', data: {
      tier, cost, costTxt: fmt(cost),
      tierName: GX.GONGFA_TIERS[tier].name,
      text: `识海深处，三道功法真意浮沉不定。择一而修（耗灵石 ${fmt(cost)}），此念既定，当世不改。`,
      opts: [...books.map(b => ({ id: b.id, label: `${GX.GONGFA_SCHOOL_ICON[b.school]} ${b.name}`, detail: b.text, school: b.school })),
        { id: 'later', label: '暂且放下', detail: '不耗灵石，来日再悟' }],
    } };
    this.log(`📖 你凝神入定，三部${GX.GONGFA_TIERS[tier].name}功法真意浮现识海，择一而修…`, 'good');
    return true;
  },
  applyGongfaOption(id) {
    const p = this.panel;
    if (!this.canAct() || !p || p.kind !== 'gongfa') return;
    const S = this.S, d = p.data;
    if (id === 'later') { this.closePanel(); this.log('你将功法真意按下不表，来日再悟', 'dim'); return true; }
    const book = GX.GONGFA_BY_ID[id];
    if (!book || d.tier !== S.gongfaBook.length || S.gongfaLv >= st.gongfaMaxLv(S) || !GX.GONGFA_BOOKS[d.tier].some(b => b.id === id)) return;
    if (S.spirit < d.cost) { this.log(`灵石不足，参悟需 ${fmt(d.cost)}`, 'dim'); this.closePanel(); return { ok: false, changed: true, reasonCode: 'insufficient_resources' }; }
    S.spirit -= d.cost;
    initLife(S);
    S.gongfaBook.push(id);
    S.gongfaLv = 1 + S.gongfaBook.length;
    syncLife(S);
    if (S.combat) ensureCombat(S);
    this.closePanel();
    this.log(`📖 参悟功成：<b>${GX.GONGFA_SCHOOL_ICON[book.school]}${book.name}</b>（${GX.GONGFA_TIERS[d.tier].name} · 第 ${S.gongfaLv} 重）——${book.text}`, 'good');
    return true;
  },

  forgeNamed(value) {
    const [q, type] = value.split('_');
    if (!Object.hasOwn(GX.TREASURE_TYPES, type)) return;
    return this.forgeTreasure(Number(q), false, type);
  },
  forgeTreasure(q, free, chosenType) {
    if (!this.canAct() || !Number.isInteger(q) || q < 1 || q > GX.TREASURES.length) return;
    if (!free && this.S.bld.forge < q) return;
    const S = this.S, need = st.shardCost(S, q);
    if (!free && S.shards[need.key] < need.n) return;
    if (!free) S.shards[need.key] -= need.n;
    const types = Object.keys(GX.TREASURE_TYPES);
    const type = chosenType || types[Math.random() * types.length | 0];
    let keep = {};
    if (S.treasure) {
      const refund = Math.ceil(GX.TREASURES[S.treasure.q - 1].shard * 0.6 * (S.realmIdx + 1));
      S.spirit += refund;
      this.log(`旧法宝熔炼，折算灵石 ${fmt(refund)}`, 'dim');
      for (const id in S.treasure.words || {})
        if ((S.treasure.words[id] || 0) > 0) keep[id] = S.treasure.words[id];
    }
    S.treasure = { q, type, words: keep };
    if (S.combat) ensureCombat(S);
    S.forgeN++;
    const tq = GX.TREASURES[q - 1], tt = GX.TREASURE_TYPES[type];
    this.markSeen('treasures', q + '_' + type, `${tq.name}·${tt.name}`);
    this.log(`🔨 炼器成：${tq.name}${tt.name}（${tt.desc(q)}）`, 'good');
    if (Object.keys(keep).length) this.log('🔥 祭炼之火未灭旧纹，词条 ' + Object.keys(keep).map(id => GX.REFINE_WORDS[id].name).join('、') + ' 随火转入新器', 'dim');
    return true;
  },
  refineTreasure() {
    if (!this.canAct()) return;
    const S = this.S;
    if (!S.treasure) { this.log('尚无法宝可祭炼', 'dim'); return; }
    if (Object.keys(GX.REFINE_WORDS).every(id => st.wordLevel(S, id) >= 3)) { this.log('法宝纹路已满，再炼无用', 'dim'); return; }
    const c = st.refineCost(S);
    if (S.spirit < c.spirit || S.shards[c.shardKey] < c.shard) { this.log('祭炼所需的灵石或残片不足', 'dim'); return; }
    S.spirit -= c.spirit; S.shards[c.shardKey] -= c.shard;
    const avail = Object.keys(GX.REFINE_WORDS).filter(id => st.wordLevel(S, id) < 3);
    const id = avail[Math.random() * avail.length | 0];
    S.treasure.words = S.treasure.words || {};
    S.treasure.words[id] = (S.treasure.words[id] || 0) + 1;
    this.log(`🔥 祭炼成：本命法宝铭刻 ${GX.REFINE_WORDS[id].name}（${GX.REFINE_WORDS[id].desc(S.treasure.words[id])}），耗灵石 ${fmt(c.spirit)}、残片 ×${c.shard}`, 'good');
    return true;
  },
  releaseEgg(kind) {
    const S = this.S;
    if (!this.canAct() || !Object.hasOwn(GX.EGGS, kind) || !(S.eggs[kind] > 0)) return;
    S.eggs[kind]--;
    const price = st.eggPrice(S, kind);
    S.spirit += price;
    this.log(`放生 ${GX.EGGS[kind].name}灵兽蛋，换灵石 ${fmt(price)}`, 'dim');
    return true;
  },
  hatchEgg(kind) {
    const S = this.S;
    if (!this.canAct() || !Object.hasOwn(GX.EGGS, kind) || !(S.eggs[kind] > 0)) return;
    const cap = GX.BEASTS[kind].stars, have = S.beasts[kind];
    if (have >= cap) { this.log(`${GX.EGGS[kind].name}灵兽已至 ${cap} 星，蛋可继续放生`, 'dim'); return; }
    S.eggs[kind]--; S.beasts[kind] = have + 1;
    this.markSeen('beasts', kind, GX.BEASTS[kind].name);
    this.log(`🐣 ${GX.EGGS[kind].name}灵兽蛋孵化，${GX.BEASTS[kind].name} 升至 ${S.beasts[kind]} 星（全产出 +${S.beasts[kind] * 2}%）`, 'good');
    return true;
  },
};
