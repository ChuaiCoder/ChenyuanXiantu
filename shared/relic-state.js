import { GX } from './data.js';
import { rootIds } from './roots.js';
import { SEEK_GRADES, SEEK_AFFINITIES, RELIC_ITEMS } from './relic-data.js';

export const legacyRoot = S => rootIds(S.root).some(id => ['yinyang', 'tiandao'].includes(id));
export const seekFresh = () => ({ done: {}, modes: {}, aligned: {}, jade: {}, active: null, converted: {} });
export const seekMode = (S, grade) => legacyRoot(S) ? 'legacy' : S.seek?.modes[grade] || (rootIds(S.root).length === 5 ? 'five' : 'elements');
export function kitIds(S, grade) {
  const mode = seekMode(S, grade);
  return mode === 'legacy' ? [grade] : mode === 'five' ? [`${grade}_five`] : rootIds(S.root).map(id => `${grade}_${id}`);
}
export const alignmentKey = (S, grade) => `${grade}_${rootIds(S.root).join('_')}`;
export function foundationKit(S, grade) {
  const ids = kitIds(S, grade), mode = seekMode(S, grade);
  const valid = !!SEEK_GRADES[grade] && (mode !== 'five' || rootIds(S.root).length === 5);
  const requirements = ids.map(id => ({ label: RELIC_ITEMS[id]?.name || `旧法·${GX.FOUNDATION_RELICS[grade]?.name}`, have: S.relics?.[id] || 0, need: 1, source: mode === 'legacy' ? '旧版兼容物，仅保留已持有数量；旧世绝版灵根可依旧法凝聚' : `寻道录 · ${RELIC_ITEMS[id]?.source}` }));
  if (mode === 'elements' && ids.length > 1) requirements.push({ label: '本品级主材合灵', have: S.seek?.aligned[alignmentKey(S, grade)] ? 1 : 0, need: 1, source: '集齐各系主材后完成调和委托，消耗一枚合灵玉；筑基失败无需重做' });
  if (!valid) requirements.push({ label: '灵根适配', have: 0, need: 1, source: '完整五行之物只适配五灵根' });
  return { ids, requirements, ok: valid && requirements.every(r => r.have >= r.need), name: requirements.filter(r => r.label !== '本品级主材合灵').map(r => r.label).join('、') };
}

