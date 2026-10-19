/* ============ 主题：三套修仙皮肤，localStorage 持久化 ============ */
import { ref } from 'vue';

export const THEMES = [
  { id: 'ink', name: '墨夜鎏金', dot: '#d8b45e' },
  { id: 'jade', name: '青云玉竹', dot: '#93c9a8' },
  { id: 'blood', name: '血海魔修', dot: '#c9835a' },
];

const KEY = 'xy-theme';
const saved = THEMES.some(t => t.id === localStorage.getItem(KEY)) ? localStorage.getItem(KEY) : 'ink';

export const theme = ref(saved);

export function setTheme(id) {
  if (!THEMES.some(t => t.id === id)) return;
  theme.value = id;
  localStorage.setItem(KEY, id);
  document.body.dataset.theme = id;
  // 桌面版：让无边框窗口右上角的系统按钮跟随换色（浏览器下该对象不存在）
  window.gameShell?.setTitlebarTheme?.(id);
}

document.body.dataset.theme = theme.value;
window.gameShell?.setTitlebarTheme?.(theme.value);
