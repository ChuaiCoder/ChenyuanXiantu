import { GX } from './data.js';

export const ELEMENTS = ['jin', 'mu', 'shui', 'huo', 'tu'];
export const MUTANTS = ['bing', 'lei', 'feng'];
export function validRoot(root) {
  const ids = Array.isArray(root) ? root : [root];
  return ids.length >= 1 && ids.length <= 5 && new Set(ids).size === ids.length &&
    ids.every(id => typeof id === 'string' && Object.hasOwn(GX.ROOTS, id)) &&
    (ids.length === 1 || ids.every(id => ELEMENTS.includes(id)));
}
export function rootIds(root) {
  if (!validRoot(root)) return ['jin'];
  return (Array.isArray(root) ? [...root] : [root]).sort((a, b) => ELEMENTS.indexOf(a) - ELEMENTS.indexOf(b));
}
export function hasRoot(S, id) { return rootIds(S.root).includes(id); }
export function rootFx(S) {
  const ids = rootIds(S.root), n = ids.length, share = 1 / Math.sqrt(n);
  const fx = { cult: [0, .30, .18, .08, 0, .12][n], life: 0, trib: 0, luck: 0, build: 0, pill: 0, forge: 0, shard: 0, egg: 0 };
  for (const id of ids) {
    if (id === 'jin') { fx.shard = .5 * share; fx.forge = .1 * share; }
    if (id === 'mu') fx.egg = .5 * share;
    if (id === 'shui') fx.life = .2 * share;
    if (id === 'huo') fx.pill = .3 * share;
    if (id === 'tu') fx.build = .15 * share;
    if (id === 'bing') { fx.cult = .20; fx.life = .15; fx.trib = .05; }
    if (id === 'lei') fx.cult = .35;
    if (id === 'feng') { fx.cult = .15; fx.luck = .30; }
    if (id === 'yinyang') { fx.cult = 0; fx.trib = .10; }
    if (id === 'tiandao') { fx.cult = 0; fx.luck = .40; }
  }
  if (n === 5) { fx.luck = .08; fx.trib = .03; }
  return fx;
}
export function rootProfile(root) {
  const ids = rootIds(root), fx = rootFx({ root }), n = ids.length;
  const parts = [];
  const labels = { cult: '修炼', life: '寿元上限', luck: '机缘掉率', shard: '残片掉率', egg: '灵兽蛋掉率' };
  for (const [id, label] of Object.entries(labels)) if (fx[id]) parts.push(`${label} +${+(fx[id] * 100).toFixed(1)}%`);
  if (fx.trib) parts.push(`渡劫 +${+(fx.trib * 100).toFixed(1)} 个百分点`);
  for (const [id, label] of Object.entries({ build: '建设灵石', pill: '炼丹灵石', forge: '炼器残片' })) if (fx[id]) parts.push(`${label} -${+(fx[id] * 100).toFixed(1)}%`);
  if (ids[0] === 'tiandao') parts.push('机缘灵石数量 ×2');
  return {
    ids, icon: ids.map(id => GX.ROOTS[id].icon).join(''),
    name: n === 1 ? GX.ROOTS[ids[0]].name : `${ids.map(id => GX.ROOTS[id].name[0]).join('')}·${['', '单', '双', '三', '四', '五'][n]}灵根`,
    type: GX.ROOTS[ids[0]].legacy ? '旧世灵根' : MUTANTS.includes(ids[0]) ? '变异单灵根' : n === 5 ? '五行相生' : n === 1 ? '单灵根' : '混合灵根',
    desc: parts.join('；'),
  };
}

export function rollRoots(S, k) {
  // 31 种五行组合 + 3 种变异单根；按根数加权后无放回抽取，恒有界。
  const pool = [];
  const totals = [0, 12, 23, 25, 20, 11], combinations = [0, 5, 10, 10, 5, 1];
  for (let mask = 1; mask < 32; mask++) {
    const ids = ELEMENTS.filter((_, i) => mask & (1 << i));
    pool.push({ ids, w: totals[ids.length] / combinations[ids.length] });
  }
  pool.push(...MUTANTS.map(id => ({ ids: [id], w: 3 })));
  const picked = [];
  for (let i = 0; i < Math.min(34, Math.max(0, Math.floor(k))); i++) {
    let r = Math.random() * pool.reduce((sum, row) => sum + row.w, 0);
    let j = 0;
    while (j < pool.length - 1 && r >= pool[j].w) r -= pool[j++].w;
    picked.push(pool.splice(j, 1)[0].ids);
  }
  return picked;
}
