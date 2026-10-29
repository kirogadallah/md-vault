// Timed snapshots into <vault>/.versions/<note-name>/<timestamp>.<ext>, one folder per note.
import { writeText, readText, listNames } from './fs.js';
const last = new Map(); // path -> last snapshotted text
let timer = null;
const folder = path => ['.versions', ...path.slice(0, -1), path.at(-1)];
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

export async function snapshot(root, path, text) {
  const k = path.join('/');
  if (last.get(k) === text) return false; // unchanged since last version
  await writeText(root, [...folder(path), `${stamp()}.txt`], text);
  last.set(k, text);
  return true;
}
export const versions = (root, path) => listNames(root, folder(path));
export const readVersion = (root, path, file) => readText(root, [...folder(path), file]);
export function start(minutes, tick) {
  stop();
  if (minutes > 0) timer = setInterval(tick, minutes * 60000);
}
export const stop = () => { clearInterval(timer); timer = null; };
