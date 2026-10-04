export function shouldApplyAlbumLayoutResult(input: {
  albumId: string;
  requestAlbumId: string;
  generation: number;
  currentGeneration: number;
}): boolean {
  return input.albumId === input.requestAlbumId && input.generation === input.currentGeneration;
}
