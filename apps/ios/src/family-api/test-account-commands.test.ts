import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createMapAppleVerifier } from './apple';
import { createFamilyCommands } from './commands';
import { FAMILY_ERROR } from './errors';
import { TEST_ACCOUNT_AUTH_FAILED_COPY } from './test-account-commands';
import { ARGON2ID_PRODUCTION, ARGON2ID_TEST, createArgon2idPasswordHasher } from './password';
import { applyFamilyApiSchema } from './schema';
import { openFamilySqliteDatabase } from './node-db';
import { createSqliteFamilyRepository } from './sqlite-repository';
import { createFamilyStore } from './store';
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

function setup(options?: { enabled?: boolean; nowIso?: string }) {
  const seq = { n: 0 };
  const store = createFamilyStore();
  const clock = { now: () => new Date(options?.nowIso ?? '2026-09-29T08:00:00.000Z') };
  const commands = createFamilyCommands({
    store,
    apple: createMapAppleVerifier({
      apple_alice: { appleSubject: 'apple.alice', email: 'shared@example.com' },
    }),
    clock,
    ids: idsWith(seq),
    testAccountLoginEnabled: options?.enabled === true,
    passwordHasher: createArgon2idPasswordHasher(ARGON2ID_TEST),
  });
  return { commands, store, clock };
}