/* 阶段图随灵根生成，稳定 ID、前置与领取标记保证重启可续。 */
const stepCache = new Map();
export function seekSteps(S, grade) {
  if (!Object.hasOwn(SEEK_GRADES, grade) || legacyRoot(S) || seekMode(S, grade) === 'legacy') return [];
  const roots = rootIds(S.root), whole = seekMode(S, grade) === 'five';
  if (whole && roots.length !== 5) return [];
  const cacheKey = `${grade}:${roots.join(',')}:${whole}`;
  if (stepCache.has(cacheKey)) return stepCache.get(cacheKey);
  const out = [], g = SEEK_GRADES[grade];
  const add = (id, title, extra = {}) => { const row = { id, grade, title, minLayer: g.layer, requires: [], duration: 0, ...extra }; out.push(row); return id; };
  const targets = whole ? ['five'] : roots;
  const intro = add(`${grade}_visit`, `${g.name}寻道 · 拜访引路人`, { text: `你说明自己的灵根。引路人将对应地点、材料与稳妥取物方法记入寻道录。${whole ? '此行寻找完整五行之物。' : roots.map(r => SEEK_AFFINITIES[r].host).join('、') + '可为你指路。'}` });
  const puzzle = (id, title, a, n, requires, extra = {}) => add(id, title, { requires, puzzle: { clue: a.clue, choices: a.choices, answer: n }, ...extra });
  const five = { name: '五行', host: '五灵药圃', sites: ['五脉交汇处','五行古府'], work: '辨识五色药性', tool: '五行承灵阵', guardian: '五行守府灵', supply: { herb: 18, essence: 6, earth: 3 }, prep: { earth: 6, essence: 8, herb: 6 }, clue: '药圃阵图记载：先辨五色，再疏五脉，最后合拢生生之环。', choices: ['辨明五色药性','疏通五条灵脉','合拢生生之环'] };
  if (grade === 'ren') {
    const care = add('ren_care', '沿途委托 · 救治伤者', { requires: [intro], cost: { pills: { huichun: 1 } }, text: '回春丹护住伤者心脉，你获得沿途各馆的信任。' });
    const escort1 = add('ren_escort1', '联合护送 · 官道前段', { requires: [intro], duration: 45 });
    const escort2 = add('ren_escort2', '联合护送 · 官道后段', { requires: [escort1], duration: GX.SEEK_TRIAL.steady.ren, fight: { name: '拦路妖兽', hp: 120, atk: 12, cost: {} } });
    for (const id of targets) {
      const a = SEEK_AFFINITIES[id] || five;
      const supply = add(`ren_${id}_supply`, `${a.host} · ${a.work}`, { requires: [intro], cost: { materials: a.supply }, text: `交付委托所需物资，${a.host}请你完成本地的取物检验。` });
      const proof = puzzle(`ren_${id}_proof`, `${a.host} · 辨识灵物`, a, 0, [supply]);
      add(`ren_${id}_take`, `领取${RELIC_ITEMS[`ren_${id}`].name}`, { requires: [proof, care, escort2], reward: `ren_${id}`, text: '委托已毕，主人将珍藏交给你。领取仅取得宝物，并不锁定道基。' });
    }
  } else {
    const common = [];
    if (grade === 'tian') {
      for (let book = 0; book < 3; book++) {
        const name = ['引气篇','合源篇','开府篇'][book];
        const enter = add(`tian_book${book}_enter`, `寻访道碑 · ${name}`, { requires: book ? [`tian_book${book - 1}_2`] : [intro], secretEntry: true });
        let prev = enter;
        const a = { clue: '道碑总纲：先辨本源，再调气机，最后解开封印。', choices: ['辨明本源','调和气机','解开封印'] };
        for (let n = 0; n < 3; n++) prev = puzzle(`tian_book${book}_${n}`, `${name} · 勘读 ${n + 1}/3`, a, n, [prev]);
        common.push(prev);
      }
    }
    // 土系单根使用三处各四次的脉图；多根共享总调查量，分别勘察自身属性。
    const total = grade === 'di' ? 12 : 15;
    const surveys = [];
    for (let e = 0; e < roots.length; e++) {
      const root = roots[e], a = SEEK_AFFINITIES[root], n = Math.floor(total / roots.length) + (e < total % roots.length ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const site = grade === 'di' && root === 'tu' && roots.length === 1 ? ['青石溪','断层崖','古矿井'][Math.floor(k / 4)] : a.sites[grade === 'di' ? 0 : 1];
        const id = `${grade}_survey_${root}_${k}`;
        const prev = k > 0 && !(grade === 'di' && root === 'tu' && roots.length === 1 && k % 4 === 0) ? [`${grade}_survey_${root}_${k - 1}`] : [];
        surveys.push(add(id, `${site} · 勘察 ${grade === 'di' && roots.length === 1 && root === 'tu' ? k % 4 + 1 : k + 1}/${grade === 'di' && roots.length === 1 && root === 'tu' ? 4 : n}`, { requires: [intro, ...common, ...prev], duration: 45, text: `${a.name}系线索：${a.clue}` }));
      }
    }
    const extractionTargets = whole && grade === 'tian' ? roots : targets;
    const seals = [];
    for (const id of extractionTargets) {
      const a = SEEK_AFFINITIES[id] || five, prefix = `${grade}_${whole && grade === 'tian' ? 'seal_' : ''}${id}`;
      const localSurveys = grade === 'tian' && whole ? surveys.filter(x => x.includes(`_${id}_`)) : surveys;
      const base = [...localSurveys, ...common, intro];
      const prep = add(`${prefix}_prep`, `${a.sites[grade === 'di' ? 0 : 1]} · 备${a.tool}`, { requires: base, insight: g.insight, cost: { materials: a.prep }, text: `准备${a.tool}。${a.clue} 阵具布好后保留，重试不重复收取。` });
      let prev = prep;
      const path = [prep];
      for (let n = 0; n < 3; n++) {
        prev = puzzle(`${prefix}_trial${n}`, `${a.name}系取物 · ${n + 1}/3`, a, n, [prev], { duration: grade === 'di' ? 40 : 60, minLayer: grade === 'tian' && !whole ? 9 : g.layer }); path.push(prev);
      }
      const cost = Object.fromEntries(Object.entries(a.prep).map(([key, n]) => [key, Math.ceil(n / 2)]));
      const reward = whole && grade === 'tian' ? null : `${grade}_${id}`;
      const take = add(`${prefix}_take`, reward ? `取得${RELIC_ITEMS[reward].name}` : `取得${a.name}源印与地方碑文`, { requires: [prev], reward, insight: g.insight, minLayer: grade === 'tian' && !whole ? 9 : g.layer,
        duration: GX.SEEK_TRIAL.steady[grade],
        fight: { name: a.guardian, hp: grade === 'di' ? 450 : 850, atk: grade === 'di' ? 30 : 42, cost: { materials: cost }, requires: base, completes: path } });
      seals.push(take);
    }
    if (whole && grade === 'tian') {
      const a = { clue: '八篇传承已合：先按金生水、水生木、木生火、火生土、土生金接环；再护住胎息；最后打开古府封印。', choices: ['按五行相生接环','护住胎息','打开古府封印'] };
      let prev = [...seals, ...common, intro];
      for (let n = 0; n < 3; n++) prev = [puzzle(`tian_five_ritual${n}`, `古府取胎 · ${n + 1}/3`, a, n, prev, { minLayer: 9, insight: 6, book: 2, duration: 60 })];
      add('tian_five_take', '取得先天五行道胎', { requires: prev, reward: 'tian_five', minLayer: 9 });
    }
  }
  if (!whole && roots.length > 1) {
    const all = targets.map(id => `${grade}_${id}`);
    const jade = add(`${grade}_jade`, '调和委托 · 取得合灵玉', { requiresItems: all, duration: 60, jade: grade, text: '集齐本品级各系宝物后，随引路人研习调和阵法，取得合灵玉一枚。' });
    add(`${grade}_align`, '合灵 · 调和本品级主材', { requires: [jade], requiresItems: all, align: grade, text: '合灵玉融入调和阵，各系主材共鸣。主材留待筑基成功时融入道基。' });
  }
  stepCache.set(cacheKey, out);
  return out;
}

