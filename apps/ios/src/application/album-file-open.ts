// URLs stay in memory; no personal repository, bookmarks or reading history.
let sequence = 0;
let pending: {token: number; source: string} | null = null;
export function receiveAlbumFile(source: string): number {
  const url = new URL(source);
  if (url.protocol !== 'file:' || !decodeURIComponent(url.pathname).toLowerCase().endsWith('.lampy') || url.host && url.host !== 'localhost') throw new Error('FILE_INVALID');
  if (pending?.source === source) return pending.token;
  pending = {token: ++sequence,source}; return sequence;
}
export function pendingAlbumFile(token: number) {return pending?.token === token ? pending.source : null;}
export function forgetAlbumFile(token: number) {if (pending?.token === token) pending = null;}
