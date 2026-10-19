/* 临时截图脚本（验证界面用，不入打包）
   用法：
     unset ELECTRON_RUN_AS_NODE
     SHOT_DESKTOP=1 SHOT_URL=http://127.0.0.1:31700/ SHOT_OUT=output/desk.png \
       node_modules/electron/dist/electron.exe tools/_shot.cjs
   环境变量：SHOT_URL / SHOT_OUT / SHOT_W / SHOT_H / SHOT_WAIT / SHOT_DESKTOP */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

// 与主进程一致：受限环境下沙箱会让 GPU 进程崩溃
app.commandLine.appendSwitch('no-sandbox');
// SHOT_NOGPU=1 → 关闭硬件加速（部分环境下 capturePage 会抛 UnknownVizError）
if (process.env.SHOT_NOGPU === '1') app.disableHardwareAcceleration();
// 用独立 profile，避免与正在运行的主实例争用同一 userData
app.setPath('userData', path.join(require('node:os').tmpdir(), 'xy-shot-profile'));

const url = process.env.SHOT_URL || 'http://127.0.0.1:31700/';
const out = process.env.SHOT_OUT || 'shot.png';
const width = +(process.env.SHOT_W || 1440);
const height = +(process.env.SHOT_H || 900);
const wait = +(process.env.SHOT_WAIT || 5000);
// SHOT_DESKTOP=1 → 注入桌面 preload，模拟 exe 内的顶栏与拖拽区
const preload = process.env.SHOT_DESKTOP
  ? path.join(__dirname, '..', 'electron', 'preload.cjs')
  : undefined;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width, height, show: true, frame: false,
    backgroundColor: '#0a0e15',
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload, sandbox: false },
  });
  try {
    if (process.env.SHOT_LOG === '1') {
      win.webContents.on('console-message', (e, lvl, msg) => console.log('[console]', lvl, msg));
      win.webContents.on('render-process-gone', (e, d) => console.log('[gone]', JSON.stringify(d)));
    }
    await win.loadURL(url);
    await new Promise(r => setTimeout(r, wait));
    // 缩放倍率会按站点记忆，必须显式归位，否则上次的放大值会残留
    win.webContents.setZoomFactor(+(process.env.SHOT_ZOOM || 1));
    await new Promise(r => setTimeout(r, 600));
    // SHOT_JS：截图前执行一段页面脚本（例如点掉开局窗，看到主界面）
    if (process.env.SHOT_JS) {
      const r = await win.webContents.executeJavaScript(process.env.SHOT_JS, true).catch(() => null);
      if (r !== null && r !== undefined) console.log('[js]', typeof r === 'string' ? r : JSON.stringify(r));
      await new Promise(r2 => setTimeout(r2, +(process.env.SHOT_JS_WAIT || 2500)));
    }
    // SHOT_RECT="x,y,w,h"：只截取页面局部（CSS 像素），便于放大检查细节
    let rect = null;
    if (process.env.SHOT_RECT) {
      const [x, y, w, h] = process.env.SHOT_RECT.split(',').map(Number);
      rect = { x, y, width: w, height: h };
    }
    // capturePage 在部分显卡驱动上偶发 UnknownVizError，重试几次即可稳定
    let img = null, lastErr = null;
    for (let i = 0; i < 5 && !img; i++) {
      try { img = rect ? await win.webContents.capturePage(rect) : await win.webContents.capturePage(); }
      catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 600)); }
    }
    if (!img) throw lastErr;
    fs.writeFileSync(out, img.toPNG());
    console.log('saved:', out);
  } catch (e) {
    console.error('shot failed:', e.message);
  }
  app.quit();
});
