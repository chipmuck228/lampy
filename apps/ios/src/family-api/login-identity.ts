import { FamilyError, FAMILY_ERROR } from './errors';
import type { FamilyTx } from './repository';
import type { LoginIdentity, LoginProvider, Session } from './types';

export const LOGIN_PROVIDERS = ['apple', 'controlled-password', 'wechat', 'google', 'phone-otp', 'email-otp'] as const;
export const LEGACY_LOGIN_NAMESPACE = 'legacy';
export const RECENT_AUTH_MS = 5 * 60_000;

/** Namespace is configured by the server (issuer/app scope), never inferred from an email. */
export function loginNamespace(identity: Pick<LoginIdentity, 'namespace'>): string {
  return identity.namespace ?? LEGACY_LOGIN_NAMESPACE;
}
export function validLoginIdentity(identity: LoginIdentity): boolean {
  const namespace = loginNamespace(identity);
  return LOGIN_PROVIDERS.includes(identity.provider) && !!identity.subject.trim() && identity.subject.length <= 1024 &&
    !!namespace.trim() && namespace.length <= 256 && !/[\u0000-\u001f]/.test(namespace) &&
    (namespace !== LEGACY_LOGIN_NAMESPACE || identity.provider === 'apple' || identity.provider === 'controlled-password');
}
export function loginIdentityKey(identity: Pick<LoginIdentity, 'provider' | 'subject' | 'namespace'>): string {
  return JSON.stringify([identity.provider, loginNamespace(identity), identity.subject]);
}
export async function assertAccountActive(tx: FamilyTx, userId: string): Promise<void> {
  if (await tx.getAccountStatus(userId) !== 'active') {
    throw new FamilyError(FAMILY_ERROR.UNAUTHENTICATED, 'Account is unavailable.');
  }
}
export function sessionIsCurrent(session: Session | null, now: Date): session is Session {
  const expiry=Date.parse(session?.expiresAt??'');
  return !!session && Number.isFinite(expiry) && expiry>now.getTime();
}
export function assertRecentAuthentication(session: Session | null, now: Date): void {
  const authenticated = Date.parse(session?.authenticatedAt ?? '');
  const age = now.getTime() - authenticated;
  if (!sessionIsCurrent(session,now) || !Number.isFinite(authenticated) || age < 0 || age > RECENT_AUTH_MS || !session.authenticatedIdentity) {
    throw new FamilyError('REAUTHENTICATION_REQUIRED', 'Sign in again before changing login methods.');
  }
}

/** Credential verification happens in the provider adapter before calling this internal helper. */
export async function attachVerifiedLoginIdentity(tx: FamilyTx, token: string, identity: LoginIdentity, now: Date): Promise<void> {
  const session = await tx.findSession(token);
  if (!sessionIsCurrent(session,now) || session.userId !== identity.userId) {
    throw new FamilyError(FAMILY_ERROR.UNAUTHENTICATED, 'Session is missing or invalid.');
  }
  await assertAccountActive(tx, identity.userId);
  assertRecentAuthentication(session, now);
  // The authorizing credential must still be attached; an old session alone is not sufficient.
  if (!(await tx.listLoginIdentities(identity.userId)).some(i => loginIdentityKey(i) === session.authenticatedIdentity)) {
    throw new FamilyError('REAUTHENTICATION_REQUIRED', 'Sign in again before changing login methods.');
  }
  await tx.attachLoginIdentity({...identity,verifiedAt:now.toISOString()});
}

export type LoginMethodRef = { provider: LoginProvider; namespace?: string };
