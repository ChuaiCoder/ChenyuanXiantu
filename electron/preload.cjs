/* 预加载脚本：向渲染进程暴露最小化的桌面能力。
   只提供「是否运行在桌面外壳」与「同步标题栏配色」两件事，不开放任何 Node 能力。 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gameShell', {
  desktop: true,
  platform: process.platform,
  // 前端切换主题时调用，让无边框窗口右上角的系统按钮跟随换色
  setTitlebarTheme: id => ipcRenderer.send('titlebar-theme', String(id)),
});
