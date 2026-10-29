// File System Access API wrapper. Notes are addressed by path arrays relative to the vault root.
export const SKIP = '.versions';
export const supported = () => 'showDirectoryPicker' in window;
export const pickVault = () => showDirectoryPicker({ mode: 'readwrite' });

export async function listTree(dir, path = []) {
  const out = [];
  for await (const [name, h] of dir.entries()) {
    if (name === SKIP || name.startsWith('.')) continue;
    if (h.kind === 'directory') out.push({ name, kind: 'dir', path: [...path, name], children: await listTree(h, [...path, name]) });
    else if (/\.(md|enc)$/i.test(name)) out.push({ name, kind: 'file', path: [...path, name] });
  }
  return out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1));
}
async function dirAt(root, parts, create) {
  let d = root;
  for (const p of parts) d = await d.getDirectoryHandle(p, { create });
  return d;
}
export async function readText(root, path) {
  const d = await dirAt(root, path.slice(0, -1), false);
  return (await (await d.getFileHandle(path.at(-1))).getFile()).text();
}
export async function writeText(root, path, text) {
  const d = await dirAt(root, path.slice(0, -1), true);
  const w = await (await d.getFileHandle(path.at(-1), { create: true })).createWritable();
  await w.write(text); await w.close();
}
export async function remove(root, path) {
  await (await dirAt(root, path.slice(0, -1), false)).removeEntry(path.at(-1));
}
export async function listNames(root, path) {
  try { const d = await dirAt(root, path, false); const n = []; for await (const [name] of d.entries()) n.push(name); return n.sort().reverse(); }
  catch { return []; }
}

// ---- remember the last vault (handles can be stored in IndexedDB) ----
const idb = () => new Promise((res, rej) => {
  const r = indexedDB.open('mdvault', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
export async function rememberVault(handle) {
  const db = await idb();
  await new Promise(res => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(handle, 'vault'); t.oncomplete = res; });
}
export async function lastVault() {
  try {
    const db = await idb();
    return await new Promise(res => { const q = db.transaction('kv').objectStore('kv').get('vault'); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); });
  } catch { return null; }
}
// 'granted' needs no click. Otherwise requestPermission must run inside a user gesture.
export const hasAccess = async h => (await h.queryPermission({ mode: 'readwrite' })) === 'granted';
export const askAccess = async h => (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
