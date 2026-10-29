const KEY = 'mdvault.settings';
const DEFAULTS = { ollamaUrl: 'http://localhost:11434', model: '', backupMinutes: 10, botToken: '', chatId: '' };
export const load = () => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { ...DEFAULTS }; } };
export const save = s => localStorage.setItem(KEY, JSON.stringify(s));
