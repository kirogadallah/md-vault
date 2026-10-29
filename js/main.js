import * as fs from './fs.js';
import * as ed from './editor.js';
import * as crypto from './crypto.js';
import * as ai from './ai.js';
import * as backup from './backup.js';
import * as settings from './settings.js';
import * as telegram from './telegram.js';

const $ = id => document.getElementById(id);
let root = null, cfg = settings.load();
const say = (m, ms = 4000) => { $('status').textContent = m; if (ms) setTimeout(() => { if ($('status').textContent === m) $('status').textContent = ''; }, ms); };

// Generic dialog: fields = [{id,label,type,value,options}] -> resolves to {id:value} or null.
function ask(title, fields, note) {
  return new Promise(res => {
    $('dlgtitle').textContent = title;
    $('dlgbody').innerHTML = (note ? `<p>${note}</p>` : '') + fields.map(f => `<label for="f_${f.id}">${f.label}</label>` +
      (f.options ? `<select id="f_${f.id}">${f.options.map(o => `<option ${o === f.value ? 'selected' : ''}>${o}</option>`).join('')}</select>`
        : `<input id="f_${f.id}" type="${f.type || 'text'}" value="${f.value ?? ''}">`)).join('');
    const d = $('dlg');
    d.onclose = () => res(d.returnValue === 'ok' ? Object.fromEntries(fields.map(f => [f.id, $('f_' + f.id).value])) : null);
    d.showModal(); d.querySelector('input,select')?.focus();
  });
}
const choose = (title, names) => new Promise(res => {
  $('dlgtitle').textContent = title;
  $('dlgbody').innerHTML = names.length ? names.map(n => `<button type="button" class="ver" data-n="${n}">${n.replace('.txt', '')}</button>`).join('') : '<p>No versions yet.</p>';
  $('dlgok').hidden = true;
  const d = $('dlg');
  $('dlgbody').onclick = e => { if (e.target.dataset.n) { d.close('cancel'); res(e.target.dataset.n); } };
  d.onclose = () => { $('dlgok').hidden = false; res(null); };
  d.showModal();
});

// ---------- tree ----------
async function refresh() {
  const tree = await fs.listTree(root);
  const build = nodes => `<ul>${nodes.map(n => n.kind === 'dir'
    ? `<li><div class="dir">${n.name}</div>${build(n.children)}</li>`
    : `<li class="file${ed.state.path?.join('/') === n.path.join('/') ? ' active' : ''}"><input type="checkbox" data-p="${n.path.join('/')}" aria-label="Select ${n.name}"><span data-p="${n.path.join('/')}">${n.name}</span></li>`).join('')}</ul>`;
  $('tree').outerHTML = `<ul id="tree">${tree.length ? build(tree).slice(4, -5) : '<li class="empty">No .md notes here yet. Create one with New note.</li>'}</ul>`;
}
const checked = () => [...document.querySelectorAll('#tree input:checked')].map(i => i.dataset.p.split('/'));

// ---------- open / save ----------
async function openNote(path) {
  if (ed.state.dirty && !confirm('Discard unsaved changes?')) return;
  const raw = await fs.readText(root, path);
  if (path.at(-1).endsWith('.enc')) {
    const a = await ask('Unlock note', [{ id: 'pw', label: 'Password', type: 'password' }]);
    if (!a) return;
    try { ed.show(crypto.decrypt(raw, a.pw), path, a.pw); } catch (e) { return say(e.message); }
  } else ed.show(raw, path);
  refresh();
}
async function saveNote() {
  if (!root) return say('Open a vault first.');
  if (!ed.state.path) {
    const a = await ask('New note', [{ id: 'name', label: 'File name', value: 'untitled.md' }]);
    if (!a) return;
    ed.state.path = [a.name.endsWith('.md') ? a.name : a.name + '.md'];
  }
  const out = ed.state.password ? crypto.encrypt(ed.text(), ed.state.password) : ed.text();
  await fs.writeText(root, ed.state.path, out);
  await backup.snapshot(root, ed.state.path, out);
  ed.state.dirty = false; say('Saved.'); refresh();
}
document.addEventListener('click', e => { if (e.target.closest('#tree') && e.target.matches('span[data-p]')) openNote(e.target.dataset.p.split('/')); });

