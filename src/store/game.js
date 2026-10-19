/* ============ 游戏 store：WS 状态帧 → reactive；操作 → send ============
   服务器权威：客户端只渲染 game.S + 派生值（shared/state.js 与引擎同源）。 */
import { reactive, ref } from 'vue';
import * as st from '../../shared/state.js';
import { stateForDisplay } from './snapshot.js';
import { activityView } from '../../shared/activity.js';
import { createGameClient } from './connection.js';

export const game = reactive({
  S: st.freshState(),
  panel: null,
  battle: null,
  pending: { herb: null, roam: null },
  ended: false,
  dayN: 1,
  calendar: null,
  rules: null,
  activity: null, suspended: [], error: null, actionError: null,
  logs: [],
  combo: null,
});
export const connected = ref(false);

function wsUrl() {
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
}

export function applyState(frame) {
  game.S = stateForDisplay(frame.S);
  game.panel = frame.panel;
  game.battle = frame.battle;
  game.pending = frame.pending;
  game.ended = frame.ended;
  game.dayN = frame.dayN;
  game.calendar = frame.calendar ?? null;
  game.rules = frame.rules ?? null;
  game.activity = frame.activity ?? activityView(game);
  game.suspended = frame.suspended ?? [];
  game.combo = frame.combo ?? null;
  game.error = null;
  // Each frame already contains the authoritative bounded log. A reconnect can
  // receive both an initial frame and the same broadcast delta; never append twice.
  game.logs = frame.logs || [];
}

let latestRequest = null;
const client = createGameClient({
  url: wsUrl,
  onState: applyState,
  onStatus: value => { connected.value = value; },
  onError: message => { game.error = message; },
  onActionResult: message => {
    if (message.requestId === latestRequest) game.actionError = message.ok ? null : message.message;
  },
});
export const startConnection = () => client.start();
export const stopConnection = () => client.stop();
if (import.meta.hot) import.meta.hot.dispose(stopConnection);

/* 操作封装：act 字符串 → 服务端分派 */
export function send(act) {
  game.actionError = null;
  latestRequest = client.send(act);
  return latestRequest;
}
