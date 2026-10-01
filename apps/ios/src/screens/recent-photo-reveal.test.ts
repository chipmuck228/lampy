import {
  beginRecentPhotoReveal,
  createRecentPhotoRevealScroll,
  finishRecentPhotoReveal,
  nextPhotoRevealPhase,
  peekRecentPhotoRevealPhase,
  photoRevealMotion,
  photoRevealMotionKeys,
  photoRevealOverlapsViewport,
  resetRecentPhotoRevealForTests,
  RECENT_PHOTO_REVEAL_MS,
  RECENT_PHOTO_REVEAL_OPACITY,
  RECENT_PHOTO_REVEAL_SHIFT_Y,
} from './recent-photo-reveal';

describe('recent photo reveal', () => {
  beforeEach(() => {
    resetRecentPhotoRevealForTests();
  });

  it('walks not-seen → revealing → revealed once', () => {
    expect(peekRecentPhotoRevealPhase('photo_a')).toBe('not-seen');
    expect(nextPhotoRevealPhase('not-seen', 'enter-viewport')).toBe('revealing');
    expect(nextPhotoRevealPhase('revealing', 'finish')).toBe('revealed');

    expect(beginRecentPhotoReveal('photo_a', false)).toBe('revealing');
    expect(finishRecentPhotoReveal('photo_a')).toBe('revealed');
    expect(peekRecentPhotoRevealPhase('photo_a')).toBe('revealed');
  });

  it('does not replay after revealed', () => {
    beginRecentPhotoReveal('photo_a', false);
    finishRecentPhotoReveal('photo_a');
    expect(beginRecentPhotoReveal('photo_a', false)).toBe('revealed');
    expect(nextPhotoRevealPhase('revealed', 'enter-viewport')).toBe('revealed');
    expect(nextPhotoRevealPhase('revealed', 'finish')).toBe('revealed');
    expect(finishRecentPhotoReveal('photo_a')).toBe('revealed');
  });

  it('does not enter before the user starts reading, even if the photo is already on screen', () => {
    const enter = jest.fn();
    const viewport = createRecentPhotoRevealScroll(enter);
    viewport.register('photo_a', (report) => report({ y: 80, height: 220 }));
    viewport.onScroll(0, 800);
    expect(enter).not.toHaveBeenCalled();
    expect(peekRecentPhotoRevealPhase('photo_a')).toBe('not-seen');
    viewport.dispose();
  });

  it('enters the viewport once after a reading scroll', () => {
    const enter = jest.fn();
    const viewport = createRecentPhotoRevealScroll(enter);
    viewport.register('photo_a', (report) => report({ y: 80, height: 220 }));
    viewport.onScroll(0, 800);
    viewport.onScrollBeginDrag();
    expect(enter).toHaveBeenCalledTimes(1);
    expect(enter).toHaveBeenCalledWith('photo_a');
    viewport.onScroll(40, 800);
    viewport.onScroll(80, 800);
    expect(enter).toHaveBeenCalledTimes(1);
    viewport.dispose();
  });

  it('reveals two photos independently', () => {
    const enter = jest.fn();
    const viewport = createRecentPhotoRevealScroll(enter);
    let second = { y: 1400, height: 220 };
    viewport.register('photo_one', (report) => report({ y: 80, height: 220 }));
    viewport.register('photo_two', (report) => report(second));
    viewport.onScroll(0, 800);
    viewport.onScrollBeginDrag();
    expect(enter).toHaveBeenCalledTimes(1);
    expect(enter).toHaveBeenCalledWith('photo_one');
    expect(enter).not.toHaveBeenCalledWith('photo_two');

    second = { y: 120, height: 220 };
    viewport.onScroll(1320, 800);
    expect(enter).toHaveBeenCalledWith('photo_two');
    expect(enter).toHaveBeenCalledTimes(2);
    viewport.dispose();
  });

  it('jumps to revealed when Reduce Motion is on', () => {
    expect(peekRecentPhotoRevealPhase('photo_a', true)).toBe('revealed');
    expect(beginRecentPhotoReveal('photo_a', true)).toBe('revealed');
    expect(photoRevealMotion('not-seen', true)).toEqual({ opacity: 1, translateY: 0, duration: 0 });
    expect(photoRevealMotion('revealing', true)).toEqual({ opacity: 1, translateY: 0, duration: 0 });
    expect(nextPhotoRevealPhase('not-seen', 'reduce-motion')).toBe('revealed');
  });

  it('keeps revealed across a process-local remount, as after returning from detail', () => {
    beginRecentPhotoReveal('photo_a', false);
    finishRecentPhotoReveal('photo_a');
    expect(peekRecentPhotoRevealPhase('photo_a')).toBe('revealed');
    expect(beginRecentPhotoReveal('photo_a', false)).toBe('revealed');
    expect(photoRevealMotion(peekRecentPhotoRevealPhase('photo_a'), false)).toEqual({
      opacity: 1,
      translateY: 0,
      duration: 0,
    });
  });

  it('only changes opacity and translateY, so layout and scroll stay put', () => {
    const unseen = photoRevealMotion('not-seen', false);
    const shown = photoRevealMotion('revealed', false);
    expect(unseen).toEqual({
      opacity: RECENT_PHOTO_REVEAL_OPACITY,
      translateY: RECENT_PHOTO_REVEAL_SHIFT_Y,
      duration: 0,
    });
    expect(shown).toEqual({ opacity: 1, translateY: 0, duration: 0 });
    expect(photoRevealMotion('revealing', false)).toEqual({
      opacity: 1,
      translateY: 0,
      duration: RECENT_PHOTO_REVEAL_MS,
    });
    expect(RECENT_PHOTO_REVEAL_MS).toBeGreaterThanOrEqual(600);
    expect(RECENT_PHOTO_REVEAL_MS).toBeLessThanOrEqual(800);
    expect(photoRevealMotionKeys(unseen)).toEqual(['duration', 'opacity', 'translateY']);
    expect(photoRevealMotionKeys(shown)).toEqual(['duration', 'opacity', 'translateY']);

    const scrollY = 160;
    const viewport = createRecentPhotoRevealScroll(() => undefined);
    viewport.onScroll(scrollY, 800);
    expect(viewport.scrollY).toBe(scrollY);
    viewport.onScrollBeginDrag();
    expect(viewport.scrollY).toBe(scrollY);
    viewport.dispose();
  });

  it('treats a photo below the fold as unseen until it overlaps', () => {
    expect(photoRevealOverlapsViewport({ y: 1200, height: 200 }, { y: 0, height: 800 })).toBe(false);
    expect(photoRevealOverlapsViewport({ y: 80, height: 200 }, { y: 0, height: 800 })).toBe(true);
    expect(photoRevealOverlapsViewport({ y: 700, height: 200 }, { y: 0, height: 800 })).toBe(true);

    const enter = jest.fn();
    const viewport = createRecentPhotoRevealScroll(enter);
    viewport.register('photo_low', (report) => report({ y: 1200, height: 200 }));
    viewport.onScroll(0, 800);
    viewport.onScrollBeginDrag();
    expect(enter).not.toHaveBeenCalled();
    viewport.dispose();
  });
});
