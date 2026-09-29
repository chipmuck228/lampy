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
};

export function familyAuthServiceReady(baseUrl?: string) {
  return isSafeFamilyApiBaseUrl(baseUrl);
}

export function snapshotAfterSignedIn(appleAvailable: boolean): AccountSnapshot {
  return {
    kind: 'signed-in',
    appleAvailable,
    sessionUnreachable: false,
    canSignIn: false,
    canSignOut: true,
  };
}

export function snapshotAfterLocalSignOut(appleAvailable: boolean, pendingRevoke: boolean): AccountSnapshot {
  return deriveAccountSnapshot({
    serviceReady: true,
    appleAvailable,
    hasSession: false,
    pendingRevoke,
    membership: { kind: 'unauthenticated' },
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
}): AccountSnapshot {
  const appleAvailable = input.appleAvailable;
  if (!input.serviceReady) {
    return {
      kind: 'service-unavailable',
      appleAvailable,
      sessionUnreachable: false,
      canSignIn: false,
      canSignOut: input.hasSession,
    };
  }
  if (input.pendingRevoke && !input.hasSession) {
    return {
      kind: 'local-out-revoke-pending',
      appleAvailable,
      sessionUnreachable: false,
      canSignIn: appleAvailable,
      canSignOut: false,
    };
  }
  const membership = input.membership;
  if (membership?.kind === 'unconfirmed' && membership.reason === 'unauthenticated') {
    return {
      kind: 'needs-reauth',
      appleAvailable,
      sessionUnreachable: false,
      canSignIn: appleAvailable,
      canSignOut: false,
    };
  }
  if (membership?.kind === 'unauthenticated' || membership == null) {
    return {
      kind: 'unsigned',
      appleAvailable,
      sessionUnreachable: false,
      canSignIn: appleAvailable,
      canSignOut: false,
    };
  }
  return {
    kind: 'signed-in',
    appleAvailable,
    sessionUnreachable: membership.kind === 'unconfirmed' && membership.reason === 'unreachable',
    canSignIn: false,
    canSignOut: true,
  };
}
