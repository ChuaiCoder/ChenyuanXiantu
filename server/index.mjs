/* ============ 服务端：Express 静态 + WebSocket 权威循环 + 存档 ============
   启动：
     npm run dev   → node server/index.mjs --dev   （Vite dev server 内嵌，HMR）
     npm start     → node server/index.mjs         （生产：服务 dist/ 静态文件）
   协议（JSON over WS，端口 3000）：
     server → {type:'state', state:frame} / {type:'actionResult', requestId, ok, changed, reasonCode, message}
     client → {type:'act', act:'cultivate'|'herb'|'roam'|'med'|'secret'|'break'|'gongfa'|'prestige'|'reset'
                            |'pill:<k>'|'craft:<k>'|'bld:<id>'|'forge:<q>'|'refine'|'egg:<k>'|'hatch:<k>'
                            |'tao:<n>'|'taoact:<k>'|'taotoggle'|'taoflee'
                            |'choice:<id>'|'begincommit'|'beginreroll'|'shop:<id>'|'end:continue'}
   人物仅在至少一个客户端在线时推进；离线区间在首次重连时结算一次。 */
import express from 'express';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Engine from './engine.mjs';
import { handleMessage } from './protocol.mjs';
import { acquireSaveLock, loadSave, saveEngine } from './persistence.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT ? +process.env.PORT : 3000;
const HOST = process.env.HOST || '127.0.0.1';
const DEV = process.argv.includes('--dev');
const SAVE_DIR = path.join(__dirname, 'saves');
const SAVE_FILE = process.env.SAVE_FILE ? path.resolve(process.env.SAVE_FILE) : path.join(SAVE_DIR, 'default.json');

const engine = new Engine();

/* ---- 存档加载：有档则 hydrate + 离线收益，无档则开局窗 ---- */
function bootEngine() {
  const loaded = loadSave(engine, SAVE_FILE);
  if (loaded) {
    engine.goOffline(engine.S.lastTs);
    engine.log('存档读取成功，等待继续修行。', 'dim');
    return;
  }
  engine.log('🌄 你于一处山洞中醒来，灵气氤氲，仙途自此开始。', 'good');
  engine.openBegin('new');
  engine.goOffline();
}

let storageError = null;
function persist() {
  try {
    saveEngine(engine, SAVE_FILE);
    storageError = null;
    return true;
  } catch (e) { console.error('存档失败：', e.message); }
  storageError = '存档暂时无法写入，已暂停推进；恢复写入后继续。';
  return false;
}

/* ---- HTTP ---- */
const app = express();

async function main() {
  await acquireSaveLock(SAVE_FILE);
  bootEngine();
  const server = http.createServer(app);
  let last = Date.now();
  let vite = null;
  if (DEV) {
    const { createServer: createViteServer } = await import('vite');
    vite = await createViteServer({
      root: ROOT,
      server: { middlewareMode: true, hmr: { server } }, // HMR 复用同一 http server 的 WS 升级
      appType: 'custom',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(ROOT, 'dist')));
  }
  // 兜底：非 /ws 路径一律回 index.html（SPA）
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/ws') return next();
    res.sendFile(DEV ? path.join(ROOT, 'index.html') : path.join(ROOT, 'dist', 'index.html'));
  });

  // noServer + 手动分派 upgrade：只接管 /ws，其余（Vite HMR 的 / 升级）交给 Vite 自己的监听
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8192 });
  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url, 'http://x').pathname !== '/ws') return;
    wss.handleUpgrade(req, socket, head, ws => {
      ws.on('error', error => console.warn('WebSocket 连接错误：', error.message));
      ws.lastAlive = Date.now();
      ws.on('pong', () => { ws.lastAlive = Date.now(); });
      ws.on('close', () => {
        if (![...wss.clients].some(client => client !== ws && client.readyState === WebSocket.OPEN)) {
          const now = Date.now();
          if (!storageError) engine.tick(Math.min(5, Math.max(0, (now - last) / 1000)));
          last = now; engine.goOffline(now); persist();
        }
      });
      if (engine.presence.offlineSince != null) { engine.goOnline(); last = Date.now(); persist(); }
      if (!storageError) ws.send(JSON.stringify({ type: 'state', state: engine.frame() }));
      else ws.send(JSON.stringify({ type: 'error', message: storageError }));
      ws.on('message', raw => {
        try {
          if (storageError) { ws.send(JSON.stringify({ type: 'error', message: storageError })); return; }
          const outcome = handleMessage(engine, raw, message => ws.send(JSON.stringify(message)));
          if (outcome && typeof outcome === 'object') {
            // Acknowledge a gameplay decision only after its checkpoint is durable.
            const saved = !outcome.checkpoint || persist();
            if (outcome.requestId != null) {
              const { requestId, ok, changed, reasonCode, message } = outcome;
              ws.send(JSON.stringify({ type: 'actionResult', requestId, ok: saved && ok, changed,
                reasonCode: saved ? reasonCode : 'storage_unavailable', message: saved ? message : storageError }));
            }
          }
        }
        catch (error) { console.error('操作处理失败：', error.message); }
      });
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, HOST, resolve);
  });
  console.log(`🏮 尘缘仙途 ${DEV ? '[dev]' : '[prod]'}  →  http://${HOST}:${server.address().port}`);

  // A failed startup must never save its stale snapshot over another server.
  const saveTimer = setInterval(persist, 20000);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    clearInterval(saveTimer);
    engine.goOffline();
    try { saveEngine(engine, SAVE_FILE); } catch (error) { console.error('退出时存档失败：', error.message); process.exit(1); }
    process.exit(0);
  });

  /* ---- 权威 tick：200ms ---- */
  const TICK_MS = 200;
  setInterval(() => {
    const t0 = Date.now();
    let dt = (t0 - last) / 1000;
    last = t0;
    if (dt <= 0) return;
    if (storageError) return;
    if (dt > 5) dt = 5; // 卡帧保护（与旧版一致）
    const before = `${engine.logId}:${engine.battle?.turn}:${engine.battle?.waiting}:${engine.battle?.paused}`;
    engine.tick(dt);
    const after = `${engine.logId}:${engine.battle?.turn}:${engine.battle?.waiting}:${engine.battle?.paused}`;
    if (before !== after) persist();
  }, TICK_MS);

  /* ---- 状态广播：200ms（与 tick 同步），无客户端则不发 ---- */
  setInterval(() => {
    const clients = [...wss.clients].filter(c => c.readyState === WebSocket.OPEN);
    if (!clients.length) return;
    if (storageError) { for (const client of clients) client.send(JSON.stringify({ type: 'error', message: storageError })); return; }
    const frame = engine.frame();
    const payload = JSON.stringify({ type: 'state', state: frame });
    for (const c of clients) c.send(payload);
  }, TICK_MS);
  setInterval(() => {
    const now = Date.now();
    for (const ws of wss.clients) {
      if (now - ws.lastAlive > 15000) ws.terminate();
      else if (ws.readyState === WebSocket.OPEN) ws.ping();
    }
  }, 5000);
}
main().catch(error => {
  console.error('游戏服务启动失败：', error.message);
  process.exit(1);
});
