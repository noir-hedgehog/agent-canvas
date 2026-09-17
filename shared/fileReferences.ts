export type FileMedia = 'image' | 'video' | 'markdown';
export type FileReference = { id: string; projectId: string; name: string; source: string; mediaType: FileMedia; mime: string; remote: boolean; size?: number; modifiedAt?: number };
export type MediaMark = { x: number; y: number; width: number; height: number };
export type MediaContext = { reference: FileReference; inlineSource?: string; capturedAt: string; timeSeconds?: number; screenshotAssetId?: string; screenshotWidth?: number; screenshotHeight?: number; marks: MediaMark[] };
export function fileFormat(source: string): { mediaType: FileMedia; mime: string } | undefined {
  const ext = source.split(/[?#]/)[0].split('.').pop()?.toLowerCase();
  const types: Record<string, [FileMedia, string]> = {
    png: ['image','image/png'], jpg: ['image','image/jpeg'], jpeg: ['image','image/jpeg'], gif: ['image','image/gif'], webp: ['image','image/webp'],
    mp4: ['video','video/mp4'], m4v: ['video','video/mp4'], webm: ['video','video/webm'], mov: ['video','video/quicktime'],
    md: ['markdown','text/plain'], markdown: ['markdown','text/plain'],
  };
  const type = ext && types[ext];
  return type ? { mediaType: type[0], mime: type[1] } : undefined;
}
export function timeLabel(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 3600).toString().padStart(2,'0')}:${Math.floor(value / 60 % 60).toString().padStart(2,'0')}:${(value % 60).toString().padStart(2,'0')}`;
}
