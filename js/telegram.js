// Optional Telegram bot. Long-polls api.telegram.org while the app is open and a token is set.
// Commands: /note <text> (or any plain text) saves a note into <vault>/Telegram/, /list, /help.
// The first chat to message the bot is locked in as the owner; every other chat is ignored.
import { writeText, listTree } from './fs.js';
let current = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const call = (token, method, body, signal) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal }).then(r => r.json());
const flat = (nodes, out = []) => { for (const n of nodes) n.kind === 'dir' ? flat(n.children, out) : out.push(n.path.join('/')); return out; };

export function stop() { current?.abort(); current = null; }

export async function start({ botToken, chatId }, root, onEvent, onBind) {
  stop();
  if (!botToken || !root) return;
  const ctrl = current = new AbortController();
  const reply = (id, text) => call(botToken, 'sendMessage', { chat_id: id, text }, ctrl.signal);
  let offset = 0;
  onEvent('Telegram bot listening.');
  while (current === ctrl) {
    try {
      const r = await call(botToken, 'getUpdates', { offset, timeout: 25 }, ctrl.signal);
      if (!r.ok) { onEvent('Telegram: ' + r.description); return; }
      for (const u of r.result) {
        offset = u.update_id + 1;
        const m = u.message; if (!m?.text) continue;
        const id = String(m.chat.id);
        if (!chatId) { chatId = id; onBind(id); await reply(id, 'Connected. This chat now controls your vault. Send /help to see commands.'); }
        if (id !== String(chatId)) { await reply(id, 'This bot is private.'); continue; }
        const [cmd, ...rest] = m.text.trim().split(/\s+/);
        if (cmd === '/help' || cmd === '/start') await reply(id, 'Send any text or /note <text> to save a note.\n/list shows your 20 newest notes.');
        else if (cmd === '/list') await reply(id, flat(await listTree(root)).slice(-20).join('\n') || 'No notes yet.');
        else {
          const text = cmd === '/note' ? rest.join(' ') : m.text;
          if (!text) { await reply(id, 'Add some text after /note.'); continue; }
          const name = `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.md`;
          await writeText(root, ['Telegram', name], text + '\n');
          await reply(id, `Saved as Telegram/${name}`);
          onEvent('Telegram note saved.', true);
        }
      }
    } catch { if (current !== ctrl) return; await sleep(5000); }
  }
}