describe('controlled test-account commands', () => {
  it('keeps test-account login closed by default and still allows Apple', async () => {
    const { commands } = setup();
    expect(commands.health()).toMatchObject({
      testAccountLogin: false,
      testAccountLoginReason: 'disabled',
      argon2id: ARGON2ID_PRODUCTION,
    });
    await expect(
      commands.signInWithTestAccount({ login: 'a@example.com', password: 'correct-horse' }),
    ).rejects.toMatchObject({ code: FAMILY_ERROR.TEST_ACCOUNT_LOGIN_CLOSED });
    const apple = await commands.signInWithApple('apple_alice');
    expect(apple.userId).toMatch(/^usr_/);
  });

  it('creates two accounts with different userIds and refuses to overwrite a duplicate', async () => {
    const { commands, store } = setup({ enabled: true });
    const first = await commands.createTestAccount('Pat@Example.com', 'correct-horse');
    const second = await commands.createTestAccount('other@example.com', 'correct-horse');
    expect(first.userId).not.toBe(second.userId);
    const hash = store.testCredentials[0]?.passwordHash;
    await expect(commands.createTestAccount('pat@example.com', 'different-1')).rejects.toMatchObject({
      code: FAMILY_ERROR.TEST_ACCOUNT_EXISTS,
    });
    expect(store.testCredentials[0]?.userId).toBe(first.userId);
    expect(store.testCredentials[0]?.passwordHash).toBe(hash);
    expect(store.testCredentials[0]?.passwordHash.startsWith('argon2id$')).toBe(true);
  });

  it('uses one external auth-failed error for unknown, disabled, and wrong password', async () => {
    const { commands } = setup({ enabled: true });
    await commands.createTestAccount('a@example.com', 'correct-horse');
    const signed = await commands.signInWithTestAccount({ login: 'a@example.com', password: 'correct-horse' });
    expect(Object.keys(signed).sort()).toEqual(['expiresAt', 'sessionToken', 'userId']);
    await expect(
      commands.signInWithTestAccount({ login: 'a@example.com', password: 'wrong-password' }),
    ).rejects.toMatchObject({ code: FAMILY_ERROR.AUTH_FAILED, message: TEST_ACCOUNT_AUTH_FAILED_COPY });
    await expect(
      commands.signInWithTestAccount({ login: 'missing@example.com', password: 'correct-horse' }),
    ).rejects.toMatchObject({ code: FAMILY_ERROR.AUTH_FAILED, message: TEST_ACCOUNT_AUTH_FAILED_COPY });
    await commands.disableTestAccount('a@example.com');
    await expect(
      commands.signInWithTestAccount({ login: 'a@example.com', password: 'correct-horse' }),
    ).rejects.toMatchObject({ code: FAMILY_ERROR.AUTH_FAILED, message: TEST_ACCOUNT_AUTH_FAILED_COPY });
  });

  it('does not merge Apple subject with a same-string test login', async () => {
    const { commands } = setup({ enabled: true });
    const apple = await commands.signInWithApple('apple_alice');
    const created = await commands.createTestAccount('shared@example.com', 'correct-horse');
    const test = await commands.signInWithTestAccount({ login: 'shared@example.com', password: 'correct-horse' });
    expect(test.userId).toBe(created.userId);
    expect(test.userId).not.toBe(apple.userId);
  });

  it('revokes test sessions when the deploy switch is off', async () => {
    const seq = { n: 0 };
    const store = createFamilyStore();
    const clock = { now: () => new Date('2026-09-29T08:00:00.000Z') };
    const ids = idsWith(seq);
    const hasher = createArgon2idPasswordHasher(ARGON2ID_TEST);
    const apple = createMapAppleVerifier({ apple_alice: { appleSubject: 'apple.alice' } });
    const open = createFamilyCommands({
      store,
      apple,
      clock,
      ids,
      testAccountLoginEnabled: true,
      passwordHasher: hasher,
    });
    await open.createTestAccount('a@example.com', 'correct-horse');
    const test = await open.signInWithTestAccount({ login: 'a@example.com', password: 'correct-horse' });
    const appleIn = await open.signInWithApple('apple_alice');
    const closed = createFamilyCommands({
      store,
      apple,
      clock,
      ids,
      testAccountLoginEnabled: false,
      passwordHasher: hasher,
    });
    await expect(closed.listMembership(test.sessionToken)).rejects.toMatchObject({
      code: FAMILY_ERROR.UNAUTHENTICATED,
    });
    expect(await closed.listMembership(appleIn.sessionToken)).toEqual({ family: null });
  });

  it('keeps family shares after disable and only revokes that account sessions', async () => {
    const { commands, store } = setup({ enabled: true });
    await commands.createTestAccount('a@example.com', 'correct-horse');
    const signed = await commands.signInWithTestAccount({ login: 'a@example.com', password: 'correct-horse' });
    const family = await commands.createFamily(signed.sessionToken);
    expect(store.families).toHaveLength(1);
    await commands.disableTestAccount('a@example.com');
    expect(store.sessions).toHaveLength(0);
    expect(store.families[0]?.familyId).toBe(family.familyId);
    expect(store.memberships[0]?.userId).toBe(signed.userId);
    await expect(commands.listMembership(signed.sessionToken)).rejects.toMatchObject({
      code: FAMILY_ERROR.UNAUTHENTICATED,
    });
  });

  it('persists rate limits across a failed login transaction and a real SQLite reopen', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lampy-test-account-'));
    const file = path.join(dir, 'family.db');
    const hasher = createArgon2idPasswordHasher(ARGON2ID_TEST);
    const apple = createMapAppleVerifier({ apple_alice: { appleSubject: 'apple.alice' } });
    let now = new Date('2026-09-29T08:00:00.000Z');
    const clock = { now: () => now };
    try {
      const firstDb = openFamilySqliteDatabase(file);
      await applyFamilyApiSchema(firstDb);
      const first = createFamilyCommands({
        repository: createSqliteFamilyRepository(firstDb),
        apple,
        clock,
        testAccountLoginEnabled: true,
        passwordHasher: hasher,
      });
      await first.createTestAccount('a@example.com', 'correct-horse');
      await expect(
        first.signInWithTestAccount({ login: 'a@example.com', password: 'wrong-password' }),
      ).rejects.toMatchObject({ code: FAMILY_ERROR.AUTH_FAILED });
      await firstDb.close();

      const secondDb = openFamilySqliteDatabase(file);
      const second = createFamilyCommands({
        repository: createSqliteFamilyRepository(secondDb),
        apple,
        clock,
        testAccountLoginEnabled: true,
        passwordHasher: hasher,
      });
      for (let i = 0; i < 7; i += 1) {
        await expect(
          second.signInWithTestAccount({ login: 'a@example.com', password: 'wrong-password' }),
        ).rejects.toMatchObject({ code: FAMILY_ERROR.AUTH_FAILED });
      }
      await expect(
        second.signInWithTestAccount({ login: 'a@example.com', password: 'correct-horse' }),
      ).rejects.toMatchObject({ code: FAMILY_ERROR.RATE_LIMITED });
      now = new Date(now.getTime() + 15 * 60 * 1000);
      const signed = await second.signInWithTestAccount({ login: 'a@example.com', password: 'correct-horse' });
      expect(signed.userId).toMatch(/^usr_/);
      await secondDb.close();

      const thirdDb = openFamilySqliteDatabase(file);
      const third = createFamilyCommands({
        repository: createSqliteFamilyRepository(thirdDb),
        apple,
        clock,
        testAccountLoginEnabled: true,
        passwordHasher: hasher,
      });
      await third.disableTestAccount('a@example.com');
      await thirdDb.close();

      const fourthDb = openFamilySqliteDatabase(file);
      const fourth = createFamilyCommands({
        repository: createSqliteFamilyRepository(fourthDb),
        apple,
        clock,
        testAccountLoginEnabled: true,
        passwordHasher: hasher,
      });
      await expect(
        fourth.signInWithTestAccount({ login: 'a@example.com', password: 'correct-horse' }),
      ).rejects.toMatchObject({ code: FAMILY_ERROR.AUTH_FAILED });
      await expect(fourth.listMembership(signed.sessionToken)).rejects.toMatchObject({
        code: FAMILY_ERROR.UNAUTHENTICATED,
      });
      await fourthDb.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
