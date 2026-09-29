import type { FamilyMembershipView } from './family-use-cases';
import { isSafeFamilyApiBaseUrl } from '../infrastructure/family-config';

export type AccountKind =
  | 'service-unavailable'
  | 'unsigned'
  | 'signed-in'
  | 'needs-reauth'
  | 'local-out-revoke-pending';

export type AccountSnapshot = {
  kind: AccountKind;
  appleAvailable: boolean;
  sessionUnreachable: boolean;
  canSignIn: boolean;
  canSignOut: boolean;
  canSignInTestAccount: boolean;
  testAccountLoginEnabled: boolean;
  testAccountLoginReason: string;
};

export function familyAuthServiceReady(baseUrl?: string) {
  return isSafeFamilyApiBaseUrl(baseUrl);
}

export function snapshotAfterSignedIn(
  appleAvailable: boolean,
  testLogin: { enabled?: boolean; reason?: string } = {},
): AccountSnapshot {
  return {
    kind: 'signed-in',
    appleAvailable,
    sessionUnreachable: false,
    canSignIn: false,
    canSignOut: true,
    canSignInTestAccount: false,
    testAccountLoginEnabled: testLogin.enabled === true,
    testAccountLoginReason: testLogin.reason ?? 'disabled',
  };
}

export function snapshotAfterLocalSignOut(
  appleAvailable: boolean,
  pendingRevoke: boolean,
  testLogin: { enabled?: boolean; reason?: string } = {},
): AccountSnapshot {
  return deriveAccountSnapshot({
    serviceReady: true,
    appleAvailable,
    hasSession: false,
    pendingRevoke,
    membership: { kind: 'unauthenticated' },
    testAccountLoginEnabled: testLogin.enabled === true,
    testAccountLoginReason: testLogin.reason,
  });
}

export function accountRefreshFailureMessage(phase: 'sign-in' | 'sign-out' | 'sign-out-pending') {
  if (phase === 'sign-in') {
    return '已登录。现在读不到最新账户状态，可以再试。';
  }
  if (phase === 'sign-out-pending') {
    return '这台设备已经退出。远端会话还没确认撤销。现在读不到最新账户状态，可以再试。';
  }
  return '这台设备已经退出。现在读不到最新账户状态，可以再试。';
}

export function deriveAccountSnapshot(input: {
  serviceReady: boolean;
  appleAvailable: boolean;
  hasSession: boolean;
  pendingRevoke: boolean;
  membership?: FamilyMembershipView | null;
  testAccountLoginEnabled?: boolean;
  testAccountLoginReason?: string;
}): AccountSnapshot {
  const appleAvailable = input.appleAvailable;
  const testAccountLoginEnabled = input.testAccountLoginEnabled === true;
  const testAccountLoginReason = input.testAccountLoginReason ?? 'disabled';
  const canSignInTestAccount = testAccountLoginEnabled;
  if (!input.serviceReady) {
    return {
      kind: 'service-unavailable',
      appleAvailable,
      sessionUnreachable: false,
      canSignIn: false,
      canSignOut: input.hasSession,
      canSignInTestAccount: false,
      testAccountLoginEnabled: false,
      testAccountLoginReason: 'disabled',
    };
  }
  if (input.pendingRevoke && !input.hasSession) {
    return {
      kind: 'local-out-revoke-pending',
      appleAvailable,
      sessionUnreachable: false,
      canSignIn: appleAvailable || canSignInTestAccount,
      canSignOut: false,
      canSignInTestAccount,
      testAccountLoginEnabled,
      testAccountLoginReason,
    };
  }
  const membership = input.membership;
  if (membership?.kind === 'unconfirmed' && membership.reason === 'unauthenticated') {
    return {
      kind: 'needs-reauth',
      appleAvailable,
      sessionUnreachable: false,
      canSignIn: appleAvailable || canSignInTestAccount,
      canSignOut: false,
      canSignInTestAccount,
      testAccountLoginEnabled,
      testAccountLoginReason,
    };
  }
  if (membership?.kind === 'unauthenticated' || membership == null) {
    return {
      kind: 'unsigned',
      appleAvailable,
      sessionUnreachable: false,
      canSignIn: appleAvailable || canSignInTestAccount,
      canSignOut: false,
      canSignInTestAccount,
      testAccountLoginEnabled,
      testAccountLoginReason,
    };
  }
  return {
    kind: 'signed-in',
    appleAvailable,
    sessionUnreachable: membership.kind === 'unconfirmed' && membership.reason === 'unreachable',
    canSignIn: false,
    canSignOut: true,
    canSignInTestAccount: false,
    testAccountLoginEnabled,
    testAccountLoginReason,
  };
}
