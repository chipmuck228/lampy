let justSavedMomentId: string | null = null;

export const SAVE_ECHO_FADE_MS = 420;
export const SAVE_ECHO_START_OPACITY = 0.4;

export function writeJustSavedMomentId(id: string): void {
  justSavedMomentId = id;
}

export function peekJustSavedMomentId(): string | null {
  return justSavedMomentId;
}

export function consumeJustSavedMomentId(): string | null {
  const id = justSavedMomentId;
  justSavedMomentId = null;
  return id;
}

export function resetJustSavedMomentIdForTests(): void {
  justSavedMomentId = null;
}

export function shouldRevealSaveEcho(input: {
  momentId: string | null;
  itemIds: string[];
  loadReady: boolean;
  foreground: boolean;
}): boolean {
  return (
    input.loadReady &&
    input.foreground &&
    !!input.momentId &&
    input.itemIds.includes(input.momentId)
  );
}

export function shouldSkipSaveEchoFade(reduceMotion: boolean): boolean {
  return reduceMotion;
}
