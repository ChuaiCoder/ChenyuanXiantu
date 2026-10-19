import { freshState } from '../../shared/state.js';

// 旧服务可能仍在广播旧结构。只补显示所需缺省值，不迁移存档或发放物品。
export function stateForDisplay(raw) {
  const defaults = freshState();
  const state = { ...defaults, ...raw, v: raw.v ?? 0 };
  for (const key of ['materials', 'relics', 'pills', 'bld', 'shards', 'eggs', 'beasts', 'buffs', 'seen', 'milestones']) {
    state[key] = { ...defaults[key], ...raw[key] };
  }
  // 不伪装服务已经支持寻道；缺少进度时仍由界面提示重启服务。
  state.seek = raw.seek ? { ...defaults.seek, ...raw.seek } : null;
  if (state.seek) for (const key of ['done', 'modes', 'aligned', 'jade', 'converted']) {
    state.seek[key] = { ...defaults.seek[key], ...raw.seek[key] };
  }
  return state;
}
