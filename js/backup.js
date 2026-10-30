// Timed snapshots into <vault>/.versions/<note-id>/<timestamp>.txt, one flat folder per note (never mirrors the vault tree).
import { writeText, readText, listNames } from './fs.js';
const last = new Map(); // id -> last snapshotted text
let timer = null;
const folder = id => ['.versions', id];
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

export async function snapshot(root, id, text) {
  if (!id || last.get(id) === text) return false; // no id yet, or unchanged since last version
  await writeText(root, [...folder(id), `${stamp()}.txt`], text);
  last.set(id, text);
  return true;
}
export const versions = (root, id) => listNames(root, folder(id));
export const readVersion = (root, id, file) => readText(root, [...folder(id), file]);
export function start(minutes, tick) {
  stop();
  if (minutes > 0) timer = setInterval(tick, minutes * 60000);
}
export const stop = () => { clearInterval(timer); timer = null; };