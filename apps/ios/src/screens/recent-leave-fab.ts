export const RECENT_FAB_IDLE_MS = 800;
export const RECENT_FAB_TOP_SLOP = 8;
export const RECENT_FAB_DOWN_SLOP = 4;
export const RECENT_FAB_SHIFT_Y = 10;
export const RECENT_FAB_HIDE_MS = 220;
export const RECENT_FAB_SHOW_MS = 280;

export function recentFabIntent(offsetY: number, lastOffsetY: number): 'show' | 'hide' | 'idle' {
  if (offsetY <= RECENT_FAB_TOP_SLOP) return 'show';
  if (offsetY > lastOffsetY + RECENT_FAB_DOWN_SLOP) return 'hide';
  return 'idle';
}
