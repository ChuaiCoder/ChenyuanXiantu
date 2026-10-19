<script setup>
import { onMounted, onBeforeUnmount, watch } from 'vue';
import { theme } from '../store/theme.js';
let cv, ctx, W, H, raf;
let puffs = [], embers = [];
let reduced = false;
let cloudRgb = '128,152,190', emberRgb = '228,196,130';

function readThemeColors() {
  const cs = getComputedStyle(document.body);
  cloudRgb = (cs.getPropertyValue('--cloud-rgb') || cloudRgb).trim();
  emberRgb = (cs.getPropertyValue('--ember-rgb') || emberRgb).trim();
}

function resize() { W = cv.width = innerWidth; H = cv.height = innerHeight; }

function frame(t) {
  ctx.clearRect(0, 0, W, H);
  for (const p of puffs) {
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
    g.addColorStop(0, `rgba(${cloudRgb},${p.a})`);
    g.addColorStop(1, `rgba(${cloudRgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    if (!reduced) { p.x += p.v * 0.016; if (p.x - p.r > W) { p.x = -p.r; p.y = Math.random() * H; } }
  }
  for (const m of embers) {
    const al = reduced ? 0.35 : (0.22 + 0.3 * Math.abs(Math.sin(t / 1000 * m.tw + m.ph)));
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 6.283);
    ctx.fillStyle = `rgba(${emberRgb},${al})`; ctx.fill();
    if (!reduced) { m.y -= m.v * 0.016 * m.r; if (m.y < -4) { m.y = H + 4; m.x = Math.random() * W; } }
  }
  if (!reduced) raf = requestAnimationFrame(frame);
}
onMounted(() => {
  cv = document.getElementById('bg') || (() => { const c = document.createElement('canvas'); c.id = 'bg'; document.body.prepend(c); return c; })();
  ctx = cv.getContext('2d');
  resize();
  addEventListener('resize', resize);
  reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
  readThemeColors();
  for (let i = 0; i < 6; i++) puffs.push({ x: Math.random() * W, y: Math.random() * H, r: 260 + Math.random() * 340, v: 4 + Math.random() * 9, a: 0.045 + Math.random() * 0.04 });
  for (let i = 0; i < 26; i++) embers.push({ x: Math.random() * W, y: Math.random() * H, r: 0.6 + Math.random() * 1.6, v: 0.25 + Math.random() * 0.85, ph: Math.random() * 6.28, tw: 0.5 + Math.random() });
  frame(0);
});
watch(theme, () => { readThemeColors(); if (reduced) frame(0); });
onBeforeUnmount(() => cancelAnimationFrame(raf));
</script>
<template></template>
