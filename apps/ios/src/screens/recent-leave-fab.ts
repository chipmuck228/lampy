export const RECENT_FAB_IDLE_MS = 800;
export const RECENT_FAB_TOP_SLOP = 8;
export const RECENT_FAB_DOWN_SLOP = 12;
export const RECENT_FAB_UP_SLOP = 8;
export const RECENT_FAB_SHIFT_Y = 10;
export const RECENT_FAB_HIDE_MS = 380;
export const RECENT_FAB_SHOW_MS = 640;

export function recentFabIntent(offsetY: number, lastOffsetY: number): 'show' | 'hide' | 'idle' {
  if (offsetY <= RECENT_FAB_TOP_SLOP) return 'show';
  const delta = offsetY - lastOffsetY;
  if (delta > RECENT_FAB_DOWN_SLOP) return 'hide';
  if (delta < -RECENT_FAB_UP_SLOP) return 'show';
  return 'idle';
}

export function recentFabMotion(
  visible: boolean,
  reduceMotion: boolean,
): { opacity: number; translateY: number; duration: number } {
  return {
    opacity: visible ? 1 : 0,
    translateY: visible ? 0 : RECENT_FAB_SHIFT_Y,
    duration: reduceMotion ? 0 : visible ? RECENT_FAB_SHOW_MS : RECENT_FAB_HIDE_MS,
  };
}

export function createRecentLeaveFabScroll(reveal: (visible: boolean) => void) {
  let lastY = 0;
  let idle: ReturnType<typeof setTimeout> | null = null;
  let alive = true;

  function clearIdle() {
    if (!idle) return;
    clearTimeout(idle);
    idle = null;
  }

  function onScroll(offsetY: number) {
    if (!alive) return;
    const intent = recentFabIntent(offsetY, lastY);
    lastY = offsetY;
    clearIdle();
    if (intent === 'show') {
      reveal(true);
      return;
    }
    if (intent === 'hide') reveal(false);
    idle = setTimeout(() => {
      idle = null;
      if (alive) reveal(true);
    }, RECENT_FAB_IDLE_MS);
  }

  function dispose() {
    alive = false;
    clearIdle();
  }

  return { onScroll, dispose };
}
