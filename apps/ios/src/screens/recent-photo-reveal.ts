export type PhotoRevealPhase = 'not-seen' | 'revealing' | 'revealed';

export const RECENT_PHOTO_REVEAL_OPACITY = 0.85;
export const RECENT_PHOTO_REVEAL_SHIFT_Y = 8;
export const RECENT_PHOTO_REVEAL_MS = 720;

export type PhotoRevealMotion = {
  opacity: number;
  translateY: number;
  duration: number;
};

export type PhotoRevealBox = {
  y: number;
  height: number;
};

export type PhotoRevealMeasure = (report: (box: PhotoRevealBox) => void) => void;

const phases = new Map<string, PhotoRevealPhase>();
const listeners = new Map<string, Set<(phase: PhotoRevealPhase) => void>>();

export function resetRecentPhotoRevealForTests(): void {
  phases.clear();
  listeners.clear();
  recentPhotoRevealViewport.reset();
}

export function peekRecentPhotoRevealPhase(id: string, reduceMotion = false): PhotoRevealPhase {
  const stored = phases.get(id);
  if (stored) return stored;
  return reduceMotion ? 'revealed' : 'not-seen';
}

export function nextPhotoRevealPhase(
  phase: PhotoRevealPhase,
  event: 'enter-viewport' | 'finish' | 'reduce-motion',
): PhotoRevealPhase {
  if (event === 'reduce-motion') return 'revealed';
  if (phase === 'revealed') return 'revealed';
  if (event === 'enter-viewport') return phase === 'not-seen' ? 'revealing' : phase;
  return 'revealed';
}

export function beginRecentPhotoReveal(id: string, reduceMotion: boolean): PhotoRevealPhase {
  const next = nextPhotoRevealPhase(
    peekRecentPhotoRevealPhase(id, false),
    reduceMotion ? 'reduce-motion' : 'enter-viewport',
  );
  phases.set(id, next);
  emitRecentPhotoReveal(id, next);
  return next;
}

export function finishRecentPhotoReveal(id: string): PhotoRevealPhase {
  const next = nextPhotoRevealPhase(peekRecentPhotoRevealPhase(id, false), 'finish');
  phases.set(id, next);
  emitRecentPhotoReveal(id, next);
  return next;
}

export function subscribeRecentPhotoReveal(
  id: string,
  listener: (phase: PhotoRevealPhase) => void,
): () => void {
  const set = listeners.get(id) ?? new Set();
  set.add(listener);
  listeners.set(id, set);
  return () => {
    const current = listeners.get(id);
    current?.delete(listener);
    if (current && current.size === 0) listeners.delete(id);
  };
}

function emitRecentPhotoReveal(id: string, phase: PhotoRevealPhase): void {
  listeners.get(id)?.forEach((listener) => listener(phase));
}

export function photoRevealMotion(phase: PhotoRevealPhase, reduceMotion: boolean): PhotoRevealMotion {
  if (reduceMotion || phase === 'revealed') {
    return { opacity: 1, translateY: 0, duration: 0 };
  }
  if (phase === 'revealing') {
    return { opacity: 1, translateY: 0, duration: RECENT_PHOTO_REVEAL_MS };
  }
  return {
    opacity: RECENT_PHOTO_REVEAL_OPACITY,
    translateY: RECENT_PHOTO_REVEAL_SHIFT_Y,
    duration: 0,
  };
}

export function photoRevealMotionKeys(motion: PhotoRevealMotion): string[] {
  return Object.keys(motion).sort();
}

export function photoRevealOverlapsViewport(photo: PhotoRevealBox, viewport: PhotoRevealBox): boolean {
  if (photo.height <= 0 || viewport.height <= 0) return false;
  return photo.y < viewport.y + viewport.height && photo.y + photo.height > viewport.y;
}

export function createRecentPhotoRevealScroll(enter: (id: string) => void) {
  const measures = new Map<string, PhotoRevealMeasure>();
  const entered = new Set<string>();
  let scrollY = 0;
  let viewportHeight = 0;
  let reading = false;
  let alive = true;

  function probe() {
    if (!alive || !reading || viewportHeight <= 0) return;
    const viewport = { y: 0, height: viewportHeight };
    measures.forEach((measure, id) => {
      if (entered.has(id)) return;
      measure((box) => {
        if (!alive || !reading || entered.has(id)) return;
        if (!photoRevealOverlapsViewport(box, viewport)) return;
        entered.add(id);
        enter(id);
      });
    });
  }

  return {
    get scrollY() {
      return scrollY;
    },
    register(id: string, measure: PhotoRevealMeasure) {
      if (!alive) return;
      measures.set(id, measure);
      probe();
    },
    unregister(id: string) {
      measures.delete(id);
    },
    onScroll(offsetY: number, nextViewportHeight: number) {
      if (!alive) return;
      scrollY = offsetY;
      viewportHeight = nextViewportHeight;
      probe();
    },
    onScrollBeginDrag() {
      if (!alive) return;
      reading = true;
      probe();
    },
    dispose() {
      alive = false;
      measures.clear();
      entered.clear();
      reading = false;
    },
    reset() {
      measures.clear();
      entered.clear();
      scrollY = 0;
      viewportHeight = 0;
      reading = false;
      alive = true;
    },
  };
}

export const recentPhotoRevealViewport = createRecentPhotoRevealScroll((id) => {
  beginRecentPhotoReveal(id, false);
});
