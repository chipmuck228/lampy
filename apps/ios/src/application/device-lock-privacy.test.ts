import {
  decideUnlockResult,
  recordLockTrace,
  shouldBlockPrivateSnapshot,
  shouldConcealOnInactive,
  shouldShowDeviceLockCover,
  shouldStartUnlockOnActive,
  type DeviceLockTrace,
} from './device-lock-privacy';

describe('device lock privacy event order', () => {
  it('covers on inactive before background so the switcher never sees an unlocked session', () => {
    expect(
      shouldShowDeviceLockCover({
        locked: false,
        setting: 'on',
        appState: 'inactive',
        unlockInFlight: false,
      }),
    ).toBe(true);
    expect(
      shouldConcealOnInactive({
        setting: 'on',
        settingsInFlight: false,
      }),
    ).toBe(true);
    expect(
      shouldBlockPrivateSnapshot({
        cover: true,
        setting: 'on',
        appState: 'inactive',
      }),
    ).toBe(true);
  });

  it('does not conceal during settings auth, and does not treat settings success as unlock', () => {
    expect(
      shouldConcealOnInactive({
        setting: 'on',
        settingsInFlight: true,
      }),
    ).toBe(false);
    expect(
      shouldStartUnlockOnActive({
        setting: 'on',
        locked: true,
        unlockInFlight: false,
        needsManualRetry: false,
        settingsInFlight: true,
        hasHeldSuccess: false,
      }),
    ).toBe(false);
  });

  it('records the return-to-foreground order: cover first, hold Face ID success, uncover only when active', () => {
    const events: DeviceLockTrace[] = [];
    recordLockTrace(events, {
      event: 'app-state',
      appState: 'inactive',
      generation: 1,
      settingsGeneration: 0,
      locked: true,
      cover: true,
      snapshotBlocked: true,
    });
    recordLockTrace(events, {
      event: 'app-state',
      appState: 'background',
      generation: 2,
      settingsGeneration: 0,
      locked: true,
      cover: true,
      snapshotBlocked: true,
    });
    recordLockTrace(events, {
      event: 'app-state',
      appState: 'inactive',
      generation: 2,
      settingsGeneration: 0,
      locked: true,
      cover: true,
      snapshotBlocked: true,
    });
    recordLockTrace(events, {
      event: 'app-state',
      appState: 'active',
      generation: 2,
      settingsGeneration: 0,
      locked: true,
      cover: true,
      snapshotBlocked: true,
    });
    recordLockTrace(events, {
      event: 'auth-start',
      appState: 'active',
      generation: 3,
      settingsGeneration: 0,
      locked: true,
      cover: true,
      snapshotBlocked: true,
    });
    recordLockTrace(events, {
      event: 'app-state',
      appState: 'inactive',
      generation: 3,
      settingsGeneration: 0,
      locked: true,
      cover: true,
      snapshotBlocked: true,
    });
    expect(
      decideUnlockResult({
        appState: 'inactive',
        generation: 3,
        currentGeneration: 3,
      }),
    ).toBe('hold');
    recordLockTrace(events, {
      event: 'auth-end',
      appState: 'inactive',
      generation: 3,
      settingsGeneration: 0,
      locked: true,
      cover: true,
      snapshotBlocked: true,
      result: 'held-until-active',
    });
    expect(
      shouldShowDeviceLockCover({
        locked: true,
        setting: 'on',
        appState: 'inactive',
        unlockInFlight: false,
      }),
    ).toBe(true);
    recordLockTrace(events, {
      event: 'auth-end',
      appState: 'active',
      generation: 3,
      settingsGeneration: 0,
      locked: false,
      cover: false,
      snapshotBlocked: false,
      result: 'unlocked',
    });

    expect(events.map((item) => `${item.event}:${item.appState}:${item.cover ? 'cover' : 'open'}`)).toEqual([
      'app-state:inactive:cover',
      'app-state:background:cover',
      'app-state:inactive:cover',
      'app-state:active:cover',
      'auth-start:active:cover',
      'app-state:inactive:cover',
      'auth-end:inactive:cover',
      'auth-end:active:open',
    ]);
    expect(events.every((item) => item.cover || item.result === 'unlocked')).toBe(true);
    expect(events.some((item) => /token|password|secret|note/i.test(JSON.stringify(item)))).toBe(false);
  });

  it('ignores a late background success and a stale generation', () => {
    expect(
      decideUnlockResult({
        appState: 'background',
        generation: 4,
        currentGeneration: 4,
      }),
    ).toBe('ignore-background');
    expect(
      decideUnlockResult({
        appState: 'active',
        generation: 4,
        currentGeneration: 5,
      }),
    ).toBe('stale');
  });
});
