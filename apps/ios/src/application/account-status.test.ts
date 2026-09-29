import {
  accountRefreshFailureMessage,
  deriveAccountSnapshot,
  familyAuthServiceReady,
  snapshotAfterLocalSignOut,
  snapshotAfterSignedIn,
} from './account-status';

describe('account status', () => {
  const previous = process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL;

  afterEach(() => {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL;
    else process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL = previous;
  });

  it('does not treat a missing family API URL as a working login service', () => {
    delete process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL;
    expect(familyAuthServiceReady()).toBe(false);
    expect(
      deriveAccountSnapshot({
        serviceReady: false,
        appleAvailable: true,
        hasSession: false,
        pendingRevoke: false,
      }),
    ).toMatchObject({
      kind: 'service-unavailable',
      canSignIn: false,
      canSignOut: false,
    });
  });

  it('lets leftover local session be signed out even when the API is missing', () => {
    expect(
      deriveAccountSnapshot({
        serviceReady: false,
        appleAvailable: true,
        hasSession: true,
        pendingRevoke: false,
      }).canSignOut,
    ).toBe(true);
  });

  it('maps 401 membership to needs-reauth instead of a signed-in family', () => {
    expect(
      deriveAccountSnapshot({
        serviceReady: true,
        appleAvailable: true,
        hasSession: false,
        pendingRevoke: false,
        membership: { kind: 'unconfirmed', reason: 'unauthenticated' },
      }),
    ).toMatchObject({ kind: 'needs-reauth', canSignIn: true, canSignOut: false });
  });

  it('keeps a signed-in but unreachable session from looking unsigned', () => {
    expect(
      deriveAccountSnapshot({
        serviceReady: true,
        appleAvailable: true,
        hasSession: true,
        pendingRevoke: false,
        membership: { kind: 'unconfirmed', reason: 'unreachable' },
      }),
    ).toMatchObject({ kind: 'signed-in', sessionUnreachable: true, canSignOut: true });
  });

  it('records local sign-out while remote revoke is still pending', () => {
    expect(
      deriveAccountSnapshot({
        serviceReady: true,
        appleAvailable: true,
        hasSession: false,
        pendingRevoke: true,
        membership: { kind: 'unauthenticated' },
      }),
    ).toMatchObject({ kind: 'local-out-revoke-pending', canSignIn: true });
  });

  it('keeps a committed sign-in or local sign-out even before membership refresh', () => {
    expect(snapshotAfterSignedIn(true)).toMatchObject({
      kind: 'signed-in',
      canSignOut: true,
      canSignIn: false,
      sessionUnreachable: false,
    });
    expect(snapshotAfterLocalSignOut(true, false)).toMatchObject({
      kind: 'unsigned',
      canSignIn: true,
      canSignOut: false,
    });
    expect(snapshotAfterLocalSignOut(true, true)).toMatchObject({
      kind: 'local-out-revoke-pending',
      canSignIn: true,
    });
    expect(accountRefreshFailureMessage('sign-in')).toBe('已登录。现在读不到最新账户状态，可以再试。');
    expect(accountRefreshFailureMessage('sign-out')).toBe('这台设备已经退出。现在读不到最新账户状态，可以再试。');
    expect(accountRefreshFailureMessage('sign-out-pending')).toBe(
      '这台设备已经退出。远端会话还没确认撤销。现在读不到最新账户状态，可以再试。',
    );
  });

  it('does not invent family members from a ready membership on the account page', () => {
    const snapshot = deriveAccountSnapshot({
      serviceReady: true,
      appleAvailable: true,
      hasSession: true,
      pendingRevoke: false,
      membership: {
        kind: 'ready',
        familyId: 'fam_1',
        role: 'creator',
        members: [{ userId: 'usr_a', role: 'creator', joinedAt: '2026-09-29T00:00:00.000Z' }],
      },
    });
    expect(snapshot.kind).toBe('signed-in');
    expect(snapshot).not.toHaveProperty('members');
  });
});
