import { recentFabIntent, RECENT_FAB_IDLE_MS, RECENT_FAB_SHOW_MS } from './recent-leave-fab';

describe('recent leave fab scroll', () => {
  it('shows at the top, hides on any scroll, and waits after still motion', () => {
    expect(RECENT_FAB_IDLE_MS).toBe(800);
    expect(RECENT_FAB_SHOW_MS).toBe(640);
    expect(recentFabIntent(0, 24)).toBe('show');
    expect(recentFabIntent(6, 80)).toBe('show');
    expect(recentFabIntent(40, 20)).toBe('hide');
    expect(recentFabIntent(20, 40)).toBe('hide');
    expect(recentFabIntent(36, 40)).toBe('idle');
    expect(recentFabIntent(40, 40)).toBe('idle');
  });
});
