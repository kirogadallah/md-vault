import * as fs from './fs.js';
import * as ed from './editor.js';
import * as crypto from './crypto.js';
import * as magic from './magic.js';
import * as ai from './ai.js';
import * as backup from './backup.js';
import * as settings from './settings.js';
import * as telegram from './telegram.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let root = null, cfg = settings.load();
let curId = null; // id (magic number) of the open note

// Status bar: only for quiet info ("Saved.", "Vault: x"). Errors go to fail().
const say = (m, ms = 4000) => { $('status').textContent = m; if (ms) setTimeout(() => { if ($('status').textContent === m) $('status').textContent = ''; }, ms); };

// Error message box.
const fail = (message, title = 'Something went wrong') => new Promise(res => {
  const d = $('msg');
  $('msgtitle').textContent = title; $('msgbody').textContent = message;
  if (d.open) return res();
  d.onclose = () => res();
  d.showModal(); d.querySelector('button').focus();
});
window.addEventListener('unhandledrejection', e => { e.preventDefault(); fail(String(e.reason?.message || e.reason)); });

// Generic dialog: fields = [{id,label,type,value,options}] -> resolves to {id:value} or null.
// `pre` is raw HTML shown above the fields.
function ask(title, fields, note, pre = '') {
  return new Promise(res => {
    $('dlgtitle').textContent = title;
    $('dlgbody').onclick = null;
    $('dlgbody').innerHTML = pre + (note ? `<p>${note}</p>` : '') + fields.map(f => `<label for="f_${f.id}">${f.label}</label>` +
      (f.options ? `<select id="f_${f.id}">${f.options.map(o => `<option ${o === f.value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
        : `<input id="f_${f.id}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}">`)).join('');
    const d = $('dlg');
    d.onclose = () => res(d.returnValue === 'ok' ? Object.fromEntries(fields.map(f => [f.id, $('f_' + f.id).value])) : null);
    d.showModal(); d.querySelector('input,select')?.focus();
  });
}
const choose = (title, names) => new Promise(res => {
  $('dlgtitle').textContent = title;
  $('dlgbody').innerHTML = names.length ? names.map(n => `<button type="button" class="ver" data-n="${esc(n)}">${esc(n.replace('.txt', ''))}</button>`).join('') : '<p>No versions yet.</p>';
  $('dlgok').hidden = true;
  const d = $('dlg');
  $('dlgbody').onclick = e => { if (e.target.dataset.n) { d.close('cancel'); res(e.target.dataset.n); } };
  d.onclose = () => { $('dlgok').hidden = false; res(null); };
  d.showModal();
});

// ---------- tree ----------
const LOCK = '<svg class="lock" viewBox="0 0 24 24" role="img" aria-label="Encrypted"><title>Encrypted</title><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const closed = new Set(); // collapsed folders, kept across refreshes

async function refresh() {
  const tree = await fs.listTree(root);
  const active = ed.state.path?.join('/');
  const build = (nodes, pre = '') => `<ul>${nodes.map(n => {
    if (n.kind === 'dir') {
      const k = pre + n.name;
      return `<li class="folder${closed.has(k) ? ' closed' : ''}"><div class="dir" data-d="${esc(k)}">${esc(n.name)}</div>${build(n.children, k + '/')}</li>`;
    }
    const p = n.path.join('/');
    return `<li class="file${active === p ? ' active' : ''}" data-p="${esc(p)}"><input type="checkbox" data-p="${esc(p)}" aria-label="Select ${esc(n.name)}"><span>${esc(n.name)}</span>${n.name.endsWith('.enc') ? LOCK : ''}</li>`;
  }).join('')}</ul>`;
  $('tree').outerHTML = `<ul id="tree">${tree.length ? build(tree).slice(4, -5) : '<li class="empty">No .md notes here yet. Create one with New note.</li>'}</ul>`;
}
const checked = () => [...document.querySelectorAll('#tree input:checked')].map(i => i.dataset.p.split('/'));

// ---------- open / save ----------
// The editor stays disabled until a note is open; every note display goes through here.
const show = (text, path, pw, id = null) => { ed.show(text, path, pw); curId = id; $('editor').disabled = false; };
// Before leaving the current note: auto-save it (if enabled) or ask before discarding.
async function leaveCurrent() {
  if (!ed.state.dirty) return true;
  if (cfg.autoSave && ed.state.path && root) { await saveNote(); return true; }
  return confirm('Discard unsaved changes?');
}
// Notes without an id (plain .md or legacy .enc) get one the moment they are opened, written into the file.
async function stampId() {
  curId = magic.newId();
  const out = ed.state.password ? crypto.encrypt(ed.text(), ed.state.password, curId) : magic.join(curId, ed.text());
  await fs.writeText(root, ed.state.path, out);
}
async function openNote(path) {
  if (ed.state.path?.join('/') === path.join('/')) return;
  if (!await leaveCurrent()) return;
  const raw = await fs.readText(root, path);
  let pw, doc;
  if (path.at(-1).endsWith('.enc')) {
    const a = await ask('Unlock note', [{ id: 'pw', label: 'Password', type: 'password' }]);
    if (!a) return;
    try { doc = crypto.decrypt(raw, a.pw); pw = a.pw; }
    catch (e) { return fail(e.message || 'Wrong password or damaged file.', 'Could not unlock note'); }
  } else doc = magic.split(raw);
  show(doc.text, path, pw, doc.id);
  if (!curId) await stampId();
  refresh();
}
async function saveNote() {
  if (!root) return fail('Open Settings and choose a vault folder first.', 'No vault open');
  if (!ed.state.path) {
    const a = await ask('New note', [{ id: 'name', label: 'File name', value: 'untitled.md' }]);
    if (!a) return;
    ed.state.path = [a.name.endsWith('.md') ? a.name : a.name + '.md'];
  }
  curId ||= magic.newId();
  const out = ed.state.password ? crypto.encrypt(ed.text(), ed.state.password, curId) : magic.join(curId, ed.text());
  await fs.writeText(root, ed.state.path, out);
  await backup.snapshot(root, curId, out);
  ed.state.dirty = false; say('Saved.'); refresh();
}
document.addEventListener('click', e => {
  if (!e.target.closest('#tree')) return;
  const f = e.target.closest('li.file'); // whole row opens the note (except the checkbox)
  if (f) { if (!e.target.closest('input')) openNote(f.dataset.p.split('/')); return; }
  const dir = e.target.closest('.dir'); // expand / collapse a folder
  if (dir) {
    const li = dir.parentElement, k = dir.dataset.d;
    li.classList.toggle('closed');
    li.classList.contains('closed') ? closed.add(k) : closed.delete(k);
  }
});

// ---------- header actions ----------
$('toggle').onclick = () => $('sidebar').classList.toggle('hidden');
async function useVault(handle) {
  root = handle; await fs.rememberVault(handle);
  await refresh(); startBackup(); startBot(); say('Vault: ' + handle.name);
}
// One entry point: reopens the remembered vault, or shows the folder picker when changing.
async function openVault(forcePick = false) {
  if (!fs.supported()) return fail('This browser lacks the File System Access API. Use Chrome, Edge or Brave.', 'Browser not supported');
  const last = forcePick ? null : await fs.lastVault();
  try {
    if (last && (await fs.hasAccess(last) || await fs.askAccess(last))) return await useVault(last);
    await useVault(await fs.pickVault());
  } catch (e) { if (e?.name !== 'AbortError') await fail(e.message || String(e), 'Could not open vault'); }
}
const syncVaultRow = () => {
  if (!$('vaultname')) return;
  $('vaultname').textContent = root ? root.name : 'None selected';
  $('vaultbtn').textContent = root ? 'Change vault' : 'Open vault';
};
document.addEventListener('click', async e => {
  if (!e.target.closest('#vaultbtn')) return;
  await openVault(!!root); syncVaultRow();
});
function startBot() { telegram.start(cfg, root, (m, reload) => { say(m); if (reload) refresh(); },
    id => { cfg.chatId = id; settings.save(cfg); }); }
(async () => { // auto-open on launch when permission is still granted
  const last = fs.supported() && await fs.lastVault();
  if (last && await fs.hasAccess(last)) useVault(last);
  else if (last) say(`Open Settings to reopen the vault "${last.name}".`, 0);
})();
$('new').onclick = async () => {
  if (!root) return fail('Open Settings and choose a vault folder first.', 'No vault open');
  if (!await leaveCurrent()) return;
  const taken = new Set((await fs.listTree(root)).filter(n => n.kind !== 'dir').map(n => n.name.toLowerCase()));
  let name = 'untitled.md', i = 0;
  while (taken.has(name) || taken.has(name.replace(/\.md$/, '.enc'))) name = `untitled ${++i}.md`;
  const id = magic.newId();
  await fs.writeText(root, [name], magic.join(id, ''));
  show('', [name], undefined, id); await refresh(); $('editor').focus();
};
$('save').onclick = saveNote;
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveNote(); } });

