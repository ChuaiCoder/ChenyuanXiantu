/* ============ 桌面外壳：Electron 主进程（ESM） ============
   职责：拉起内置游戏服务（server/index.mjs，生产模式服务 dist/）→ 等待就绪 → 开窗加载。
   服务端仍是唯一权威：渲染进程只连本地 WebSocket，逻辑与浏览器版完全一致。

   启动：npm run desktop        （构建后直接运行）
   打包：npm run dist           （输出免安装 exe）

   注：本项目 package.json 声明了 "type": "module"，此时 Electron 主进程入口
   必须是 ESM；若用 CJS 会被降级为普通 Node 运行，require('electron') 只会
   拿到 npm 包（无 app/BrowserWindow）。 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Electron 内置模块是 CommonJS 实现。本项目 package.json 为 "type": "module"，
// ESM 的具名导入（import { app } from 'electron'）在本版本下会被解析到
// node_modules/electron（只导出二进制路径），拿不到 app/BrowserWindow。
// 因此统一用 createRequire 走 CJS 解析路径，稳定取到内置模块。
const require = createRequire(import.meta.url);
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');

// 本应用只加载本地打包内容（127.0.0.1 上的 dist/），不访问任何外部页面，
// 因此关闭 Chromium 沙箱换取启动可靠性：在虚拟机、容器、受管控桌面等受限环境中，
// 沙箱常导致 GPU 进程反复崩溃（exit_code=-1073741819）并让整个应用直接退出。
// 如需恢复沙箱：启动前设置环境变量 XY_ENABLE_SANDBOX=1。
if (process.env.XY_ENABLE_SANDBOX !== '1') app.commandLine.appendSwitch('no-sandbox');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/* 无边框标题栏按钮配色：跟随前端三套主题的顶部底色 */
const THEME_CHROME = {
  ink: { color: '#0b0f16', symbol: '#c8c3b4' },
  jade: { color: '#0b1310', symbol: '#c2cdc0' },
  blood: { color: '#130b0e', symbol: '#cfc0b4' },
};
const TITLEBAR_H = 34;

let mainWindow = null;
let serverProc = null;
let serverPort = 0;
let quitting = false;

/* ---------- 端口与就绪探测 ---------- */
function findFreePort(from = 31700) {
  return new Promise((resolve, reject) => {
    const probe = port => {
      const srv = net.createServer();
      srv.once('error', () => {
        if (port >= from + 200) reject(new Error('未找到可用端口'));
        else probe(port + 1);
      });
      srv.once('listening', () => {
        const got = srv.address().port;
        srv.close(() => resolve(got));
      });
      srv.listen(port, '127.0.0.1');
    };
    probe(from);
  });
}

async function waitForServer(port, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (serverProc && serverProc.exitCode != null) {
      throw new Error(`游戏服务已退出（代码 ${serverProc.exitCode}）`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, { method: 'HEAD' });
      if (res.ok || res.status === 404) return true;
    } catch { /* 尚未监听，继续等待 */ }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('等待游戏服务就绪超时');
}

/* ---------- 启动内置服务 ---------- */
function startServer() {
  const saveFile = path.join(app.getPath('userData'), 'save.json');
  const serverEntry = path.join(ROOT, 'server', 'index.mjs');
  if (!fs.existsSync(serverEntry)) throw new Error(`缺少服务端入口：${serverEntry}`);

  const distIndex = path.join(ROOT, 'dist', 'index.html');
  if (!fs.existsSync(distIndex)) {
    throw new Error('缺少前端构建产物 dist/。请先运行 npm run build（打包脚本已自动执行）。');
  }

  serverProc = spawn(process.execPath, [serverEntry], {
    cwd: ROOT,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',   // 让 electron.exe 以纯 Node 方式运行服务
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(serverPort),
      SAVE_FILE: saveFile,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  serverProc.stdout.on('data', d => process.stdout.write(`[game] ${d}`));
  serverProc.stderr.on('data', d => process.stderr.write(`[game] ${d}`));
  serverProc.on('exit', code => {
    if (quitting) return;
    // 服务意外退出：窗口失去数据源，提示并退出，避免留下空白界面
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox('游戏服务已停止',
        `内置服务进程意外退出（代码 ${code}）。\n存档位于：\n${saveFile}`);
      app.quit();
    }
  });
}

function stopServer() {
  if (!serverProc || serverProc.exitCode != null) return;
  try { serverProc.kill(); } catch { /* 忽略 */ }
}

/* ---------- 窗口 ---------- */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 700,
    show: false,
    backgroundColor: '#0a0e15',
    title: '尘缘仙途',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...THEME_CHROME.ink, height: TITLEBAR_H },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  // 站外链接一律交给系统浏览器，不在游戏窗口里打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`http://127.0.0.1:${serverPort}`)) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  // 开发期快捷键：F12 开发者工具 / F5 或 Ctrl+R 重载
  mainWindow.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const key = (input.key || '').toLowerCase();
    if (input.key === 'F12') { mainWindow.webContents.toggleDevTools(); e.preventDefault(); }
    else if (input.key === 'F5' || (input.control && key === 'r')) { mainWindow.webContents.reload(); e.preventDefault(); }
  });

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);
}

/* ---------- 主题联动：前端切换皮肤时同步窗口按钮配色 ---------- */
ipcMain.on('titlebar-theme', (event, id) => {
  const chrome = THEME_CHROME[id] || THEME_CHROME.ink;
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed() && typeof win.setTitleBarOverlay === 'function') {
    win.setTitleBarOverlay({ ...chrome, height: TITLEBAR_H });
  }
});

/* ---------- 生命周期 ---------- */
if (!app.requestSingleInstanceLock()) {
  // 多开会让两个进程争抢同一存档；第二个实例直接退出并聚焦已有窗口
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    try {
      serverPort = await findFreePort();
      startServer();
      await waitForServer(serverPort);
      createWindow();
    } catch (error) {
      stopServer();
      dialog.showErrorBox('尘缘仙途启动失败', String((error && error.message) || error));
      app.exit(1);
    }
  });

  app.on('window-all-closed', () => { quitting = true; stopServer(); app.quit(); });
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', stopServer);
  process.on('exit', stopServer);
}
