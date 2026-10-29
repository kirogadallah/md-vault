// Password -> SHA-256 key -> AES. A magic prefix inside the plaintext verifies the password
// without ever storing it or a hash of it.
export const MAGIC = 'MAGIC_KEYWORD_OK:';
const key = pw => CryptoJS.SHA256(pw).toString();
export const encrypt = (text, pw) => CryptoJS.AES.encrypt(MAGIC + text, key(pw)).toString();
export function decrypt(cipher, pw) {
  try {
    const plain = CryptoJS.AES.decrypt(cipher, key(pw)).toString(CryptoJS.enc.Utf8);
    if (plain.startsWith(MAGIC)) return plain.slice(MAGIC.length);
  } catch { /* malformed UTF-8 means a wrong key */ }
  throw new Error('Incorrect password or corrupted file.');
}
