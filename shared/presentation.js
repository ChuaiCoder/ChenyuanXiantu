import { GX } from './data.js';
import { fmt } from './format.js';
import { battleLifeLoss, cultPerClick, merchantPrices, mineRate, riskChance } from './state.js';

export function pillDescription(S, id) {
  if (id === 'juli') return `修为 +${fmt(GX.JULI_MULT * cultPerClick(S))}（60×点击值）`;
  return GX.PILLS[id]?.desc(S) || '';
}

// Return fresh options so adding UI flags never changes shared configuration.
function optionsFor(S, scene, fightId) {
  return (scene?.options || []).map(option => ({ ...option,
    ...(option.id === fightId ? { detail: `进入回合战斗，胜获灵石与残片；败退重伤60秒，折寿 ${battleLifeLoss(S)} 年` } : {}),
  }));
}

const pct = n => `${Math.round(n * 100)}%`;
/* 秘境残窟 / 丹窟：道心越高越能压住凶险，概率实时展示，玩家可据状态决定是否冒险。 */
function riskDetail(S, { reward = 0.25, hazard = 0.35, label = '重伤' } = {}) {
  const win = riskChance(S, reward, { daoScale: 0.02, cap: 0.55 });
  return `${pct(win)}大赏 / ${pct(hazard)}${label} / ${pct(Math.max(0, 1 - win - hazard))}空手`;
}
function wardCost(S) { return Math.ceil(Math.max(200, mineRate(S) * 80)); }

export function secretOptions(S, id) {
  const options = optionsFor(S, GX.SECRET_EVENTS.find(scene => scene.id === id), id === 'beast' ? 'fight' : null);
  if (id === 'pill') for (const option of options) {
    if (option.id === 'take') option.detail = riskDetail(S, { label: '被困' });
    if (option.id === 'ward') option.detail = `灵液 ×2 · 45%大赏 / 55%空手，不会被困`;
  }
  return options;
}

export function encounterOptions(S, id) {
  const options = optionsFor(S, GX.ENCOUNTERS.find(scene => scene.id === id), id === 'youshou' ? 'fight' : id === 'tongmen' ? 'accept' : null);
  if (id === 'heimi') {
    const prices = merchantPrices(S);
    for (const option of options) {
      if (option.id === 'buy_shards') option.detail = `${fmt(prices.shards)} 灵石`;
      if (option.id === 'buy_treasure') option.detail = `${fmt(prices.treasure)} 灵石（随机品型）`;
    }
  }
  if (id === 'mijing') for (const option of options) {
    if (option.id === 'deep') option.detail = riskDetail(S);
    if (option.id === 'ward') option.detail = `${fmt(wardCost(S))} 灵石 · 45%大赏 / 55%空手，不会重伤`;
  }
  return options;
}
