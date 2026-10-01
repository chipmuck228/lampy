import {
  consumeJustSavedMomentId,
  echoCallbackIsCurrent,
  isRecentForeground,
  nextEchoSeq,
  peekJustSavedMomentId,
  resetJustSavedMomentIdForTests,
  shouldRevealSaveEcho,
  shouldSkipSaveEchoFade,
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

  it('reveals only after a successful load, a visible item, and a foreground page', () => {
    expect(
      shouldRevealSaveEcho({
        momentId: 'moment_one',
        itemIds: ['moment_one'],
        loadReady: true,
        foreground: true,
      }),
    ).toBe(true);
    expect(
      shouldRevealSaveEcho({
        momentId: 'moment_one',
        itemIds: ['moment_one'],
        loadReady: false,
        foreground: true,
      }),
    ).toBe(false);
    expect(
      shouldRevealSaveEcho({
        momentId: 'moment_one',
        itemIds: ['moment_other'],
        loadReady: true,
        foreground: true,
      }),
    ).toBe(false);
    expect(
      shouldRevealSaveEcho({
        momentId: 'moment_one',
        itemIds: ['moment_one'],
        loadReady: true,
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

  it('does not reveal a consumed id again after a later load', () => {
    writeJustSavedMomentId('moment_one');
    expect(
      shouldRevealSaveEcho({
        momentId: peekJustSavedMomentId(),
        itemIds: ['moment_one'],
        loadReady: true,
        foreground: true,
      }),
    ).toBe(true);
    consumeJustSavedMomentId();
    expect(
      shouldRevealSaveEcho({
        momentId: peekJustSavedMomentId(),
        itemIds: ['moment_one'],
        loadReady: true,
        foreground: true,
      }),
    ).toBe(false);
  });
});
