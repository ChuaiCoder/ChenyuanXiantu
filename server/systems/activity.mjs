import { GX, fmt, fmtTime } from '../../shared/data.js';
import * as st from '../../shared/state.js';
import { mainActivity, worldPaused, activityView } from '../../shared/activity.js';
import { ROUND_SECONDS } from '../../shared/combat-data.js';

export const activityActions = {
  canAct(kind = 'manage') {
    if (this.ended || this.beginOpen || this.S.life <= 0 || this.presence?.offlineSince != null) return false;
    if (kind === 'battle') return !!this.battle && !['secret', 'seek'].includes(this.panel?.kind);
    return activityView(this).canManage;
  },
  canStartActivity() { return this.canAct() && activityView(this).canStart; },
  startMed() {
    if (!this.canStartActivity()) return;
    if (this.S.medCd > 0) { this.log(`调息未竟，尚需 ${fmtTime(this.S.medCd)}`, 'dim'); return; }
    this.S.med = 120;
    this.log('🧘 闭关 120 秒，修为按点击力 ×2/秒凝练。期间不能采集、战斗或突破；完整出关获得心得 1 点。', 'good');
    return true;
  },
  cancelActivity() {
    if (!this.canAct() || this.panel || this.battle) return;
    const kind = mainActivity(this).kind;
    if (kind === 'med') { this.S.med = 0; this.S.medCd = GX.MED_CD; }
    else if (kind === 'seek') return this.pauseSeek();
    else if (kind === 'recovery') this.S.recovery = 0;
    else if (kind === 'herb' || kind === 'roam') this.pending[kind] = null;
    else return;
    this.log('已停止当前活动；未完成的采集与闭关不发奖励。', 'dim');
    return true;
  },
  resumeActivity(kind) {
    if (!this.canStartActivity()) return;
    const index = this.suspended.findIndex(task => task.kind === kind);
    if (index < 0) return;
    const [task] = this.suspended.splice(index, 1);
    if (kind === 'med') this.S.med = task.remaining;
    else if (kind === 'herb' || kind === 'roam') this.pending[kind] = { remaining: task.remaining };
    this.log('继续旧档中暂存的活动，剩余时间与已支付成本保留。', 'dim');
    return true;
  },
  goOffline(now = Date.now()) {
    if (this.presence.offlineSince != null) return;
    this.presence = {
      offlineSince: now,
      eligible: !worldPaused(this) && !this.battle,
      cultRate: st.zhenRate(this.S), spiritRate: st.mineRate(this.S),
    };
  },
  goOnline(now = Date.now()) {
    if (this.presence.offlineSince == null) return 0;
    const earned = this.offlineEarnings(now);
    this.presence = { offlineSince: null };
    return earned;
  },
  offlineEarnings(now = Date.now()) {
    const presence = this.presence;
    const start = presence.offlineSince ?? this.S.lastTs ?? now;
    const dt = Math.min(Math.max(0, (now - start) / 1000), GX.OFFLINE_CAP);
    const eligible = !worldPaused(this) && !this.battle && presence.eligible !== false;
    // Move the cursor even on a zero-income interval; saving lastTs cannot restart it.
    this.S.lastTs = now;
    if (presence.offlineSince != null) presence.offlineSince = now;
    if (!eligible || !dt) return 0;
    const dz = (presence.cultRate ?? st.zhenRate(this.S)) * dt * GX.OFFLINE_EFF;
    const dm = (presence.spiritRate ?? st.mineRate(this.S)) * dt * GX.OFFLINE_EFF;
    this.S.cult += dz; this.S.spirit += dm;
    if (dz > 0 || dm > 0) this.log(`🌙 洞府托管 ${fmtTime(dt)}：修为 +${fmt(dz)}、灵石 +${fmt(dm)}；人物岁月与活动暂停。`, 'dim');
    return dt;
  },
  tick(dt) {
    if (!Number.isFinite(dt) || dt <= 0 || this.presence.offlineSince != null) return;
    let remaining = dt;
    while (remaining > 1e-9 && !worldPaused(this)) {
      if (this.S.life <= 0) { this.die('坐化'); break; }
      const activity = mainActivity(this);
      const boundaries = [remaining, 1, this.S.life / GX.LIFE_PER_SEC];
      if (activity.remaining > 0) boundaries.push(activity.remaining);
      if (this.battle) boundaries.push(Math.max(1e-6, ROUND_SECONDS - this.battle.acc));
      const step = Math.min(...boundaries);
      this.advanceWorld(step);
      remaining -= step;
    }
  },
};

export function migrateActivities(engine, legacy) {
  const tasks = [];
  if (engine.battle) tasks.push({ kind: 'battle' });
  if (engine.S.seek.active) tasks.push({ kind: 'seek' });
  if (engine.S.med > 0) tasks.push({ kind: 'med', remaining: engine.S.med });
  if (engine.S.study) tasks.push({ kind: 'study', remaining: engine.S.study.remaining });
  if (engine.S.recovery > 0) tasks.push({ kind: 'recovery', remaining: engine.S.recovery });
  for (const kind of ['herb', 'roam']) if (engine.pending[kind]) tasks.push({ kind, remaining: engine.pending[kind].remaining });
  if (tasks.length <= 1) return;
  if (!legacy || tasks.slice(1).some(task => !['med', 'herb', 'roam'].includes(task.kind))) throw new Error('存档主活动冲突');
  for (const task of tasks.slice(1)) {
    engine.suspended.push(task);
    if (task.kind === 'med') engine.S.med = 0;
    else engine.pending[task.kind] = null;
  }
}
