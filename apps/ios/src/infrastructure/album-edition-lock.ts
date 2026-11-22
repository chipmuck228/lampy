// Sharing, EPUB generation and deletion must never operate on the same edition together.
const owners = new Set<string>();
export function acquireAlbumEdition(id: string): () => void {
  if (owners.has(id)) throw new Error('EPUB_BUSY');
  owners.add(id);
  return () => { owners.delete(id); };
}
