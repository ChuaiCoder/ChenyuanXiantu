/* WebSocket 输入边界；引擎仍会复核资源、解锁条件和当前阶段。 */
const ACTIONS = {
  cultivate: 'doCultivate', herb: 'startHerb', roam: 'startRoam', med: 'startMed',
  secret: 'openSecret', break: 'doBreak', gongfa: 'buyGongfa', prestige: 'doPrestige',
  reset: 'reset', taotoggle: 'taoToggle', taoflee: 'taoFlee', refine: 'refineTreasure',
  begincommit: 'commitBegin', beginreroll: 'rerollBegin', 'end:continue': 'continueEnd',
  prepare: 'openRealm', seekpause: 'pauseSeek',
  cancelactivity: 'cancelActivity',
  recover: 'startRecovery',
  altar: 'toggleAltar',
};
const PREFIXES = {
  pill: 'usePill', craft: 'craftPill', bld: 'buyBld', forge: 'forgeTreasure',
  egg: 'releaseEgg', hatch: 'hatchEgg', tao: 'taoStart', taoact: 'taoAct', shop: 'buyShop',
  material: 'buyMaterial', relic: 'forgeRelic',
  seek: 'seekAction', seekfight: 'seekFight', seekmode: 'setSeekMode',
  resumeactivity: 'resumeActivity',
  battleloadout: 'setLoadout', battlemode: 'setBattleMode', strategy: 'setStrategy',
  combatoption: 'setCombatOption', chapter: 'setChapter', pet: 'selectPet', study: 'studySpell',
  forgekind: 'forgeNamed', legacychoose: 'chooseLegacy',
};
const CHOICES = { trib: 'applyTribOption', encounter: 'applyEncOption', secret: 'applySecretOption', gongfa: 'applyGongfaOption', realm: 'applyRealmOption', seek: 'applySeekOption' };

const REASONS = {
  invalid_action: '无法识别此操作。',
  ended: '本世已结束，请先继续轮回。',
  choosing_birth: '请先完成入世选择。',
  unavailable: '当前状态、资源或解锁条件不满足，请查看对应操作的条件。',
  insufficient_resources: '资源不足，请重新筹备。',
  health_full: '气血已满，未消耗回春丹。',
  mana_full: '真元已满，未消耗回元丹。',
  medicine_limit: '药力已达上限，请先回府调息。',
};
function result(ok, changed = ok, reasonCode = ok ? null : 'unavailable') {
  return { ok, changed, reasonCode, message: REASONS[reasonCode] || null };
}
function invoke(engine, method, args = []) {
  const outcome = engine[method](...args);
  if (outcome && typeof outcome === 'object') return result(outcome.ok === true, outcome.changed === true, outcome.reasonCode);
  return result(outcome === true);
}

// Acceptance refers to executing the action, including a legitimately failed
// breakthrough roll. A recognized name alone no longer counts as success.
export function executeAction(engine, act) {
  if (typeof act !== 'string' || act.length > 80) return result(false, false, 'invalid_action');
  if (engine.ended && act !== 'end:continue' && act !== 'reset') return result(false, false, 'ended');
  if (engine.beginOpen && !['begincommit', 'beginreroll', 'reset'].includes(act) && !act.startsWith('shop:') && !act.startsWith('legacychoose:')) return result(false, false, 'choosing_birth');
  if (Object.hasOwn(ACTIONS, act)) return invoke(engine, ACTIONS[act]);
  const match = /^([a-z]+):([a-z0-9_]+)$/.exec(act);
  if (!match) return result(false, false, 'invalid_action');
  const [, prefix, value] = match;
  if (prefix === 'choice') {
    const method = CHOICES[engine.panel?.kind];
    if (!method) return result(false, false, 'unavailable');
    return invoke(engine, method, [value]);
  }
  if (!Object.hasOwn(PREFIXES, prefix)) return result(false, false, 'invalid_action');
  return invoke(engine, PREFIXES[prefix], [['forge', 'tao'].includes(prefix) ? Number(value) : value]);
}

export function dispatchAction(engine, act) { return executeAction(engine, act).ok; }

export function handleMessage(engine, raw, reply) {
  let message;
  try { message = JSON.parse(raw); } catch { return false; }
  if (!message || typeof message !== 'object' || Array.isArray(message)) return false;
  if (message.type === 'ping') { reply({ type: 'pong' }); return true; }
  if (message.type === 'act' && typeof message.act === 'string') {
    if (message.requestId != null && (typeof message.requestId !== 'string' || message.requestId.length > 80)) return false;
    const outcome = executeAction(engine, message.act);
    return { ...outcome, requestId: message.requestId ?? null, checkpoint: outcome.changed && message.act !== 'cultivate' };
  }
  return false;
}
