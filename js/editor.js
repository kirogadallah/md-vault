// Textarea + live preview. Tracks the open note and unsaved changes.
const ta = document.getElementById('editor'), pv = document.getElementById('preview');
export const state = { path: null, password: null, dirty: false };
const render = () => { pv.innerHTML = marked.parse(ta.value); };
ta.addEventListener('input', () => { state.dirty = true; render(); });
export function show(text, path, password = null) {
  Object.assign(state, { path, password, dirty: false });
  ta.value = text; render();
}
export const text = () => ta.value;
export function setText(t) { ta.value = t; state.dirty = true; render(); }

// ---------- list editing: Enter continues a list, Tab / Shift+Tab indents ----------
const LIST = /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/;
const lineStart = i => (i === 0 ? 0 : ta.value.lastIndexOf('\n', i - 1) + 1);

// Replace a range through execCommand so the browser's undo stack keeps working.
function edit(from, to, str) {
  ta.focus(); ta.setSelectionRange(from, to);
  const ok = str ? document.execCommand('insertText', false, str) : (from === to || document.execCommand('delete'));
  if (!ok) { ta.setRangeText(str, from, to, 'end'); ta.dispatchEvent(new Event('input')); }
}

ta.addEventListener('keydown', e => {
  if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  const { selectionStart: s, selectionEnd: en, value: v } = ta;

  if (e.key === 'Enter' && !e.shiftKey && s === en) {
    const ls = lineStart(s), before = v.slice(ls, s), m = LIST.exec(before);
    if (!m) return;
    e.preventDefault();
    const eol = v.indexOf('\n', s), rest = v.slice(s, eol < 0 ? v.length : eol);
    if (before === m[0] && !rest.trim()) return edit(ls, s, ''); // empty item: end the list
    const marker = /\d/.test(m[2]) ? (parseInt(m[2], 10) + 1) + m[2].slice(-1) : m[2];
    edit(s, s, '\n' + m[1] + marker + ' ' + (m[3] ? '[ ] ' : ''));
    return;
  }

  if (e.key === 'Tab') {
    const from = lineStart(s); let to = v.indexOf('\n', en); if (to < 0) to = v.length;
    const lines = v.slice(from, to).split('\n');
    if (!lines.some(l => LIST.test(l))) return; // keep normal Tab focus movement outside lists
    e.preventDefault();
    const out = lines.map(l => (e.shiftKey ? l.replace(/^( {1,2}|\t)/, '') : '  ' + l));
    const text = out.join('\n');
    edit(from, to, text);
    ta.setSelectionRange(Math.max(from, s + out[0].length - lines[0].length), en + text.length - (to - from));
  }
});