export function stepInfo(S, step, fight = false) {
  if (!step) return { ok: false, missing: ['未知寻物阶段'], requirements: [] };
  const req = [{ label: `练气${step.minLayer}层`, have: S.layer, need: step.minLayer, source: '先提升本境层数' },
    ...(step.insight ? [{ label: '悟道心得', have: S.insight, need: step.insight, source: '完整闭关获得，不消耗' }] : []),
    ...(step.book ? [{ label: '功法重数', have: S.gongfaLv, need: step.book, source: '洞府参悟功法' }] : [])];
  const map = new Map(seekSteps(S, step.grade).map(s => [s.id, s]));
  for (const id of (fight ? step.fight?.requires || step.requires : step.requires)) req.push({ label: map.get(id)?.title || id, have: S.seek.done[id] ? 1 : 0, need: 1, source: '先完成此阶段' });
  for (const id of step.requiresItems || []) req.push({ label: RELIC_ITEMS[id].name, have: S.relics[id] || 0, need: 1, source: '先取得本系同品级主材' });
  for (const [group, items] of Object.entries(fight ? step.fight?.cost || {} : step.cost || {})) for (const [id, need] of Object.entries(items)) req.push({ label: (group === 'materials' ? GX.MATERIALS[id] : GX.PILLS[id]).name, have: S[group][id] || 0, need, source: group === 'materials' ? GX.MATERIALS[id].source : '丹器页炼制', group, id });
  if (step.align) req.push({ label: '合灵玉', have: S.seek.jade[step.grade] || 0, need: 1, source: '完成本品级调和委托' });
  if (step.secretEntry) req.push({ label: '秘境冷却', have: S.secretCd <= 0 ? 1 : 0, need: 1, source: '灵机恢复后再入，不按现实日期开放' });
  const missing = req.filter(r => r.have < r.need).map(r => `${r.label} ${r.have}/${r.need}`);
  if (S.realmIdx !== 0 || S.foundation || legacyRoot(S)) missing.unshift('此世无需按新法寻物');
  if (S.seek.done[step.id]) missing.unshift('本阶段已完成');
  if (S.seek.active) missing.unshift('先完成正在进行的寻物行动');
  if (S.med > 0) missing.unshift('闭关中，出定后再寻物');
  if (fight && !step.fight) missing.unshift('此阶段不支持战斗');
  return { requirements: req, missing, ok: !missing.length };
}

