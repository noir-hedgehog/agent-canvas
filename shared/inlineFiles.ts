import { fileFormat } from './fileReferences';

export function inlineFileSource(href: string): string | undefined {
  try {
    if (/^https?:\/\//i.test(href) || href.startsWith('//')) {
      const url = new URL(href.startsWith('//') ? `https:${href}` : href);
      return fileFormat(url.pathname) ? url.href : undefined;
    }
    if (/^file:/i.test(href)) {
      const url = new URL(href);
      if (url.hostname && url.hostname !== 'localhost') return undefined;
      const source = decodeURIComponent(url.pathname);
      return fileFormat(source) ? source : undefined;
    }
    if (!href || href.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(href)) return undefined;
    const source = decodeURIComponent(href);
    return fileFormat(source) ? source : undefined;
  } catch { return undefined; }
}

// Reopening an inline link reuses its project-scoped reference without altering card text.
export async function inlineReferenceId(projectId: string, source: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(['inline-file',projectId,source])));
  const bytes = new Uint8Array(hash).slice(0,16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
