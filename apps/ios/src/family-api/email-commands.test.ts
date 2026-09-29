import { createMapAppleVerifier } from './apple';
import { createFamilyCommands } from './commands';
import { FAMILY_ERROR } from './errors';
import { createMemoryMailer } from './mailer';
import { ARGON2ID_PRODUCTION, ARGON2ID_TEST, createArgon2idPasswordHasher } from './password';
import { createFamilyStore } from './store';
import { applyFamilyApiSchema } from './schema';
import { openFamilySqliteDatabase } from './node-db';
import { createSqliteFamilyRepository } from './sqlite-repository';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FamilyIds } from './types';

function idsWith(seq: { n: number }): FamilyIds {
  const next = (prefix: string) => {
    seq.n += 1;
    return `${prefix}_${seq.n}`;
  };
  return {
    userId: () => next('usr'),
    familyId: () => next('fam'),
    membershipId: () => next('mem'),
    invitationId: () => next('inv'),
    invitationCode: () => next('code'),
    sessionToken: () => next('ses'),
  };
}

function setup(nowIso = '2026-09-29T08:00:00.000Z') {
  const seq = { n: 0 };
  const store = createFamilyStore();
  const mailer = createMemoryMailer();
  const clock = { now: () => new Date(nowIso) };
  const commands = createFamilyCommands({
    store,
    apple: createMapAppleVerifier({
      apple_alice: { appleSubject: 'apple.alice', email: 'alice@example.com' },
      apple_same_mail: { appleSubject: 'apple.same', email: 'shared@example.com' },
    }),
    clock,
    ids: idsWith(seq),
    mailer,
    emailRegisterEnabled: true,
    emailRegisterReason: 'enabled',
    passwordHasher: createArgon2idPasswordHasher(ARGON2ID_TEST),
  });
  return { commands, store, mailer, clock };
}

function tokenFrom(mailer: ReturnType<typeof createMemoryMailer>, index = -1) {
  const message = mailer.sent.at(index);
  const match = message?.text.match(/\n\n([0-9a-f]{64})\n\n/);
  if (!match) throw new Error('verification token missing from mail');
  return match[1];
}

