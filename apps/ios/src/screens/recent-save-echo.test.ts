import {
  acceptRecentEchoLoad,
  beginRecentEchoFocus,
  consumeJustSavedMomentId,
  createSaveEchoFocusGate,
  echoCallbackIsCurrent,
  endRecentEchoFocus,
  isRecentForeground,
  nextEchoSeq,
  peekJustSavedMomentId,
  rejectRecentEchoLoad,
  resetJustSavedMomentIdForTests,
  shouldAcceptRecentLoad,
  shouldRevealFromGate,
  shouldRevealSaveEcho,
  shouldSkipSaveEchoFade,
  tryConsumeSaveEcho,
  writeJustSavedMomentId,
} from './recent-save-echo';

describe('recent save echo', () => {
  beforeEach(() => {
    resetJustSavedMomentIdForTests();
  });

  it('holds one process-local id until it is consumed', () => {
    writeJustSavedMomentId('moment_one');
    expect(peekJustSavedMomentId()).toBe('moment_one');
    expect(consumeJustSavedMomentId()).toBe('moment_one');
    expect(peekJustSavedMomentId()).toBeNull();
    expect(consumeJustSavedMomentId()).toBeNull();
  });

  it('reveals only when this focus load succeeded, the id is in that result, and AppState is active', () => {
    expect(
      shouldRevealSaveEcho({
        momentId: 'moment_one',
        itemIds: ['moment_one'],
        loadReady: true,
        focused: true,
        foreground: true,
      }),
    ).toBe(true);
    expect(
      shouldRevealSaveEcho({
        momentId: 'moment_one',
        itemIds: ['moment_one'],
        loadReady: false,
        focused: true,
        foreground: true,
      }),
    ).toBe(false);
    expect(
      shouldRevealSaveEcho({
        momentId: 'moment_one',
        itemIds: ['moment_other'],
        loadReady: true,
        focused: true,
        foreground: true,
      }),
    ).toBe(false);
    expect(
      shouldRevealSaveEcho({
        momentId: 'moment_one',
        itemIds: ['moment_one'],
        loadReady: true,
        focused: false,
        foreground: true,
      }),
    ).toBe(false);
    expect(
      shouldRevealSaveEcho({
        momentId: 'moment_one',
        itemIds: ['moment_one'],
        loadReady: true,
        focused: true,
        foreground: false,
      }),
    ).toBe(false);
  });

  it('skips the fade when Reduce Motion is on', () => {
    expect(shouldSkipSaveEchoFade(true)).toBe(true);
    expect(shouldSkipSaveEchoFade(false)).toBe(false);
  });

  it('treats only AppState active as recent foreground', () => {
    expect(isRecentForeground('active')).toBe(true);
    expect(isRecentForeground('background')).toBe(false);
    expect(isRecentForeground('inactive')).toBe(false);
    expect(isRecentForeground(undefined)).toBe(false);
  });

  it('ignores a finished callback from an earlier echo sequence', () => {
    const first = nextEchoSeq(0);
    const second = nextEchoSeq(first);
    expect(echoCallbackIsCurrent(first, first)).toBe(true);
    expect(echoCallbackIsCurrent(first, second)).toBe(false);
    expect(echoCallbackIsCurrent(second, second)).toBe(true);
  });

  it('rejects an old getRecentLife after blur or a newer request', () => {
    expect(shouldAcceptRecentLoad(1, 1, true)).toBe(true);
    expect(shouldAcceptRecentLoad(1, 2, true)).toBe(false);
    expect(shouldAcceptRecentLoad(1, 1, false)).toBe(false);
  });

  it('does not consume a pending id when Recent is loaded, then blurred into detail, then the app resumes', () => {
    const gate = createSaveEchoFocusGate();
    const first = beginRecentEchoFocus(gate);
    expect(acceptRecentEchoLoad(gate, first, ['moment_one'])).toBe(true);
    writeJustSavedMomentId('moment_one');
    endRecentEchoFocus(gate);
    expect(tryConsumeSaveEcho(gate, 'background')).toBeNull();
    expect(tryConsumeSaveEcho(gate, 'active')).toBeNull();
    expect(peekJustSavedMomentId()).toBe('moment_one');
    expect(shouldRevealFromGate(gate, peekJustSavedMomentId(), 'active')).toBe(false);
  });

  it('does not let an AppState active callback use the previous list while a new focus read is open', () => {
    const gate = createSaveEchoFocusGate();
    const first = beginRecentEchoFocus(gate);
    expect(acceptRecentEchoLoad(gate, first, ['moment_old'])).toBe(true);
    writeJustSavedMomentId('moment_old');
    const second = beginRecentEchoFocus(gate);
    expect(gate.loadReady).toBe(false);
    expect(gate.itemIds).toEqual([]);
    expect(tryConsumeSaveEcho(gate, 'active')).toBeNull();
    expect(peekJustSavedMomentId()).toBe('moment_old');
    expect(acceptRecentEchoLoad(gate, first, ['moment_old'])).toBe(false);
    expect(tryConsumeSaveEcho(gate, 'active')).toBeNull();
    expect(acceptRecentEchoLoad(gate, second, ['moment_old'])).toBe(true);
    expect(tryConsumeSaveEcho(gate, 'active')).toBe('moment_old');
  });

  it('consumes a pending id once after this focused load succeeds, and does not replay on a later load', () => {
    const gate = createSaveEchoFocusGate();
    const first = beginRecentEchoFocus(gate);
    writeJustSavedMomentId('moment_one');
    expect(acceptRecentEchoLoad(gate, first, ['moment_one'])).toBe(true);
    expect(tryConsumeSaveEcho(gate, 'active')).toBe('moment_one');
    expect(peekJustSavedMomentId()).toBeNull();
    expect(tryConsumeSaveEcho(gate, 'active')).toBeNull();

    const refresh = beginRecentEchoFocus(gate);
    expect(tryConsumeSaveEcho(gate, 'active')).toBeNull();
    expect(acceptRecentEchoLoad(gate, refresh, ['moment_one'])).toBe(true);
    expect(tryConsumeSaveEcho(gate, 'active')).toBeNull();

    endRecentEchoFocus(gate);
    const back = beginRecentEchoFocus(gate);
    expect(acceptRecentEchoLoad(gate, back, ['moment_one'])).toBe(true);
    expect(tryConsumeSaveEcho(gate, 'active')).toBeNull();
  });

  it('clears this loadReady when the focused read fails, and ignores a stale success', () => {
    const gate = createSaveEchoFocusGate();
    const first = beginRecentEchoFocus(gate);
    writeJustSavedMomentId('moment_one');
    expect(rejectRecentEchoLoad(gate, first)).toBe(true);
    expect(gate.loadReady).toBe(false);
    expect(tryConsumeSaveEcho(gate, 'active')).toBeNull();
    expect(peekJustSavedMomentId()).toBe('moment_one');

    const second = beginRecentEchoFocus(gate);
    expect(acceptRecentEchoLoad(gate, first, ['moment_one'])).toBe(false);
    expect(tryConsumeSaveEcho(gate, 'active')).toBeNull();
    expect(acceptRecentEchoLoad(gate, second, ['moment_one'])).toBe(true);
    expect(tryConsumeSaveEcho(gate, 'active')).toBe('moment_one');
  });
});