export function migrateSeek(S, oldVersion) {
  S.relics = Object.assign(Object.fromEntries(Object.keys(RELIC_ITEMS).map(k => [k, 0])), S.relics);
  S.seek = Object.assign(seekFresh(), S.seek);
  if (oldVersion >= 9) return;
  for (const grade of Object.keys(SEEK_GRADES)) if (S.relics[grade] > 0) S.seek.modes[grade] = 'legacy';
  if (legacyRoot(S) || S.realmIdx !== 0) return;
  // 只抵扣旧库存代表的经历，不直接制造新的主材。记账后禁止重复换算。
  for (const grade of ['di','tian']) {
    const mode = S.seek.modes[grade]; delete S.seek.modes[grade];
    const steps = seekSteps(S, grade);
    const survey = steps.filter(s => s.id.includes('_survey_'));
    let credits = grade === 'di' ? S.materials.vein_jade || 0 : 0;
    if (grade === 'tian') {
      for (const root of ['jin','mu','shui','huo','tu']) {
        const n = S.materials[`origin_${root}`] || 0;
        if (n >= 3 && rootIds(S.root).length === 5) {
          for (const s of steps.filter(s => s.id.startsWith(`tian_seal_${root}_`))) S.seek.done[s.id] = true;
        } else credits += n;
        S.seek.converted[`origin_${root}`] = n;
      }
      const pages = Math.min(8, S.materials.dao_page || 0);
      for (const s of steps.filter(s => /^tian_book[0-2]_/.test(s.id))) if (+s.id[9] < Math.min(3, pages)) S.seek.done[s.id] = true;
      S.seek.converted.dao_page = S.materials.dao_page || 0;
      credits += Math.max(0, pages - 3);
    } else S.seek.converted.vein_jade = credits;
    if (credits > 0) S.seek.done[`${grade}_visit`] = true;
    for (const s of survey.slice(0, Math.min(credits, survey.length))) S.seek.done[s.id] = true;
    if (mode) S.seek.modes[grade] = mode;
  }
}

export function validateSeek(S) {
  const q = S.seek, record = o => o !== null && typeof o === 'object' && !Array.isArray(o);
  if (!record(q) || !['done','modes','aligned','jade','converted'].every(k => record(q[k]))) throw new Error('寻道进度无效');
  for (const map of [q.done, q.aligned]) if (Object.values(map).some(v => v !== true)) throw new Error('寻道完成标记无效');
  for (const map of [q.jade, q.converted]) if (Object.values(map).some(v => !Number.isSafeInteger(v) || v < 0)) throw new Error('寻道物品数无效');
  for (const [grade, mode] of Object.entries(q.modes)) if (!Object.hasOwn(SEEK_GRADES, grade) || !['legacy','five','elements'].includes(mode) || mode === 'five' && rootIds(S.root).length !== 5) throw new Error('寻道方案无效');
  const grades = Object.keys(SEEK_GRADES), known = new Set();
  for (const mode of ['elements', ...(rootIds(S.root).length === 5 ? ['five'] : [])]) {
    const view = { ...S, seek: { ...q, modes: Object.fromEntries(grades.map(g => [g, mode])) } };
    for (const g of grades) for (const step of seekSteps(view, g)) known.add(step.id);
  }
  if (Object.keys(q.done).some(id => !known.has(id)) || Object.keys(q.aligned).some(id => !grades.some(g => id === alignmentKey(S, g))) || Object.keys(q.jade).some(g => !Object.hasOwn(SEEK_GRADES, g))) throw new Error('寻道记录不匹配本世灵根');
  if (q.active !== null) {
    const s = Object.keys(SEEK_GRADES).flatMap(g => seekSteps(S, g)).find(s => s.id === q.active.step);
    if (!record(q.active) || !s || q.done[s.id] || !Number.isFinite(q.active.remaining) || q.active.remaining <= 0 || q.active.remaining > s.duration || S.realmIdx !== 0) throw new Error('寻道计时无效');
    if (!stepInfo({ ...S, seek: { ...q, active: null } }, s).ok) throw new Error('寻道计时前置无效');
  }
}
