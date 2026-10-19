// The same activity description drives server guards and client explanations.
export function mainActivity(game) {
  const S = game.S;
  if (game.battle) return { kind: 'battle', label: '战斗', remaining: null };
  if (S.seek?.active) return { kind: 'seek', label: '寻道', remaining: S.seek.active.remaining };
  if (S.med > 0) return { kind: 'med', label: '闭关', remaining: S.med };
  if (S.study) return { kind: 'study', label: '术法参悟', remaining: S.study.remaining };
  if (S.recovery > 0) return { kind: 'recovery', label: '回府调息', remaining: S.recovery };
  for (const [kind, label] of [['herb', '采药'], ['roam', '安全巡采']]) {
    const task = game.pending?.[kind];
    if (task != null) return { kind, label, remaining: typeof task === 'number' ? task : task.remaining };
  }
  return { kind: 'idle', label: '自由修行', remaining: null };
}

export function worldPaused(game) {
  return !!(game.ended || game.beginOpen || game.panel?.kind === 'begin'
    || ['secret', 'seek'].includes(game.panel?.kind) || game.battle?.waiting || game.battle?.paused);
}

export function activityView(game) {
  const activity = mainActivity(game);
  const paused = worldPaused(game);
  return { ...activity, busy: activity.kind !== 'idle', paused,
    canStart: activity.kind === 'idle' && !paused && !game.panel && game.S.life > 0,
    canManage: !paused && activity.kind !== 'battle' && game.S.life > 0 };
}
