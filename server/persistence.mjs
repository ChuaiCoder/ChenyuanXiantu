import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import lockfile from 'proper-lockfile';

// The lock covers the whole server lifetime, including reading and migration.
// proper-lockfile releases it on normal exit and recovers stale locks after a crash.
export async function acquireSaveLock(file) {
  mkdirSync(path.dirname(file), { recursive: true });
  const target = existsSync(file) ? realpathSync(file) : path.join(realpathSync(path.dirname(file)), path.basename(file));
  try {
    return await lockfile.lock(target, {
      realpath: false, stale: 10000, update: 2000,
      retries: { retries: 12, factor: 1, minTimeout: 1000, maxTimeout: 1000 },
    });
  } catch (error) {
    if (error.code === 'ELOCKED') throw new Error(`存档正在被另一个游戏服务使用，请先关闭旧服务：${file}`, { cause: error });
    throw error;
  }
}

export function loadSave(engine, file) {
  let failure;
  for (const candidate of [file, `${file}.bak`]) {
    if (!existsSync(candidate)) continue;
    try { engine.hydrate(JSON.parse(readFileSync(candidate, 'utf8'))); return candidate; }
    catch (error) { failure = error; }
  }
  if (failure) throw new Error(`存档和备份均无法读取，已保留原文件：${failure.message}`);
  return null;
}

export function saveEngine(engine, file) {
  mkdirSync(path.dirname(file), { recursive: true });
  const snapshot = engine.serialize();
  snapshot.S.lastTs = Date.now();
  const data = JSON.stringify(snapshot);
  // 两份完整快照均通过临时文件替换，异常退出不会截断正在使用的存档。
  for (const target of [`${file}.bak`, file]) {
    const temporary = `${target}.tmp`;
    writeFileSync(temporary, data, { encoding: 'utf8', flush: true });
    renameSync(temporary, target);
  }
  // A failed write must not advance the in-memory save cursor.
  engine.S.lastTs = snapshot.S.lastTs;
}
