// Every note carries a random id (its "magic number") on its first line. The version folder is named after
// this id, so notes can be renamed or moved anywhere in (or out of) the vault and keep their history.
// The editor never sees the marker: it is stripped on open and added back on save.
const RE = /^<!--mdv:([0-9a-f]{16})-->\r?\n?/;
export const newId = () => [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('');
export const split = raw => { const m = RE.exec(raw); return m ? { id: m[1], text: raw.slice(m[0].length) } : { id: null, text: raw }; };
export const join = (id, text) => `<!--mdv:${id}-->\n${text}`;