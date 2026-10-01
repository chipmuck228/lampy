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

export type SaveEchoFocusGate = {
  focused: boolean;
  loadReady: boolean;
  itemIds: string[];
  request: number;
};

export function createSaveEchoFocusGate(): SaveEchoFocusGate {
  return { focused: false, loadReady: false, itemIds: [], request: 0 };
}

export function nextEchoSeq(current: number): number {
  return current + 1;
}

export function echoCallbackIsCurrent(started: number, current: number): boolean {
  return started === current;
}

export function shouldAcceptRecentLoad(started: number, current: number, focused: boolean): boolean {
  return focused && started === current;
}

export function beginRecentEchoFocus(gate: SaveEchoFocusGate): number {
  gate.focused = true;
  gate.loadReady = false;
  gate.itemIds = [];
  gate.request = nextEchoSeq(gate.request);
  return gate.request;
}

export function endRecentEchoFocus(gate: SaveEchoFocusGate): void {
  gate.focused = false;
  gate.loadReady = false;
  gate.itemIds = [];
  gate.request = nextEchoSeq(gate.request);
}

export function acceptRecentEchoLoad(gate: SaveEchoFocusGate, started: number, itemIds: string[]): boolean {
  if (!shouldAcceptRecentLoad(started, gate.request, gate.focused)) return false;
  gate.itemIds = itemIds;
  gate.loadReady = true;
  return true;
}

export function rejectRecentEchoLoad(gate: SaveEchoFocusGate, started: number): boolean {
  if (!shouldAcceptRecentLoad(started, gate.request, gate.focused)) return false;
  gate.loadReady = false;
  gate.itemIds = [];
  return true;
}

export function isRecentForeground(state: string | null | undefined): boolean {
  return state === 'active';
}

export function shouldRevealSaveEcho(input: {
  momentId: string | null;
  itemIds: string[];
  loadReady: boolean;
  focused: boolean;
  foreground: boolean;
}): boolean {
  return (
    input.focused &&
    input.loadReady &&
    input.foreground &&
    !!input.momentId &&
    input.itemIds.includes(input.momentId)
  );
}

export function shouldRevealFromGate(
  gate: SaveEchoFocusGate,
  momentId: string | null,
  appState: string | null | undefined,
): boolean {
  return shouldRevealSaveEcho({
    momentId,
    itemIds: gate.itemIds,
    loadReady: gate.loadReady,
    focused: gate.focused,
    foreground: isRecentForeground(appState),
  });
}

export function tryConsumeSaveEcho(
  gate: SaveEchoFocusGate,
  appState: string | null | undefined,
): string | null {
  const pending = peekJustSavedMomentId();
  if (shouldRevealFromGate(gate, pending, appState)) {
    return consumeJustSavedMomentId();
  }
  if (pending && gate.focused && gate.loadReady && !gate.itemIds.includes(pending)) {
    consumeJustSavedMomentId();
  }
  return null;
}

export function shouldSkipSaveEchoFade(reduceMotion: boolean): boolean {
  return reduceMotion;
}
