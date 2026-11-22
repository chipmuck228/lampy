import { FamilyError, FAMILY_ERROR } from './errors';
import { assertRecentAuthentication, loginIdentityKey, loginNamespace, type LoginMethodRef } from './login-identity';
import type { FamilyRepository, FamilyTx } from './repository';
import type { FamilyClock, LoginIdentity } from './types';

/** Stage A only permits existing channels; storage support never enables a provider. */
export function createLoginManagement(deps: {
  repository: FamilyRepository;
  clock: FamilyClock;
  enabled: boolean;
  appleEnabled: boolean;
  passwordEnabled: boolean;
  requireUser: (tx: FamilyTx, token?: string) => Promise<string>;
}) {
  function open() {
    if (!deps.enabled) throw new FamilyError(FAMILY_ERROR.FORBIDDEN, 'Login management is not enabled.');
  }
  async function usable(tx: FamilyTx, identity: LoginIdentity): Promise<boolean> {
    if (loginNamespace(identity) !== 'legacy') return false;
    if (identity.provider === 'apple') return deps.appleEnabled;
    if (identity.provider === 'controlled-password' && deps.passwordEnabled) {
      const credential = await tx.findTestCredentialByUserId(identity.userId);
      return !!credential?.enabled && credential.loginNormalized === identity.subject;
    }
    return false;
  }
  return {
    async list(token: string) {
      open();
      return deps.repository.withTransaction(async tx => {
        const userId = await deps.requireUser(tx, token);
        return Promise.all((await tx.listLoginIdentities(userId)).map(async identity => ({
          provider: identity.provider, namespace: loginNamespace(identity), available: await usable(tx, identity),
        })));
      });
    },
    async unlink(token: string, ref: LoginMethodRef): Promise<{ unlinked: true }> {
      open();
      return deps.repository.withTransaction(async tx => {
        const userId = await deps.requireUser(tx, token);
        const session = await tx.findSession(token);
        assertRecentAuthentication(session, deps.clock.now());
        const identities = await tx.listLoginIdentities(userId);
        const target = identities.find(i => i.provider === ref.provider && loginNamespace(i) === (ref.namespace ?? 'legacy'));
        if (!target) throw new FamilyError(FAMILY_ERROR.BAD_REQUEST, 'Login method is not linked.');
        const remaining = identities.filter(i => loginIdentityKey(i) !== loginIdentityKey(target));
        const usableRemaining: LoginIdentity[] = [];
        for (const identity of remaining) if (await usable(tx, identity)) usableRemaining.push(identity);
        if (!usableRemaining.length) throw new FamilyError('LAST_LOGIN_METHOD', 'Keep at least one available login method.');
        if (!usableRemaining.some(i => loginIdentityKey(i) === session?.authenticatedIdentity)) {
          throw new FamilyError('REAUTHENTICATION_REQUIRED', 'Sign in using a login method you will keep.');
        }
        // Legacy password records are still used by the old login route; remove both representations.
        if (target.provider === 'controlled-password' && loginNamespace(target) === 'legacy') await tx.removeTestCredential(userId);
        await tx.removeLoginIdentity(target);
        await tx.deleteOtherSessions(userId, token);
        return { unlinked: true };
      });
    },
  };
}
