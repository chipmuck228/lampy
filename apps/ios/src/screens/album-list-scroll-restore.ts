export type AlbumListScrollRestoreGate = {
  listReady: boolean;
  guideReady: boolean;
  contentSized: boolean;
  contentHeight: number;
};

/** Wait until list read finished, guide resolved, and target content has laid out. */
export function albumListScrollRestoreReady(gate: AlbumListScrollRestoreGate): boolean {
  return gate.listReady && gate.guideReady && gate.contentSized && gate.contentHeight >= 0;
}

/**
 * While restore is pending or the list is in a loading collapse, ignore offsets
 * (especially y=0) so they do not overwrite the saved session offset.
 */
export function albumListShouldRecordScrollOffset(input: {
  restorePending: boolean;
  listLoading: boolean;
  offsetY: number;
}): boolean {
  if (input.restorePending) return false;
  if (input.listLoading) return false;
  return Number.isFinite(input.offsetY) && input.offsetY >= 0;
}

export function clampAlbumListScrollY(
  offsetY: number,
  contentHeight: number,
  viewportHeight: number,
): number {
  if (!Number.isFinite(offsetY) || offsetY < 0) return 0;
  const max = Math.max(0, (Number.isFinite(contentHeight) ? contentHeight : 0) - Math.max(0, viewportHeight));
  return Math.min(offsetY, max);
}

export function albumListRestoreScrollY(input: {
  restorePending: boolean;
  savedY: number;
  listReady: boolean;
  guideReady: boolean;
  contentSized: boolean;
  contentHeight: number;
  viewportHeight: number;
}): { action: 'wait' | 'skip' | 'restore'; y: number } {
  if (!input.restorePending) return { action: 'skip', y: 0 };
  if (
    !albumListScrollRestoreReady({
      listReady: input.listReady,
      guideReady: input.guideReady,
      contentSized: input.contentSized,
      contentHeight: input.contentHeight,
    })
  ) {
    return { action: 'wait', y: 0 };
  }
  if (!(input.savedY > 0)) return { action: 'skip', y: 0 };
  return {
    action: 'restore',
    y: clampAlbumListScrollY(input.savedY, input.contentHeight, input.viewportHeight),
  };
}
