import { createApp } from 'vue';
import App from './App.vue';
import './style.css';

// 桌面外壳（Electron）：启用无边框窗口的顶部拖拽条与内容下移。
// 纯浏览器访问时 gameShell 不存在，样式与行为完全不变。
if (window.gameShell?.desktop) document.body.classList.add('desktop');

createApp(App).mount('#app');
