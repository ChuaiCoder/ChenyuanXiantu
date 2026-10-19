import { ensureCombat } from '../../shared/combat.js';
import { GX } from '../../shared/data.js';
import * as st from '../../shared/state.js';
import { initLife, syncLife } from '../../shared/life.js';
import { takePill } from '../../shared/inventory.js';

export const progressionActions = {
  breakInfo() { return st.breakInfo(this.S); },
  doBreak() {
    if (!this.canStartActivity()) return;
    const S = this.S, info = this.breakInfo();
    if (!info.ok) { this.log(info.txt, 'dim'); return; }
    if (st.isTopLayer(S)) return this.openRealm();
    if (S.realmIdx === GX.TRIB_REALM || (S.realmIdx > GX.TRIB_REALM && st.isXianTriLayer(S))) { this.openTribulation(); return true; }
    const success = Math.random() < st.tribChance(S, info.kind);
    if (S.pills.dujie > 0) { takePill(S, 'dujie'); this.log('渡劫丹自行燃尽护体…', 'dim'); }
    if (S._xuanActive) S._xuanActive = false;
    if (success) {
      S.cult = Math.max(0, S.cult - st.layerNeed(S));
      S.breaks++;
      S.layer++; if (S.combat) ensureCombat(S); this.log(`⚡ 冲过小劫，突破至 <b>${GX.REALMS[S.realmIdx].name}期 ${S.layer} 层</b>！`, 'good');
    } else {
      S.cult = Math.floor(S.cult * 0.7);
      S.buffs.shock = Math.max(S.buffs.shock, 20);
      this.log('💥 劫雷反噬！三成修为散逸，重伤 20 秒…', 'bad');
    }
    return true;
  },
  realmPanelData() {
    if (st.foundationCapped(this.S)) return {
      realmIdx: this.S.realmIdx, name: '此世道基已至上限',
      text: `${st.foundationName(this.S)}止于${GX.REALMS[this.S.realmIdx].name}圆满。此世无法继续破境，无需再炼下一境丹药。转世将重新抽根、筹备筑基之物，保留道行、道果等跨世积累。`,
      opts: [{ id: 'rebirth', label: `转世重修 · 道行 +${st.prestigeGain(this.S)}`, detail: `此生凝结道果 +${st.lifeFruit(this.S)}，即使第一世也可转世` },
        { id: 'later', label: '暂留此世', detail: '关闭面板，继续游历' }],
    };
    const gate = GX.BREAKTHROUGHS[this.S.realmIdx];
    return {
      realmIdx: this.S.realmIdx, name: gate.name,
      text: `${gate.text}<br>${this.S.realmIdx === 0 ? '需备齐对应灵根、同品级的筑基主材，混合灵根须完成合灵；失败全部保留，成功才融入道基。所用主材方案在丹器寻道录中选择。<br>' : ''}每次尝试消耗一枚破境丹；失败损失三成修为，功法与心得保留。大境界每次失败，下次成功率 +5 个百分点（最多 +30，上限 98%）。飞升与证道在条件齐备后必成。`,
      opts: [...st.realmPlans(this.S).map(p => ({ id: p.id, label: `${p.name} · ${Math.round(p.chance * 100)}%`, detail: `${p.desc}。${p.ok ? `消耗 ${GX.PILLS[p.pill].name} ×1${p.relic ? `；成功融入${p.relicName}` : ''}` : '尚缺：' + p.missing.join('、')}`, disabled: !p.ok || !!this.S.seek.active || !!this.battle?.quest })),
        { id: 'later', label: '继续筹备', detail: '关闭面板，不消耗任何物品' }],
    };
  },
  openRealm() {
    if (!this.canStartActivity()) return;
    this.panel = { kind: 'realm', data: this.realmPanelData() };
    return true;
  },
  applyRealmOption(id) {
    if (!this.canAct() || this.panel?.kind !== 'realm') return;
    if (id === 'later') { this.closePanel(); return true; }
    const S = this.S;
    if (this.panel.data.realmIdx !== S.realmIdx) return;
    if (id === 'rebirth') return st.foundationCapped(S) && this.doPrestige();
    const plan = st.realmPlans(S).find(p => p.id === id);
    if (!plan?.ok || S.seek.active || this.battle || S.med > 0 || S.study || S.recovery > 0 || this.pending.herb || this.pending.roam) return;
    const gate = GX.BREAKTHROUGHS[S.realmIdx], need = st.layerNeed(S);
    initLife(S);
    const success = Math.random() < plan.chance;
    takePill(S, plan.pill);
    this.closePanel(); // 先关闭，重复提交不能重复扣物或跨越下一境。
    if (!gate.certain) {
      if (S.pills.dujie > 0) { takePill(S, 'dujie'); this.log('渡劫丹自行燃尽护体…', 'dim'); }
      S._xuanActive = false;
    }
    if (!success) {
      S.realmFails++;
      S.cult = Math.floor(S.cult * .7);
      S.buffs.shock = Math.max(S.buffs.shock, 20);
      this.log(`💥 ${plan.name}未成，${GX.PILLS[plan.pill].name}已耗尽，三成修为散逸；下次破境获得磨砺加成。`, 'bad');
      return true;
    }
    S.cult = Math.max(0, S.cult - need); S.breaks++; S.realmFails = 0;
    if (gate.to === 1) { S.foundation = id; for (const item of plan.relicItems) S.relics[item]--; }
    S.milestones[gate.to] = { name: plan.name, pill: plan.pill, relic: plan.relic, relicItems: plan.relicItems, at: Date.now() };
    if (gate.to === 13) {
      S.ascended = true; this.checkAchievements(); this.ended = true;
      this.panel = { kind: 'end', data: { cause: '证道', gain: st.prestigeGain(S) } };
      this.log(`🌅 ${S.name}证道飞升，超脱三界！`, 'good');
    } else {
      S.realmIdx = gate.to; S.layer = 0;
      syncLife(S);
      if (S.combat) ensureCombat(S);
      this.log(`🌩️ ${plan.name}功成，踏入 <b>${GX.REALMS[S.realmIdx].name}</b>！${gate.to === 1 ? GX.FOUNDATIONS[id].desc + '；道基已定，改变上限须转世。' : ''}`, 'good');
      this.checkAchievements();
    }
    return true;
  },
  currentTri() {
    const S = this.S;
    if (S.realmIdx === GX.TRIB_REALM)
      return { tri: GX.TRIBS[S.layer], final: S.layer >= GX.REALMS[GX.TRIB_REALM].layers - 1 };
    const list = GX.XTRIBS[S.realmIdx - GX.TRIB_REALM - 1];
    return { tri: list.find(t => t.layer === S.layer) || list[0], final: st.isFinalTri(S) };
  },
  openTribulation() {
    const S = this.S, ct = this.currentTri(), tri = ct.tri, final = ct.final;
    const base = st.tribChance(S, 'layer'), fc = st.tribFruitCost(S);
    this._trib = { name: tri.name, text: final ? tri.text + `（此劫连败 ${S.tribFails} 次，因果累身，成功率已降至 ${Math.round(base * 100)}%）` : tri.text, opts: [
      { id: 'hard', label: '硬渡天劫', detail: `成功率 ${Math.round(Math.min(0.98, base + 0.08) * 100)}%`, disabled: false },
      { id: 'fruit', label: '借道果引渡', detail: `耗 ${fc} 道果 · 必成`, disabled: S.daoFruit < fc },
      { id: 'rider', label: '驭雷炼体', detail: `成功率 ${Math.round(Math.max(0.30, base - 0.08) * 100)}% · 成功残片+2`, disabled: false },
    ], isXian: S.realmIdx > GX.TRIB_REALM };
    this.panel = { kind: 'trib', data: this._trib };
  },
  applyTribOption(id) {
    if (!this.canAct() || this.panel?.kind !== 'trib' || !this._trib || !this._trib.opts.some(o => o.id === id)) return;
    const S = this.S;
    if (S.cult < st.layerNeed(S)) return;
    if (id === 'fruit' && S.daoFruit < st.tribFruitCost(S)) return;
    if (id === 'hard') this.settleTrib(Math.random() < Math.min(0.98, st.tribChance(S, 'layer') + 0.08), { hard: true });
    else if (id === 'fruit') { S.daoFruit -= st.tribFruitCost(S); this.settleTrib(true, { fruit: true }); }
    else if (id === 'rider') this.settleTrib(Math.random() < Math.max(0.30, st.tribChance(S, 'layer') - 0.08), { rider: true });
    return true;
  },
  settleTrib(ok, mode) {
    const S = this.S, triName = this.currentTri().tri.name;
    this.closePanel();
    if (!mode.fruit && S.pills.dujie > 0) { takePill(S, 'dujie'); this.log('渡劫丹自行燃尽护体…', 'dim'); }
    if (S._xuanActive) S._xuanActive = false;
    if (ok) {
      if (S.tribFails > 0) this.log('因果既断，劫云渐散。', 'dim');
      S.tribFails = 0;
      S.cult = Math.max(0, S.cult - st.layerNeed(S));
      S.layer++; S.breaks++; if (S.combat) ensureCombat(S);
      if (mode.rider) { S.shards.fan += 2; this.log('驭雷炼体，雷光淬骨，残片+2', 'good'); }
      this.log(`⚡ 渡${S.realmIdx > GX.TRIB_REALM ? '仙' : '天'}劫成功：${triName}，突破至 ${GX.REALMS[S.realmIdx].name}期 ${S.layer} 层`, 'good');
    } else {
      S.cult = Math.floor(S.cult * 0.7);
      if (mode.rider) S.cult = Math.floor(S.cult * 0.9);
      S.buffs.shock = Math.max(S.buffs.shock, 20);
      if (st.isFinalTri(S)) S.tribFails++;
      this.log(`💥 ${mode.rider ? '驭雷反噬' : '劫雷轰落'}！${mode.rider ? '修为 -40%' : '修为 -30%'}，重伤 20 秒${S.tribFails > 0 ? `，${this.currentTri().tri.name}因果累身（连败 ${S.tribFails} 次）` : ''}`, 'bad');
    }
  },
};
