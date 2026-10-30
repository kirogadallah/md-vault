// Password -> SHA-256 key -> AES. The plaintext starts with the note's id marker (see magic.js), which both
// verifies the password (without ever storing it or a hash of it) and carries the note's id.
import { split, join } from './magic.js';
const LEGACY = 'MAGIC_KEYWORD_OK:'; // old notes: valid password, but no id yet
const key = pw => CryptoJS.SHA256(pw).toString();
export const encrypt = (text, pw, id) => CryptoJS.AES.encrypt(join(id, text), key(pw)).toString();
// -> { id, text } (id is null for legacy notes)
export function decrypt(cipher, pw) {
  try {
    const plain = CryptoJS.AES.decrypt(cipher, key(pw)).toString(CryptoJS.enc.Utf8);
    const r = split(plain);
    if (r.id) return r;
    if (plain.startsWith(LEGACY)) return { id: null, text: plain.slice(LEGACY.length) };
  } catch { /* malformed UTF-8 means a wrong key */ }
  throw new Error('Incorrect password or corrupted file.');
}