$('encrypt').onclick = async () => {
  if (!ed.state.path) return fail('Save the note first, then encrypt it.', 'Cannot encrypt yet');
  if (ed.state.password) return fail('This note is already encrypted.', 'Already encrypted');
  const a = await ask('Encrypt note', [{ id: 'pw', label: 'Password', type: 'password' }, { id: 'pw2', label: 'Repeat password', type: 'password' }],
    'The password is never stored. If you lose it, the note cannot be recovered.');
  if (!a) return;
  if (!a.pw || a.pw !== a.pw2) return fail('The passwords are empty or do not match.', 'Password error');
  const old = ed.state.path, enc = [...old.slice(0, -1), old.at(-1).replace(/\.md$/i, '') + '.enc'];
  curId ||= magic.newId();
  await fs.writeText(root, enc, crypto.encrypt(ed.text(), a.pw, curId));
  await fs.remove(root, old);
  show(ed.text(), enc, a.pw, curId); say('Encrypted. Plain file removed.'); refresh();
};

$('history').onclick = async () => {
  if (!ed.state.path) return fail('Open a note first to see its versions.', 'No note open');
  if (!curId) return fail('This note has no versions yet.', 'No versions');
  const file = await choose('Versions of ' + ed.state.path.at(-1), await backup.versions(root, curId));
  if (!file) return;
  let t = await backup.readVersion(root, curId, file);
  const plain = magic.split(t);
  if (plain.id) t = plain.text; // plaintext version (.md note, or saved before the note was encrypted)
  else if (ed.state.password) { try { t = crypto.decrypt(t, ed.state.password).text; } catch (e) { return fail(e.message || 'Could not decrypt this version.', 'Could not load version'); } }
  ed.setText(t); say('Version loaded. Save to restore it.');
};

