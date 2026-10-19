/* 把 node_modules/electron/dist 复制成一份「干净」的发行版，供 electron-builder 使用。
   用途：electron-builder 在覆盖已存在的 win-unpacked 时会对 resources/default_app.asar
   执行 unlink；若该文件被系统/安全软件短暂占用，构建会以 EBUSY 失败。
   源目录里没有这个文件，覆盖阶段就不会碰它，构建可稳定重跑。
   用法：node tools/stage-electron-dist.mjs

   幂等策略：不整目录删除（rmSync 递归会触发安全删除的批量保护，且没必要）。
   先比对 version 文件，版本一致就只补删 default_app.asar，版本变了才覆盖复制。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules', 'electron', 'dist');
const dst = path.join(root, '.cache', 'electron-dist');
const SKIP = new Set(['default_app.asar']);

const readVer = p => {
  try { return fs.readFileSync(path.join(p, 'version'), 'utf8').trim(); } catch { return ''; }
};

if (!fs.existsSync(src)) {
  console.error('找不到 Electron 发行版：', src);
  process.exit(1);
}

const srcVer = readVer(src);
const dstVer = readVer(dst);
const fresh = dstVer !== '' && dstVer === srcVer;

if (!fresh) {
  fs.mkdirSync(dst, { recursive: true });
  fs.cpSync(src, dst, {
    recursive: true,
    force: true,
    filter: p => !SKIP.has(path.basename(p)),
  });
  console.log('staged electron dist →', path.relative(root, dst), `(${srcVer || 'unknown'})`);
} else {
  console.log('electron dist 已是最新，跳过复制', `(${srcVer})`);
}

// 覆盖复制不会删除「源里没有、目标里残留」的文件，逐个清掉（单文件，不走递归删除）
for (const name of SKIP) {
  const p = path.join(dst, name);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    console.log('removed', name);
  }
}
