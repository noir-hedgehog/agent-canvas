import { create } from 'zustand';
import { defaultPreferences, normalizePreferences, type Preferences } from '../shared/preferences';
const key = 'ac-preferences:v1';
export function readPreferences(): Preferences {
  try { return normalizePreferences(JSON.parse(localStorage.getItem(key) || 'null')); }
  catch { return { ...defaultPreferences }; }
}
export const usePreferences = create<{ preferences: Preferences; error: string; update: (patch: Partial<Preferences>) => void }>((set, get) => ({
  preferences: readPreferences(), error: '',
  update(patch) {
    const preferences = normalizePreferences({ ...get().preferences, ...patch });
    try { localStorage.setItem(key, JSON.stringify(preferences)); set({ preferences, error: '' }); }
    catch { set({ error: '无法保存设置，请检查浏览器是否允许本地存储。' }); }
  },
}));
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key === key || event.key === null) usePreferences.setState({ preferences: readPreferences(), error: '' });
});
