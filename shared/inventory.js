import { GX } from './data.js';
export const GRADED_PILLS = ['huichun', 'huiyuan', 'yangyuan', 'yanshou', 'huti', 'pozhang', 'qingxin', 'dun'];
export const freshPillGrades = () => Object.fromEntries(GRADED_PILLS.map(id => [id, {}]));

// All live grants go through this boundary. syncPillGrades is for old saves only.
export function addPills(S, id, count = 1, tier = S.realmIdx) {
  if (!Object.hasOwn(GX.PILLS, id) || !Number.isSafeInteger(count) || count <= 0
    || !Number.isSafeInteger((S.pills[id] || 0) + count)
    || GX.PILLS[id].graded && (!Number.isInteger(tier) || !GX.REALMS[tier])) throw new Error('丹药入库参数无效');
  if (GX.PILLS[id].graded) {
    const grades = S.pillGrades[id] ||= {};
    grades[tier] = (grades[tier] || 0) + count;
  }
  S.pills[id] = (S.pills[id] || 0) + count;
}

// Quest payments use lower tiers first; a battle can request its reserved tier.
// Plan the entire withdrawal before mutating either inventory representation.
export function removePills(S, id, count = 1, tier) {
  if (!Object.hasOwn(GX.PILLS, id) || !Number.isSafeInteger(count) || count <= 0 || !(S.pills[id] >= count)) return false;
  if (GX.PILLS[id].graded) {
    const grades = S.pillGrades[id] || {}, plan = [];
    let remaining = count;
    const tiers = tier === undefined ? Object.keys(grades).map(Number).sort((a, b) => a - b) : [tier];
    for (const key of tiers) {
      const amount = Math.min(grades[key] || 0, remaining);
      if (amount > 0) plan.push([key, amount]);
      remaining -= amount;
      if (!remaining) break;
    }
    if (remaining) return false;
    for (const [key, amount] of plan) grades[key] -= amount;
  }
  S.pills[id] -= count;
  return true;
}
export function pillMaterials(S, id) {
  const pill = GX.PILLS[id];
  return Object.fromEntries(Object.entries(pill.materials || {}).map(([key, n]) => [key, Math.ceil(n * (pill.graded ? 1.8 ** S.realmIdx : 1))]));
}
export function syncPillGrades(S) {
  S.pillGrades ||= {};
  for (const id of GRADED_PILLS) {
    const grades = S.pillGrades[id] ||= {};
    const total = Object.values(grades).reduce((sum, n) => sum + n, 0);
    let diff = (S.pills[id] || 0) - total;
    if (diff > 0) grades[S.realmIdx] = (grades[S.realmIdx] || 0) + diff;
    if (diff < 0) for (const tier of Object.keys(grades).sort((a, b) => Number(a) - Number(b))) {
      const remove = Math.min(grades[tier], -diff); grades[tier] -= remove; diff += remove;
    }
  }
}
export function bestPillTier(S, id) {
  const grades = S.pillGrades?.[id];
  if (!grades) return S.pills[id] > 0 ? S.realmIdx : null;
  return Object.keys(grades).map(Number).filter(tier => grades[tier] > 0).sort((a, b) => b - a)[0] ?? null;
}
export function pillPotency(S, id, tier = bestPillTier(S, id)) {
  if (tier == null) return 0;
  const gap = S.realmIdx - tier;
  return gap <= 0 ? 1 : gap === 1 ? .5 : .25;
}
export function takePill(S, id, tier) {
  if (GX.PILLS[id]?.graded && tier === undefined) tier = bestPillTier(S, id);
  if (GX.PILLS[id]?.graded && tier == null) return false;
  return removePills(S, id, 1, tier);
}
export function validatePillGrades(S, consistent = false) {
  if (S.pillGrades == null) {
    if (consistent) throw new Error('存档药阶缺失');
    return;
  }
  if (typeof S.pillGrades !== 'object' || Array.isArray(S.pillGrades)) throw new Error('存档药阶无效');
  for (const [id, grades] of Object.entries(S.pillGrades)) {
    if (!GRADED_PILLS.includes(id) || !grades || typeof grades !== 'object' || Array.isArray(grades)) throw new Error('存档药阶无效');
    for (const [tier, n] of Object.entries(grades)) if (!/^(0|[1-9][0-9]?)$/.test(tier) || !GX.REALMS[Number(tier)] || !Number.isSafeInteger(n) || n < 0) throw new Error('存档药阶库存无效');
  }
  if (consistent) for (const id of GRADED_PILLS) {
    const total = Object.values(S.pillGrades[id] || {}).reduce((sum, n) => sum + n, 0);
    if (total !== (S.pills[id] || 0)) throw new Error('存档丹药总量与药阶不一致');
  }
}
