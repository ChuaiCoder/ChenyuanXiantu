import { GX } from './data.js';
import { rootIds } from './roots.js';
import { SPELLS, ENEMIES, ARTIFACTS, COMBAT_ITEMS } from './combat-data.js';
import { bestPillTier } from './inventory.js';

export const battleScale = (realm, layer) => 3 ** realm * 1.1 ** Math.max(0, layer - 1);
export const slotCount = S => S.realmIdx > 0 || S.layer >= 6 ? 3 : S.layer >= 3 ? 2 : 1;
export function combatStats(S) {
  const scale = battleScale(S.realmIdx, S.layer);
  const book = (S.gongfaBook || []).reduce((sum, id) => sum + (GX.GONGFA_BY_ID[id]?.school === 'battle' ? GX.GONGFA_BY_ID[id].mag : 0), 0);
  const quality = [1, 1.15, 1.3, 1.5][(S.treasure?.q || 1) - 1];
  const type = S.treasure?.type;
  return { scale, hp: Math.round(200 * scale * (1 + book + (type === 'wu' ? .10 * quality : type === 'gourd' ? .05 * quality : 0))),
    atk: Math.round(20 * scale * (1 + book + (type === 'sword' ? .08 * quality : type === 'banner' ? .05 * quality : 0))),
    armor: Math.round(25 * scale), speed: 100 + 2 * Math.max(0, S.layer - 1) + (type === 'yuan' ? 5 : 0), mana: 100 };
}
export function availableSpells(S) {
  const roots = rootIds(S.root);
  return Object.entries(SPELLS).filter(([id, skill]) => (!skill.root || roots.includes(skill.root))
    && (S.realmIdx > 0 || S.layer >= skill.level || skill.level === 1)
    && (!id.endsWith('2') || S.combat?.learned?.includes(id))).map(([id]) => id);
}
export function effectiveLoadout(S) {
  const available = availableSpells(S);
  const chosen = (S.combat?.loadout || []).filter(id => available.includes(id));
  const defaults = [...rootIds(S.root).filter(id => available.includes(id)), 'shield', 'heal', 'interrupt'];
  return [...new Set([...chosen, ...defaults.filter(id => available.includes(id))])].slice(0, slotCount(S));
}
export function spellCost(skill, roots) {
  const discount = skill.root ? roots.length === 1 ? .15 : roots.length === 2 ? .08 : 0 : 0;
  return Math.ceil(skill.cost * (1 - discount));
}
export function ensureCombat(S) {
  const stats = combatStats(S);
  S.combat ||= { hp: stats.hp, maxHp: stats.hp, mana: 100, loadout: [], learned: [], strategy: 'balanced', mode: 'semi', autoPills: false, medicine: 0, chapter: S.realmIdx, maps: { [S.realmIdx]: S.taoMax }, pet: null };
  const c = S.combat;
  if (c.maxHp !== stats.hp) { c.hp = Math.min(stats.hp, Math.floor(stats.hp * c.hp / c.maxHp)); c.maxHp = stats.hp; }
  c.chapter = Math.min(c.chapter, S.realmIdx);
  return c;
}
export function chapterOf(S) { return Math.min(S.realmIdx, S.combat?.chapter ?? S.realmIdx); }
export function chapterMax(S) { return S.combat ? S.combat.maps[chapterOf(S)] || 1 : S.taoMax; }
export function fixedEnemy(S, node) {
  const realm = chapterOf(S), definition = ENEMIES[node - 1], map = GX.TAO_MAP[node - 1];
  const scale = 3 ** realm;
  return { ...definition, realm, name: map.beast, icon: map.icon,
    hp: Math.round(definition.hp * scale), atk: Math.round(definition.atk * scale), armor: Math.round(definition.armor * scale),
    scale: battleScale(realm, definition.level), spirit: Math.round(definition.spirit * 1.8 ** realm),
    cult: Math.round(definition.cult * GX.REALM_MULT[realm]), shardKey: node === 5 ? 'ling' : 'fan', shardN: node === 5 ? 2 : 1 };
}
export function artifactFor(S) {
  if (!S.treasure) return null;
  const item = ARTIFACTS[S.treasure.type];
  return item ? { ...item, power: item.power * [1, 1.15, 1.3, 1.5][S.treasure.q - 1] } : null;
}
export function carriedSupplies(S) { return Object.fromEntries(COMBAT_ITEMS.map(id => [id, Math.min(3, S.pillGrades?.[id]?.[bestPillTier(S, id)] || 0)])); }
