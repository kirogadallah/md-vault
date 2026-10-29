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
