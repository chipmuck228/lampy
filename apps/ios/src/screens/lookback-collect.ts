export type LookbackCollectLoaded = { id: string; name: string };

export function lookbackCollectIsReady(
  targetId: string | null,
  loadedId: string | null | undefined,
): targetId is string {
  return !!targetId && loadedId === targetId;
}

export function shouldApplyLookbackCollectResult(input: {
  targetId: string | null;
  requestAlbumId: string;
  generation: number;
  currentGeneration: number;
}): boolean {
  return (
    !!input.targetId &&
    input.targetId === input.requestAlbumId &&
    input.generation === input.currentGeneration
  );
}

export function shouldApplyLookbackCollectLoad(input: {
  targetId: string | null;
  albumId: string;
  generation: number;
  currentGeneration: number;
}): boolean {
  return shouldApplyLookbackCollectResult({
    targetId: input.targetId,
    requestAlbumId: input.albumId,
    generation: input.generation,
    currentGeneration: input.currentGeneration,
  });
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
    shouldApplyLookbackCollectResult({
      targetId: input.targetId,
      requestAlbumId: input.requestAlbumId,
      generation: input.generation,
      currentGeneration: input.currentGeneration,
    })
  );
}