describe('email identity commands', () => {
  it('refuses email register when the slice is closed or mailer is missing', async () => {
    const closed = createFamilyCommands({
      store: createFamilyStore(),
      apple: createMapAppleVerifier({ apple_alice: { appleSubject: 'apple.alice' } }),
    });
    expect(closed.health()).toMatchObject({
      emailRegister: false,
      emailRegisterReason: 'account-delete-incomplete',
      argon2id: ARGON2ID_PRODUCTION,
    });
    await expect(
      closed.registerWithEmail({ email: 'a@example.com', password: 'correct-horse' }),
    ).rejects.toMatchObject({ code: FAMILY_ERROR.EMAIL_REGISTER_CLOSED });

    const noMail = createFamilyCommands({
      store: createFamilyStore(),
      apple: createMapAppleVerifier({ apple_alice: { appleSubject: 'apple.alice' } }),
      emailRegisterEnabled: true,
    });
    await expect(
      noMail.registerWithEmail({ email: 'a@example.com', password: 'correct-horse' }),
    ).rejects.toMatchObject({ code: FAMILY_ERROR.EMAIL_MAILER_UNAVAILABLE });
  });

  it('does not issue a family session before the email is verified', async () => {
    const { commands, mailer, store } = setup();
    expect(await commands.registerWithEmail({ email: 'Pat@Example.com', password: 'correct-horse' })).toEqual({
      accepted: true,
    });
    expect(store.sessions).toHaveLength(0);
    expect(store.emailCredentials[0]?.emailVerifiedAt).toBeUndefined();
    expect(store.emailCredentials[0]?.emailNormalized).toBe('pat@example.com');
    expect(store.emailCredentials[0]?.passwordHash.startsWith('argon2id$')).toBe(true);
    expect(JSON.stringify(mailer.sent)).not.toMatch(/correct-horse/);
    await expect(
      commands.signInWithEmail({ email: 'pat@example.com', password: 'correct-horse' }),
    ).rejects.toMatchObject({ code: FAMILY_ERROR.AUTH_FAILED });
    expect(store.sessions).toHaveLength(0);
  });

  it('treats verify tokens as one-time and expired after ttl, and allows resend', async () => {
    const { commands, mailer, clock } = setup();
    await commands.registerWithEmail({ email: 'a@example.com', password: 'correct-horse' });
    const first = tokenFrom(mailer);
    expect(await commands.verifyEmail({ token: first })).toEqual({ verified: true });
    await expect(commands.verifyEmail({ token: first })).rejects.toMatchObject({
      code: FAMILY_ERROR.TOKEN_INVALID,
    });

    const later = setup('2026-09-29T08:00:00.000Z');
    await later.commands.registerWithEmail({ email: 'b@example.com', password: 'correct-horse' });
    const stale = tokenFrom(later.mailer);
    later.clock.now = () => new Date('2026-09-30T09:00:00.000Z');
    await expect(later.commands.verifyEmail({ token: stale })).rejects.toMatchObject({
      code: FAMILY_ERROR.TOKEN_INVALID,
    });
    later.clock.now = () => new Date('2026-09-30T09:00:01.000Z');
    expect(await later.commands.resendVerification({ email: 'b@example.com' })).toEqual({ accepted: true });
    const fresh = tokenFrom(later.mailer);
    expect(fresh).not.toBe(stale);
    expect(await later.commands.verifyEmail({ token: fresh })).toEqual({ verified: true });
    void clock;
  });

  it('accepts the correct password after verify and rejects the wrong one without leaking existence', async () => {
    const { commands, mailer } = setup();
    await commands.registerWithEmail({ email: 'a@example.com', password: 'correct-horse' });
    await commands.verifyEmail({ token: tokenFrom(mailer) });
    const signed = await commands.signInWithEmail({ email: 'a@example.com', password: 'correct-horse' });
    expect(signed.userId).toMatch(/^usr_/);
    expect(signed.sessionToken).toMatch(/^ses_/);
    await expect(
      commands.signInWithEmail({ email: 'a@example.com', password: 'wrong-password' }),
    ).rejects.toMatchObject({ code: FAMILY_ERROR.AUTH_FAILED, message: expect.stringMatching(/not verified|wrong/i) });
    await expect(
      commands.signInWithEmail({ email: 'missing@example.com', password: 'correct-horse' }),
    ).rejects.toMatchObject({ code: FAMILY_ERROR.AUTH_FAILED });
  });

  it('rate-limits login and register without telling whether the email exists', async () => {
    const { commands, mailer } = setup();
    await commands.registerWithEmail({ email: 'a@example.com', password: 'correct-horse' });
    await commands.verifyEmail({ token: tokenFrom(mailer) });
    for (let i = 0; i < 8; i += 1) {
      await expect(
        commands.signInWithEmail({ email: 'a@example.com', password: 'nope-nope-1' }),
      ).rejects.toMatchObject({ code: FAMILY_ERROR.AUTH_FAILED });
    }
    await expect(
      commands.signInWithEmail({ email: 'a@example.com', password: 'correct-horse' }),
    ).rejects.toMatchObject({ code: FAMILY_ERROR.RATE_LIMITED });

    const other = setup();
    for (let i = 0; i < 5; i += 1) {
      expect(await other.commands.registerWithEmail({ email: 'dup@example.com', password: 'correct-horse' })).toEqual({
        accepted: true,
      });
    }
    await expect(
      other.commands.registerWithEmail({ email: 'dup@example.com', password: 'correct-horse' }),
    ).rejects.toMatchObject({ code: FAMILY_ERROR.RATE_LIMITED });
  });

  it('resets the password once, then revokes old sessions', async () => {
    const { commands, mailer } = setup();
    await commands.registerWithEmail({ email: 'a@example.com', password: 'correct-horse' });
    await commands.verifyEmail({ token: tokenFrom(mailer) });
    const first = await commands.signInWithEmail({ email: 'a@example.com', password: 'correct-horse' });
    expect(await commands.requestPasswordReset({ email: 'a@example.com' })).toEqual({ accepted: true });
    const resetToken = tokenFrom(mailer);
    expect(await commands.resetPassword({ token: resetToken, password: 'new-correct-1' })).toEqual({ reset: true });
    await expect(commands.listMembership(first.sessionToken)).rejects.toMatchObject({
      code: FAMILY_ERROR.UNAUTHENTICATED,
    });
    await expect(
      commands.signInWithEmail({ email: 'a@example.com', password: 'correct-horse' }),
    ).rejects.toMatchObject({ code: FAMILY_ERROR.AUTH_FAILED });
    const again = await commands.signInWithEmail({ email: 'a@example.com', password: 'new-correct-1' });
    expect(again.sessionToken).not.toBe(first.sessionToken);
    await expect(commands.resetPassword({ token: resetToken, password: 'newer-pass-1' })).rejects.toMatchObject({
      code: FAMILY_ERROR.TOKEN_INVALID,
    });
  });

  it('issues the same Lampy session shape as Apple and never merges userId by email string', async () => {
    const { commands, mailer, store } = setup();
    const apple = await commands.signInWithApple('apple_same_mail');
    await commands.registerWithEmail({ email: 'shared@example.com', password: 'correct-horse' });
    await commands.verifyEmail({ token: tokenFrom(mailer) });
    const email = await commands.signInWithEmail({ email: 'shared@example.com', password: 'correct-horse' });
    expect(email.userId).not.toBe(apple.userId);
    expect(Object.keys(email).sort()).toEqual(Object.keys(apple).sort());
    expect(store.accounts.filter((row) => row.appleSubject === 'apple.same')).toHaveLength(1);
    expect(store.emailCredentials).toHaveLength(1);
    expect(store.emailCredentials[0]?.userId).toBe(email.userId);
  });

  it('survives sqlite reopen, concurrent register, and repeated accepted requests', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lampy-email-'));
    const file = path.join(dir, 'family.db');
    const mailer = createMemoryMailer();
    const hasher = createArgon2idPasswordHasher(ARGON2ID_TEST);
    const open = async (seq: { n: number }) => {
      const db = openFamilySqliteDatabase(file);
      await applyFamilyApiSchema(db);
      return {
        db,
        commands: createFamilyCommands({
          repository: createSqliteFamilyRepository(db),
          apple: createMapAppleVerifier({ apple_alice: { appleSubject: 'apple.alice' } }),
          ids: idsWith(seq),
          mailer,
          emailRegisterEnabled: true,
          passwordHasher: hasher,
        }),
      };
    };
    try {
      const firstSeq = { n: 0 };
      const first = await open(firstSeq);
      const [left, right] = await Promise.all([
        first.commands.registerWithEmail({ email: 'c@example.com', password: 'correct-horse' }),
        first.commands.registerWithEmail({ email: 'c@example.com', password: 'correct-horse' }),
      ]);
      expect(left).toEqual({ accepted: true });
      expect(right).toEqual({ accepted: true });
      const token = tokenFrom(mailer);
      await first.commands.verifyEmail({ token });
      await first.db.close();

      const restored = await open({ n: 100 });
      const signed = await restored.commands.signInWithEmail({
        email: 'c@example.com',
        password: 'correct-horse',
      });
      expect(signed.userId).toMatch(/^usr_/);
      expect(await restored.commands.registerWithEmail({ email: 'c@example.com', password: 'correct-horse' })).toEqual({
        accepted: true,
      });
      await restored.db.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('deletes an unused email account and refuses when family creator or live shares remain', async () => {
    const { commands, mailer } = setup();
    await commands.registerWithEmail({ email: 'solo@example.com', password: 'correct-horse' });
    await commands.verifyEmail({ token: tokenFrom(mailer) });
    const solo = await commands.signInWithEmail({ email: 'solo@example.com', password: 'correct-horse' });
    expect(await commands.deleteAccount(solo.sessionToken)).toEqual({ deleted: true });
    await expect(
      commands.signInWithEmail({ email: 'solo@example.com', password: 'correct-horse' }),
    ).rejects.toMatchObject({ code: FAMILY_ERROR.AUTH_FAILED });

    const apple = await commands.signInWithApple('apple_alice');
    await commands.createFamily(apple.sessionToken);
    await expect(commands.deleteAccount(apple.sessionToken)).rejects.toMatchObject({
      code: FAMILY_ERROR.ACCOUNT_DELETE_BLOCKED,
    });
  });
});
