// Shared move semantics: one step, stable neighbors, no mutation of the source list.
export function moveAlbumReference(ids: readonly string[], id: string, direction: 'up' | 'down'): string[] | null {
  const index = ids.indexOf(id);
  if (index < 0) return null;
  const next = [...ids],
    target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= next.length) return next;
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next;
}
