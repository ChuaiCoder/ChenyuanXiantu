// Transport lifecycle is explicit and independent of Vue or browser globals.
export function createGameClient({ url, createSocket = address => new WebSocket(address),
  onState, onStatus = () => {}, onError = () => {}, onActionResult = () => {},
  timers = globalThis, retryMs = 1500, heartbeatMs = 25000 }) {
  let socket = null, running = false, ready = false, retry = null, heartbeat = null, nextId = 0;

  function clearTimers() {
    timers.clearTimeout(retry); timers.clearInterval(heartbeat);
    retry = heartbeat = null;
  }
  function scheduleRetry() {
    timers.clearTimeout(retry);
    if (running) retry = timers.setTimeout(connect, retryMs);
  }
  function connect() {
    clearTimers();
    if (!running) return;
    let current;
    try { current = createSocket(typeof url === 'function' ? url() : url); }
    catch { scheduleRetry(); return; }
    socket = current;
    const active = () => running && socket === current;
    current.onopen = () => {
      if (!active()) return;
      heartbeat = timers.setInterval(() => {
        if (active() && current.readyState === 1) {
          try { current.send(JSON.stringify({ type: 'ping' })); } catch { current.close(); }
        }
      }, heartbeatMs);
    };
    current.onmessage = event => {
      if (!active()) return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message?.type === 'state' && message.state?.S) {
        onState(message.state); ready = true; onStatus(true);
      } else if (message?.type === 'error') onError(message.message);
      else if (message?.type === 'actionResult') onActionResult(message);
    };
    current.onclose = () => {
      if (!active()) return;
      socket = null; ready = false; onStatus(false);
      clearTimers(); scheduleRetry();
    };
    current.onerror = () => { if (active()) current.close(); };
  }
  return {
    start() { if (running) return; running = true; connect(); },
    stop() {
      running = ready = false; clearTimers();
      const current = socket; socket = null;
      if (current) current.close();
      onStatus(false);
    },
    send(act) {
      if (!ready || !socket || socket.readyState !== 1) return null;
      const requestId = String(++nextId);
      try { socket.send(JSON.stringify({ type: 'act', act, requestId })); return requestId; }
      catch { socket.close(); return null; }
    },
  };
}
