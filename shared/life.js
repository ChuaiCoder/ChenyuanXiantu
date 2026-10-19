import { GX } from './data.js';
import { rootFx } from './roots.js';

function capacity(S, bonus = 0) {
  let cap = GX.REALMS[S.realmIdx].life + bonus;
  cap = Math.round(cap * (1 + rootFx(S).life) * (1 + (GX.FOUNDATIONS[S.foundation]?.life || 0)));
  if (S.constitution === 'yangti') cap = Math.round(cap * 1.25);
  const learned = (S.gongfaBook || []).reduce((sum, id) => sum + (GX.GONGFA_BY_ID[id]?.school === 'life' ? GX.GONGFA_BY_ID[id].mag : 0), 0);
  return Math.round(cap * (1 + learned));
}
export const naturalLifeCap = S => capacity(S);
export const totalLifeCap = S => S.lifeLedger ? naturalLifeCap(S) + S.lifeLedger.extension : capacity(S, S.lifeBonus || 0);
export function initLife(S) {
  if (S.lifeLedger) return S.lifeLedger;
  const cap = Math.max(totalLifeCap(S), S.life);
  S.lifeLedger = { version: 1, age: 0, damage: 0, repairable: 0, repaired: 0,
    extension: cap - naturalLifeCap(S), unknown: cap - S.life };
  return S.lifeLedger;
}
export function remainingLife(S) {
  const l = S.lifeLedger;
  if (!l) return S.life;
  const cap = totalLifeCap(S), remaining = cap - l.age - l.damage - l.unknown;
  return remaining <= Number.EPSILON * cap * 8 ? 0 : remaining;
}
export function syncLife(S) { S.life = remainingLife(S); return S.life; }
export function ageLife(S, seconds) { initLife(S).age += seconds / GX.SECONDS_PER_YEAR; syncLife(S); }
export function damageLife(S, cap = totalLifeCap(S)) {
  const l = initLife(S), loss = Math.min(S.life, Math.max(1, Math.ceil(cap * GX.BATTLE_LIFE_LOSS)));
  l.damage += loss; l.repairable += Math.floor(loss * .4); syncLife(S);
  return loss;
}
export function repairLife(S, amount) {
  const l = initLife(S);
  const gain = Math.max(0, Math.min(amount, l.repairable, l.damage, Math.floor(naturalLifeCap(S) * .1) - l.repaired));
  l.damage -= gain; l.repairable -= gain; l.repaired += gain; syncLife(S); return gain;
}
export function extendLife(S, amount) {
  const l = initLife(S), gain = Math.max(0, Math.min(amount, Math.floor(naturalLifeCap(S) * .2) - l.extension));
  l.extension += gain; syncLife(S); return gain;
}
export function validateLife(S) {
  const l = S.lifeLedger;
  if (!l) return;
  if (l.version !== 1 || ['age','damage','repairable','repaired','extension','unknown'].some(k => !Number.isFinite(l[k]) || l[k] < 0)
    || l.repairable > l.damage || Math.abs(remainingLife(S) - S.life) > 1e-6) throw new Error('存档寿元账本无效');
}
