import { recentFabIntent, RECENT_FAB_IDLE_MS } from './recent-leave-fab';

describe('recent leave fab scroll', () => {
  it('shows at the top, hides on a downward read, and waits after other motion', () => {
    expect(RECENT_FAB_IDLE_MS).toBe(800);
    expect(recentFabIntent(0, 24)).toBe('show');
    expect(recentFabIntent(6, 80)).toBe('show');
    expect(recentFabIntent(40, 20)).toBe('hide');
    expect(recentFabIntent(36, 40)).toBe('idle');
    expect(recentFabIntent(40, 40)).toBe('idle');
  });
});
