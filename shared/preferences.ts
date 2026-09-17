export const fontOptions = {
  system: { label: '系统默认', family: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif' },
  sans: { label: '无衬线', family: 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif' },
  serif: { label: '衬线', family: 'Georgia, "Songti SC", "SimSun", serif' },
  mono: { label: '等宽', family: '"SFMono-Regular", Menlo, Consolas, "PingFang SC", monospace' },
};
export type Preferences = { defaultZoom: number; font: keyof typeof fontOptions; fontSize: number; rememberViewport: boolean };
export const defaultPreferences: Preferences = { defaultZoom: 83, font: 'system', fontSize: 14, rememberViewport: true };
export function normalizePreferences(value: unknown): Preferences {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    defaultZoom: typeof v.defaultZoom === 'number' && Number.isFinite(v.defaultZoom) && v.defaultZoom >= 25 && v.defaultZoom <= 200 ? v.defaultZoom : 83,
    font: typeof v.font === 'string' && Object.hasOwn(fontOptions, v.font) ? v.font as Preferences['font'] : 'system',
    fontSize: typeof v.fontSize === 'number' && Number.isFinite(v.fontSize) && v.fontSize >= 10 && v.fontSize <= 32 ? v.fontSize : 14,
    rememberViewport: typeof v.rememberViewport === 'boolean' ? v.rememberViewport : true,
  };
}