$('summarize').onclick = async () => {
  const sel = checked().filter(p => !p.at(-1).endsWith('.enc'));
  if (!sel.length) return fail('Tick one or more .md notes in the file explorer first. Encrypted notes are skipped.', 'No notes selected');
  say('Summarizing…', 0);
  try {
    const docs = await Promise.all(sel.map(async p => ({ name: p.join('/'), text: await fs.readText(root, p) })));
    show(await ai.summarize(cfg.ollamaUrl, cfg.model, docs), null); ed.state.dirty = true;
    say('Summary ready. Press Save to keep it as a new note.');
  } catch (e) {
    say('', 1);
    fail(e.message + '\n\nIs Ollama running with OLLAMA_ORIGINS set?', 'AI error');
  }
};

$('settings').onclick = async () => {
  let models = [];
  try { models = await ai.listModels(cfg.ollamaUrl); } catch { /* server offline */ }
  const vaultRow = `<div class="vault"><div><div class="k">Vault folder</div><div id="vaultname">${root ? esc(root.name) : 'None selected'}</div></div>
    <button type="button" id="vaultbtn">${root ? 'Change vault' : 'Open vault'}</button></div>`;
  const a = await ask('Settings', [
    { id: 'ollamaUrl', label: 'Ollama URL', value: cfg.ollamaUrl },
    models.length ? { id: 'model', label: 'Model', options: models, value: cfg.model } : { id: 'model', label: 'Model (Ollama unreachable, type a name)', value: cfg.model },
    { id: 'backupMinutes', label: 'Auto-backup every (minutes, 0 = off)', type: 'number', value: cfg.backupMinutes },
    { id: 'autoSave', label: 'Auto-save when switching notes', options: ['On', 'Off'], value: cfg.autoSave ? 'On' : 'Off' },
    { id: 'botToken', label: 'Telegram bot token (from @BotFather, optional)', type: 'password', value: cfg.botToken }
  ], '', vaultRow);
  if (!a) return;
  cfg = { ...a, autoSave: a.autoSave === 'On', backupMinutes: Math.max(0, Number(a.backupMinutes) || 0), chatId: a.botToken === cfg.botToken ? cfg.chatId : '' };
  settings.save(cfg); startBackup(); startBot(); say('Settings saved.');
};

// ---------- auto-backup ----------
function startBackup() {
  if (!root) return;
  backup.start(cfg.backupMinutes, async () => {
    if (!ed.state.path || !curId) return;
    const out = ed.state.password ? crypto.encrypt(ed.text(), ed.state.password, curId) : magic.join(curId, ed.text());
    if (await backup.snapshot(root, curId, out)) say('Backup saved.', 2500);
  });
}
window.addEventListener('beforeunload', e => { if (ed.state.dirty) e.preventDefault(); });