import { FAMILY_ERROR, FamilyError } from './errors';
import {
  isPlausibleEmail,
  normalizeEmail,
  passwordPolicyError,
} from './email-normalize';
import {
  createEmailTokenSecret,
  EMAIL_RESET_TTL_MS,
  EMAIL_VERIFY_TTL_MS,
  hashEmailTokenSecret,
} from './email-tokens';
import type { Mailer } from './mailer';
import { ARGON2ID_PRODUCTION, createArgon2idPasswordHasher, type PasswordHasher } from './password';
import { FamilyStoreConstraintError, type FamilyRepository, type FamilyTx } from './repository';
import type { MediaBlobStore } from './media-blobs';
import type {
  AccountDeleteBlockedReason,
  AccountDeleteResult,
  EmailAccepted,
  EmailAuthHealth,
  FamilyClock,
  FamilyIds,
  SignInResult,
} from './types';

export const EMAIL_ACCEPTED_COPY =
  'If this email can continue, we sent a message. Registering separately with Apple and email can create two Lampy accounts.';

const AUTH_FAILED_COPY = 'Email or password is wrong, or this email is not verified yet.';
const TOKEN_INVALID_COPY = 'This link cannot be used. Request a new one.';
const RATE_LIMIT_COPY = 'Try again later.';
const REGISTER_CLOSED_COPY =
  'Email register is closed. Account delete is not safe yet for family creators, live shares, or media ownership.';
const MAILER_COPY = 'Email sending is not configured. Real register cannot be accepted.';

const REGISTER_LIMIT = { windowMs: 60 * 60 * 1000, max: 5 };
const LOGIN_LIMIT = { windowMs: 15 * 60 * 1000, max: 8 };
const RESEND_LIMIT = { windowMs: 60 * 60 * 1000, max: 3 };
const FORGOT_LIMIT = { windowMs: 60 * 60 * 1000, max: 3 };

export type EmailAuthCommands = {
  health(): EmailAuthHealth & { argon2id: typeof ARGON2ID_PRODUCTION };
  registerWithEmail(input: { email: string; password: string; clientKey?: string }): Promise<EmailAccepted>;
  verifyEmail(input: { token: string }): Promise<{ verified: true }>;
  resendVerification(input: { email: string; clientKey?: string }): Promise<EmailAccepted>;
  signInWithEmail(input: { email: string; password: string; clientKey?: string }): Promise<SignInResult>;
  requestPasswordReset(input: { email: string; clientKey?: string }): Promise<EmailAccepted>;
  resetPassword(input: { token: string; password: string }): Promise<{ reset: true }>;
  deleteAccount(sessionToken: string): Promise<AccountDeleteResult>;
};

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

async function consumeRateLimit(
  tx: FamilyTx,
  bucket: string,
  windowMs: number,
  max: number,
  now: Date,
) {
  const row = await tx.findRateLimit(bucket);
  const started = row ? new Date(row.windowStartedAt).getTime() : 0;
  if (!row || now.getTime() - started >= windowMs) {
    await tx.saveRateLimit({ bucket, windowStartedAt: iso(now), hitCount: 1 });
    return;
  }
  const next = row.hitCount + 1;
  await tx.saveRateLimit({ bucket: row.bucket, windowStartedAt: row.windowStartedAt, hitCount: next });
  if (next > max) {
    throw new FamilyError(FAMILY_ERROR.RATE_LIMITED, RATE_LIMIT_COPY);
  }
}

function requireEnabled(enabled: boolean, mailer: Mailer | undefined) {
  if (!enabled) {
    throw new FamilyError(FAMILY_ERROR.EMAIL_REGISTER_CLOSED, REGISTER_CLOSED_COPY);
  }
  if (!mailer) {
    throw new FamilyError(FAMILY_ERROR.EMAIL_MAILER_UNAVAILABLE, MAILER_COPY);
  }
}

function requireEmail(raw: string) {
  const emailNormalized = normalizeEmail(raw);
  if (!isPlausibleEmail(emailNormalized)) {
    throw new FamilyError(FAMILY_ERROR.BAD_REQUEST, 'Enter a valid email address.');
  }
  return emailNormalized;
}

