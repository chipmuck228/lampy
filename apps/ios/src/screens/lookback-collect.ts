export type LookbackCollectLoaded = { id: string; name: string };

export function lookbackCollectIsReady(
  targetId: string | null,
  loadedId: string | null | undefined,
): targetId is string {
  return !!targetId && loadedId === targetId;
}

export function shouldApplyLookbackCollectLoad(input: {
  targetId: string | null;
  albumId: string;
  generation: number;
  currentGeneration: number;
}): boolean {
  return input.targetId === input.albumId && input.generation === input.currentGeneration;
}

export function shouldApplyLookbackCollectWrite(input: {
  targetId: string | null;
  loadedId: string | null | undefined;
  requestAlbumId: string;
  generation: number;
  currentGeneration: number;
}): boolean {
  return (
    lookbackCollectIsReady(input.targetId, input.loadedId) &&
    input.requestAlbumId === input.targetId &&
    input.generation === input.currentGeneration
  );
}