// ---------- header actions ----------
$('toggle').onclick = () => $('sidebar').classList.toggle('hidden');
async function useVault(handle) {
  root = handle; await fs.rememberVault(handle);
  await refresh(); startBackup(); startBot(); say('Vault: ' + handle.name);
}
// Reopens the remembered vault (one click at most); falls back to the folder picker.
async function openVault(forcePick = false) {
  if (!fs.supported()) return say('This browser lacks the File System Access API. Use Chrome, Edge or Brave.', 0);
  const last = forcePick ? null : await fs.lastVault();
  try {
    if (last && (await fs.hasAccess(last) || await fs.askAccess(last))) return useVault(last);
    useVault(await fs.pickVault());
  } catch { /* picker cancelled */ }
}
$('open').onclick = () => openVault();
$('change').onclick = () => openVault(true);
function startBot() { telegram.start(cfg, root, (m, reload) => { say(m); if (reload) refresh(); },
    id => { cfg.chatId = id; settings.save(cfg); }); }
(async () => { // auto-open on launch when permission is still granted
  const last = fs.supported() && await fs.lastVault();
  if (last && await fs.hasAccess(last)) useVault(last);
  else if (last) say(`Click "Open vault" to reopen ${last.name}.`, 0);
})();
$('new').onclick = () => { if (!root) return say('Open a vault first.'); ed.show('', null); };
$('save').onclick = saveNote;
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveNote(); } });

$('encrypt').onclick = async () => {
  if (!ed.state.path) return say('Save the note first.');
  if (ed.state.password) return say('This note is already encrypted.');
  const a = await ask('Encrypt note', [{ id: 'pw', label: 'Password', type: 'password' }, { id: 'pw2', label: 'Repeat password', type: 'password' }],
    'The password is never stored. If you lose it, the note cannot be recovered.');
  if (!a) return;
  if (!a.pw || a.pw !== a.pw2) return say('Passwords are empty or do not match.');
  const old = ed.state.path, enc = [...old.slice(0, -1), old.at(-1).replace(/\.md$/i, '') + '.enc'];
  await fs.writeText(root, enc, crypto.encrypt(ed.text(), a.pw));
  await fs.remove(root, old);
  ed.show(ed.text(), enc, a.pw); say('Encrypted. Plain file removed.'); refresh();
};

$('history').onclick = async () => {
  if (!ed.state.path) return say('Open a note first.');
  const file = await choose('Versions of ' + ed.state.path.at(-1), await backup.versions(root, ed.state.path));
  if (!file) return;
  let t = await backup.readVersion(root, ed.state.path, file);
  if (ed.state.password) { try { t = crypto.decrypt(t, ed.state.password); } catch (e) { return say(e.message); } }
  ed.setText(t); say('Version loaded. Save to restore it.');
};

$('summarize').onclick = async () => {
  const sel = checked().filter(p => !p.at(-1).endsWith('.enc'));
  if (!sel.length) return say('Tick one or more .md notes first (encrypted notes are skipped).');
  say('Summarizing…', 0);
  try {
    const docs = await Promise.all(sel.map(async p => ({ name: p.join('/'), text: await fs.readText(root, p) })));
    ed.show(await ai.summarize(cfg.ollamaUrl, cfg.model, docs), null); ed.state.dirty = true;
    say('Summary ready. Press Save to keep it as a new note.');
  } catch (e) { say('AI error: ' + e.message + ' (is Ollama running with OLLAMA_ORIGINS set?)', 0); }
};

$('settings').onclick = async () => {
  let models = [];
  try { models = await ai.listModels(cfg.ollamaUrl); } catch { /* server offline */ }
  const a = await ask('Settings', [
    { id: 'ollamaUrl', label: 'Ollama URL', value: cfg.ollamaUrl },
    models.length ? { id: 'model', label: 'Model', options: models, value: cfg.model } : { id: 'model', label: 'Model (Ollama unreachable, type a name)', value: cfg.model },
    { id: 'backupMinutes', label: 'Auto-backup every (minutes, 0 = off)', type: 'number', value: cfg.backupMinutes },
    { id: 'botToken', label: 'Telegram bot token (from @BotFather, optional)', type: 'password', value: cfg.botToken }
  ]);
  if (!a) return;
  cfg = { ...a, backupMinutes: Math.max(0, Number(a.backupMinutes) || 0), chatId: a.botToken === cfg.botToken ? cfg.chatId : '' };
  settings.save(cfg); startBackup(); startBot(); say('Settings saved.');
};

// ---------- auto-backup ----------
function startBackup() {
  if (!root) return;
  backup.start(cfg.backupMinutes, async () => {
    if (!ed.state.path) return;
    const out = ed.state.password ? crypto.encrypt(ed.text(), ed.state.password) : ed.text();
    if (await backup.snapshot(root, ed.state.path, out)) say('Backup saved.', 2500);
  });
}
window.addEventListener('beforeunload', e => { if (ed.state.dirty) e.preventDefault(); });