function requirePassword(password: string) {
  const error = passwordPolicyError(password);
  if (error) throw new FamilyError(FAMILY_ERROR.BAD_REQUEST, error);
}

function issueSession(
  ids: FamilyIds,
  clock: FamilyClock,
  sessionTtlMs: number,
  userId: string,
): { token: string; userId: string; expiresAt: string } {
  return {
    token: ids.sessionToken(),
    userId,
    expiresAt: iso(new Date(clock.now().getTime() + sessionTtlMs)),
  };
}

export function createEmailAuthCommands(deps: {
  repository: FamilyRepository;
  clock: FamilyClock;
  ids: FamilyIds;
  sessionTtlMs: number;
  blobs: MediaBlobStore;
  mailer?: Mailer;
  emailRegisterEnabled?: boolean;
  emailRegisterReason?: EmailAuthHealth['emailRegisterReason'];
  passwordHasher?: PasswordHasher;
}): EmailAuthCommands {
  const enabled = deps.emailRegisterEnabled === true;
  const reason = deps.emailRegisterReason ?? (enabled ? 'enabled' : 'account-delete-incomplete');
  const hasher = deps.passwordHasher ?? createArgon2idPasswordHasher();
  let dummyHash: string | undefined;

  async function burnDummy(password: string) {
    dummyHash ??= await hasher.hash('lampy-dummy-not-a-user-password');
    await hasher.verify(password, dummyHash);
  }

  async function writeToken(
    tx: FamilyTx,
    userId: string,
    purpose: 'verify' | 'reset',
    ttlMs: number,
  ) {
    await tx.deleteEmailTokensForUser(userId, purpose);
    const secret = createEmailTokenSecret();
    const now = deps.clock.now();
    await tx.saveEmailToken({
      tokenId: randomId('emt'),
      userId,
      purpose,
      tokenHash: hashEmailTokenSecret(secret),
      expiresAt: iso(new Date(now.getTime() + ttlMs)),
      createdAt: iso(now),
    });
    return secret;
  }

  async function sendVerify(email: string, secret: string) {
    await deps.mailer?.send({
      to: email,
      subject: 'Verify your Lampy email',
      text: `Use this one-time code to verify your Lampy email:\n\n${secret}\n\nIt expires in 24 hours. Registering with Apple and email separately can create two Lampy accounts.`,
    });
  }

  async function sendReset(email: string, secret: string) {
    await deps.mailer?.send({
      to: email,
      subject: 'Reset your Lampy password',
      text: `Use this one-time code to reset your Lampy password:\n\n${secret}\n\nIt expires in 1 hour. This will sign out other sessions.`,
    });
  }

  return {
    health() {
      return {
        emailRegister: enabled,
        emailRegisterReason: enabled ? 'enabled' : reason,
        argon2id: ARGON2ID_PRODUCTION,
      };
    },

    async registerWithEmail(input) {
      requireEnabled(enabled, deps.mailer);
      const emailNormalized = requireEmail(input.email);
      requirePassword(input.password);
      const passwordHash = await hasher.hash(input.password);
      const now = deps.clock.now();
      let secret: string | null = null;
      let sendTo: string | null = null;
      try {
        await deps.repository.withTransaction(async (tx) => {
          await consumeRateLimit(
            tx,
            `register:${emailNormalized}`,
            REGISTER_LIMIT.windowMs,
            REGISTER_LIMIT.max,
            now,
          );
          const existing = await tx.findEmailCredentialByEmail(emailNormalized);
          if (existing) {
            if (!existing.emailVerifiedAt) {
              secret = await writeToken(tx, existing.userId, 'verify', EMAIL_VERIFY_TTL_MS);
              sendTo = emailNormalized;
            }
            return;
          }
          const account = {
            userId: deps.ids.userId(),
            createdAt: iso(now),
          };
          await tx.saveAccount(account);
          await tx.saveEmailCredential({
            credentialId: randomId('emc'),
            userId: account.userId,
            emailNormalized,
            passwordHash,
            createdAt: iso(now),
          });
          secret = await writeToken(tx, account.userId, 'verify', EMAIL_VERIFY_TTL_MS);
          sendTo = emailNormalized;
        });
      } catch (error) {
        if (error instanceof FamilyError && error.code === FAMILY_ERROR.RATE_LIMITED) throw error;
        if (error instanceof FamilyStoreConstraintError && error.constraint === 'email_normalized') {
          return { accepted: true as const };
        }
        throw error;
      }
      if (secret && sendTo) {
        try {
          await sendVerify(sendTo, secret);
        } catch {
          /* accepted; user can resend */
        }
      }
      return { accepted: true as const };
    },

    async verifyEmail(input) {
      requireEnabled(enabled, deps.mailer);
      const tokenHash = hashEmailTokenSecret((input.token || '').trim());
      await deps.repository.withTransaction(async (tx) => {
        const token = await tx.findEmailTokenByHash(tokenHash);
        if (!token || token.purpose !== 'verify' || token.consumedAt) {
          throw new FamilyError(FAMILY_ERROR.TOKEN_INVALID, TOKEN_INVALID_COPY);
        }
        if (new Date(token.expiresAt).getTime() <= deps.clock.now().getTime()) {
          throw new FamilyError(FAMILY_ERROR.TOKEN_INVALID, TOKEN_INVALID_COPY);
        }
        const credential = await tx.findEmailCredentialByUserId(token.userId);
        if (!credential) {
          throw new FamilyError(FAMILY_ERROR.TOKEN_INVALID, TOKEN_INVALID_COPY);
        }
        token.consumedAt = iso(deps.clock.now());
        await tx.saveEmailToken(token);
        credential.emailVerifiedAt = iso(deps.clock.now());
        await tx.saveEmailCredential(credential);
      });
      return { verified: true as const };
    },

    async resendVerification(input) {
      requireEnabled(enabled, deps.mailer);
      const emailNormalized = requireEmail(input.email);
      const now = deps.clock.now();
      let secret: string | null = null;
      await deps.repository.withTransaction(async (tx) => {
        await consumeRateLimit(tx, `resend:${emailNormalized}`, RESEND_LIMIT.windowMs, RESEND_LIMIT.max, now);
        const existing = await tx.findEmailCredentialByEmail(emailNormalized);
        if (!existing || existing.emailVerifiedAt) return;
        secret = await writeToken(tx, existing.userId, 'verify', EMAIL_VERIFY_TTL_MS);
      });
      if (secret) {
        try {
          await sendVerify(emailNormalized, secret);
        } catch {
          /* accepted */
        }
      }
      return { accepted: true as const };
    },

    async signInWithEmail(input) {
      requireEnabled(enabled, deps.mailer);
      const emailNormalized = requireEmail(input.email);
      const now = deps.clock.now();
      return deps.repository.withTransaction(async (tx) => {
        await consumeRateLimit(tx, `login:${emailNormalized}`, LOGIN_LIMIT.windowMs, LOGIN_LIMIT.max, now);
        const credential = await tx.findEmailCredentialByEmail(emailNormalized);
        if (!credential) {
          await burnDummy(input.password);
          throw new FamilyError(FAMILY_ERROR.AUTH_FAILED, AUTH_FAILED_COPY);
        }
        const ok = await hasher.verify(input.password, credential.passwordHash);
        if (!ok || !credential.emailVerifiedAt) {
          throw new FamilyError(FAMILY_ERROR.AUTH_FAILED, AUTH_FAILED_COPY);
        }
        const session = issueSession(deps.ids, deps.clock, deps.sessionTtlMs, credential.userId);
        await tx.saveSession(session);
        await tx.deleteOtherSessions(credential.userId, session.token);
        return {
          userId: credential.userId,
          sessionToken: session.token,
          expiresAt: session.expiresAt,
        };
      });
    },

    async requestPasswordReset(input) {
      requireEnabled(enabled, deps.mailer);
      const emailNormalized = requireEmail(input.email);
      const now = deps.clock.now();
      let secret: string | null = null;
      await deps.repository.withTransaction(async (tx) => {
        await consumeRateLimit(tx, `forgot:${emailNormalized}`, FORGOT_LIMIT.windowMs, FORGOT_LIMIT.max, now);
        const existing = await tx.findEmailCredentialByEmail(emailNormalized);
        if (!existing?.emailVerifiedAt) return;
        secret = await writeToken(tx, existing.userId, 'reset', EMAIL_RESET_TTL_MS);
      });
      if (secret) {
        try {
          await sendReset(emailNormalized, secret);
        } catch {
          /* accepted */
        }
      }
      return { accepted: true as const };
    },

    async resetPassword(input) {
      requireEnabled(enabled, deps.mailer);
      requirePassword(input.password);
      const tokenHash = hashEmailTokenSecret((input.token || '').trim());
      const passwordHash = await hasher.hash(input.password);
      await deps.repository.withTransaction(async (tx) => {
        const token = await tx.findEmailTokenByHash(tokenHash);
        if (!token || token.purpose !== 'reset' || token.consumedAt) {
          throw new FamilyError(FAMILY_ERROR.TOKEN_INVALID, TOKEN_INVALID_COPY);
        }
        if (new Date(token.expiresAt).getTime() <= deps.clock.now().getTime()) {
          throw new FamilyError(FAMILY_ERROR.TOKEN_INVALID, TOKEN_INVALID_COPY);
        }
        const credential = await tx.findEmailCredentialByUserId(token.userId);
        if (!credential) {
          throw new FamilyError(FAMILY_ERROR.TOKEN_INVALID, TOKEN_INVALID_COPY);
        }
        token.consumedAt = iso(deps.clock.now());
        await tx.saveEmailToken(token);
        credential.passwordHash = passwordHash;
        await tx.saveEmailCredential(credential);
        await tx.deleteSessionsForUser(credential.userId);
      });
      return { reset: true as const };
    },

    async deleteAccount(sessionToken) {
      if (!sessionToken) {
        throw new FamilyError(FAMILY_ERROR.UNAUTHENTICATED, 'Sign in is required.');
      }
      const removedKeys: string[] = [];
      await deps.repository.withTransaction(async (tx) => {
        const session = await tx.findSession(sessionToken);
        if (!session || new Date(session.expiresAt).getTime() <= deps.clock.now().getTime()) {
          throw new FamilyError(FAMILY_ERROR.UNAUTHENTICATED, 'Session is missing or invalid.');
        }
        const userId = session.userId;
        const membership = await tx.findActiveMembershipForUser(userId);
        if (membership?.role === 'creator') {
          throw new FamilyError(
            FAMILY_ERROR.ACCOUNT_DELETE_BLOCKED,
            'This account still creates a family. Dissolve or transfer that family first.',
          );
        }
        if (membership) {
          throw new FamilyError(
            FAMILY_ERROR.ACCOUNT_DELETE_BLOCKED,
            'This account still belongs to a family. Leave the family first.',
          );
        }
        const shares = await tx.listSharesByAuthor(userId);
        for (const share of shares) {
          const family = await tx.findFamily(share.familyId);
          if (family?.status === 'active') {
            const reasonCode: AccountDeleteBlockedReason = 'active-shares';
            throw new FamilyError(
              FAMILY_ERROR.ACCOUNT_DELETE_BLOCKED,
              `This account still authored family shares (${reasonCode}). Revoke them or dissolve the family first.`,
            );
          }
        }
        const media = await tx.listMediaByOwner(userId);
        for (const object of media) {
          removedKeys.push(object.storageKey);
          await tx.deleteMediaObject(object.objectId);
        }
        await tx.deleteSessionsForUser(userId);
        await tx.deleteEmailTokensForUser(userId);
        await tx.deleteEmailCredential(userId);
        await tx.deleteIdempotentForUser(userId);
        await tx.deleteAccount(userId);
      });
      for (const key of removedKeys) {
        try {
          await deps.blobs.remove(key);
        } catch {
          /* blobs are best-effort after the account row is gone */
        }
      }
      return { deleted: true as const };
    },
  };
}

export function publicEmailAccepted(): EmailAccepted {
  return { accepted: true };
}
