import { FAMILY_ERROR, FamilyError } from './errors';
import { isPlausibleEmail, MAX_EMAIL_PASSWORD_LENGTH, normalizeEmail, passwordPolicyError } from './email-normalize';
import { ARGON2ID_PRODUCTION, createArgon2idPasswordHasher, type PasswordHasher } from './password';
import { FamilyStoreConstraintError, type FamilyRepository, type FamilyTx } from './repository';
import type { FamilyClock, FamilyIds, SignInResult, TestAccountHealth } from './types';

export const TEST_ACCOUNT_AUTH_FAILED_COPY = 'Login name or password is wrong.';
const RATE_LIMIT_COPY = 'Try again later.';
const CLOSED_COPY = 'Controlled test-account login is disabled.';

export const DEFAULT_TEST_ACCOUNT_LOGIN_LIMIT = { windowMs: 15 * 60 * 1000, max: 8 };

function randomId(prefix: string) {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return `${prefix}_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

function iso(date: Date) {
  return date.toISOString();
}

function requireLogin(raw: string) {
  const loginNormalized = normalizeEmail(raw);
  if (!isPlausibleEmail(loginNormalized)) {
    throw new FamilyError(FAMILY_ERROR.BAD_REQUEST, 'Enter a valid test-account login.');
  }
  return loginNormalized;
}

function requirePassword(password: string) {
  const error = passwordPolicyError(password);
  if (error) throw new FamilyError(FAMILY_ERROR.BAD_REQUEST, error);
}

function createHashGate() {
  let chain = Promise.resolve();
  return function withHashLock<T>(work: () => Promise<T>): Promise<T> {
    const run = chain.then(work, work);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

export async function incrementLoginRateLimit(
  repository: FamilyRepository,
  bucket: string,
  now: Date,
  limit: { windowMs: number; max: number },
) {
  const limited = await repository.withTransaction(async (tx) => {
    const row = await tx.findRateLimit(bucket);
    const started = row ? new Date(row.windowStartedAt).getTime() : 0;
    if (!row || now.getTime() - started >= limit.windowMs) {
      await tx.saveRateLimit({ bucket, windowStartedAt: iso(now), hitCount: 1 });
      return 1 > limit.max;
    }
    const next = row.hitCount + 1;
    await tx.saveRateLimit({ bucket: row.bucket, windowStartedAt: row.windowStartedAt, hitCount: next });
    return next > limit.max;
  });
  if (limited) {
    throw new FamilyError(FAMILY_ERROR.RATE_LIMITED, RATE_LIMIT_COPY);
  }
}

export async function assertTestAccountSessionAllowed(
  tx: FamilyTx,
  userId: string,
  enabled: boolean,
) {
  const credential = await tx.findTestCredentialByUserId(userId);
  if (!credential) return;
  if (!enabled || !credential.enabled) {
    await tx.deleteSessionsForUser(userId);
    throw new FamilyError(FAMILY_ERROR.UNAUTHENTICATED, 'Session is missing or invalid.');
  }
}

export function createTestAccountCommands(deps: {
  repository: FamilyRepository;
  clock: FamilyClock;
  ids: FamilyIds;
  sessionTtlMs: number;
  testAccountLoginEnabled?: boolean;
  passwordHasher?: PasswordHasher;
  loginLimit?: { windowMs: number; max: number };
}) {
  const enabled = deps.testAccountLoginEnabled === true;
  const hasher = deps.passwordHasher ?? createArgon2idPasswordHasher();
  const loginLimit = deps.loginLimit ?? DEFAULT_TEST_ACCOUNT_LOGIN_LIMIT;
  const withHashLock = createHashGate();
  let dummyHash: string | undefined;

  async function burnDummy(password: string) {
    dummyHash ??= await hasher.hash('lampy-dummy-not-a-user-password');
    await hasher.verify(password, dummyHash);
  }

  return {
    health(): TestAccountHealth & { argon2id: typeof ARGON2ID_PRODUCTION } {
      return {
        testAccountLogin: enabled,
        testAccountLoginReason: enabled ? 'enabled' : 'disabled',
        argon2id: ARGON2ID_PRODUCTION,
      };
    },

    async createTestAccount(login: string, password: string) {
      const loginNormalized = requireLogin(login);
      requirePassword(password);
      const passwordHash = await withHashLock(() => hasher.hash(password));
      const now = deps.clock.now();
      return deps.repository.withTransaction(async (tx) => {
        const existing = await tx.findTestCredentialByLogin(loginNormalized);
        if (existing) {
          throw new FamilyError(FAMILY_ERROR.TEST_ACCOUNT_EXISTS, 'This test-account login already exists.');
        }
        const account = { userId: deps.ids.userId(), createdAt: iso(now) };
        try {
          await tx.saveAccount(account);
          await tx.saveTestCredential({
            credentialId: randomId('tac'),
            loginNormalized,
            userId: account.userId,
            passwordHash,
            enabled: true,
            createdAt: iso(now),
          });
        } catch (error) {
          if (error instanceof FamilyStoreConstraintError) {
            throw new FamilyError(FAMILY_ERROR.TEST_ACCOUNT_EXISTS, 'This test-account login already exists.');
          }
          throw error;
        }
        return { userId: account.userId, created: true as const };
      });
    },

    async disableTestAccount(login: string) {
      const loginNormalized = requireLogin(login);
      return deps.repository.withTransaction(async (tx) => {
        const existing = await tx.findTestCredentialByLogin(loginNormalized);
        if (!existing) {
          throw new FamilyError(FAMILY_ERROR.TEST_ACCOUNT_NOT_FOUND, 'This test-account login was not found.');
        }
        existing.enabled = false;
        existing.disabledAt = iso(deps.clock.now());
        await tx.saveTestCredential(existing);
        await tx.deleteSessionsForUser(existing.userId);
        return { disabled: true as const, userId: existing.userId };
      });
    },

    async signInWithTestAccount(input: { login: string; password: string }): Promise<SignInResult> {
      if (!enabled) {
        throw new FamilyError(FAMILY_ERROR.TEST_ACCOUNT_LOGIN_CLOSED, CLOSED_COPY);
      }
      const loginNormalized = requireLogin(input.login);
      const now = deps.clock.now();
      await incrementLoginRateLimit(deps.repository, `test-login:${loginNormalized}`, now, loginLimit);
      const passwordOversized = input.password.length > MAX_EMAIL_PASSWORD_LENGTH;
      return deps.repository.withTransaction(async (tx) => {
        const credential = await tx.findTestCredentialByLogin(loginNormalized);
        const ok =
          credential && !passwordOversized
            ? await withHashLock(() => hasher.verify(input.password, credential.passwordHash))
            : await withHashLock(() => burnDummy(passwordOversized ? input.password.slice(0, MAX_EMAIL_PASSWORD_LENGTH) : input.password));
        if (!credential || !credential.enabled || !ok) {
          throw new FamilyError(FAMILY_ERROR.AUTH_FAILED, TEST_ACCOUNT_AUTH_FAILED_COPY);
        }
        const session = {
          token: deps.ids.sessionToken(),
          userId: credential.userId,
          expiresAt: iso(new Date(deps.clock.now().getTime() + deps.sessionTtlMs)),
        };
        await tx.saveSession(session);
        await tx.deleteOtherSessions(credential.userId, session.token);
        return {
          userId: credential.userId,
          sessionToken: session.token,
          expiresAt: session.expiresAt,
        };
      });
    },
  };
}

export type TestAccountCommands = ReturnType<typeof createTestAccountCommands>;
