import {
  cardListen,
  rememberClip,
  resetRecentClipMemoryForTests,
  resumeAtMs,
  stashOutgoing,
} from './recent-clip-memory';

describe('recent clip memory keeps each asset’s listen state', () => {
  beforeEach(() => {
    resetRecentClipMemoryForTests();
  });

  it('does not treat a paused clip as idle@0 after another asset becomes active', () => {
    stashOutgoing('asset_a', { status: 'paused', currentTimeMs: 1200 });
    const liveB = { status: 'playing' as const, currentTimeMs: 400 };

    expect(cardListen('asset_a', 'asset_b', liveB)).toEqual({ status: 'paused', currentTimeMs: 1200 });
    expect(cardListen('asset_b', 'asset_b', liveB)).toEqual(liveB);
    expect(cardListen('asset_a', 'asset_b', liveB).status).not.toBe('idle');
    expect(cardListen('asset_a', 'asset_b', liveB).currentTimeMs).not.toBe(0);
    expect(cardListen('asset_b', 'asset_b', liveB).currentTimeMs).not.toBe(1200);
  });

  it('resumes A from the stashed pause after B has used the shared player', () => {
    stashOutgoing('asset_a', { status: 'paused', currentTimeMs: 1200 });
    stashOutgoing('asset_b', { status: 'paused', currentTimeMs: 800 });

    expect(resumeAtMs('asset_a')).toBe(1200);
    expect(resumeAtMs('asset_b')).toBe(800);
    expect(resumeAtMs('asset_a')).not.toBe(resumeAtMs('asset_b'));
  });

  it('keeps a torn-down active clip at its remembered pause instead of idle@0', () => {
    rememberClip('asset_b', { status: 'paused', currentTimeMs: 900 });

    expect(cardListen('asset_b', 'asset_b', { status: 'idle', currentTimeMs: 0 })).toEqual({
      status: 'paused',
      currentTimeMs: 900,
    });
    expect(cardListen('asset_a', 'asset_b', { status: 'idle', currentTimeMs: 0 })).toEqual({
      status: 'idle',
      currentTimeMs: 0,
    });
  });

  it('does not resume a finished clip from the end, and keeps missing play retryable', () => {
    stashOutgoing('asset_a', { status: 'finished', currentTimeMs: 3500 });
    rememberClip('asset_b', { status: 'unavailable', currentTimeMs: 1100 });

    expect(resumeAtMs('asset_a')).toBe(0);
    expect(resumeAtMs('asset_b')).toBe(1100);
    expect(cardListen('asset_b', 'asset_b', { status: 'unavailable', currentTimeMs: 0 }).status).toBe(
      'unavailable',
    );
  });
});
