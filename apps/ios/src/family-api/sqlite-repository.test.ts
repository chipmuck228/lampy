import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createMapAppleVerifier } from './apple';
import { createFamilyCommands } from './commands';
import { FAMILY_ERROR } from './errors';
import { openFamilySqliteDatabase } from './node-db';
import { applyFamilyApiSchema, type FamilySql } from './schema';
import { createSqliteFamilyRepository } from './sqlite-repository';
import type { FamilyIds } from './types';

async function withSqliteFile<T>(run: (file: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), 'lampy-family-api-'));
  const file = path.join(dir, 'family.db');
  try {
    return await run(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

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

async function openCommands(file: string, seq: { n: number }, clock = { now: () => new Date('2026-09-25T03:00:00.000Z') }) {
  const db = openFamilySqliteDatabase(file);
  await applyFamilyApiSchema(db);
  const commands = createFamilyCommands({
    repository: createSqliteFamilyRepository(db),
    apple: createMapAppleVerifier({
      apple_alice: { appleSubject: 'apple.alice' },
      apple_bob: { appleSubject: 'apple.bob' },
      apple_cara: { appleSubject: 'apple.cara' },
    }),
    clock,
    ids: idsWith(seq),
  });
  return { db, commands };
}

describe('durable SQLite family repository', () => {
  it('keeps membership after closing the file and opening a new process instance', async () => {
    await withSqliteFile(async (file) => {
      const seq = { n: 0 };
      const first = await openCommands(file, seq);
      const alice = await first.commands.signInWithApple('apple_alice');
      const family = await first.commands.createFamily(alice.sessionToken, 'create-1');
      const invite = await first.commands.inviteMember(alice.sessionToken, family.familyId, 'invite-1');
      const bob = await first.commands.signInWithApple('apple_bob');
      await first.commands.acceptInvitation(bob.sessionToken, invite.code, 'accept-1');
      await first.db.close();

      const second = await openCommands(file, seq);
      const aliceAgain = await second.commands.signInWithApple('apple_alice');
      const listed = await second.commands.listMembership(aliceAgain.sessionToken);
      expect(listed.family?.familyId).toBe(family.familyId);
      expect(listed.family?.members).toHaveLength(2);
      expect((await second.commands.createFamily(aliceAgain.sessionToken, 'create-1')).familyId).toBe(family.familyId);
      await second.db.close();
    });
  });

  it('lets only one of two concurrent accepts of the same invite succeed', async () => {
    await withSqliteFile(async (file) => {
      const seq = { n: 0 };
      const setup = await openCommands(file, seq);
      const alice = await setup.commands.signInWithApple('apple_alice');
      const family = await setup.commands.createFamily(alice.sessionToken);
      const invite = await setup.commands.inviteMember(alice.sessionToken, family.familyId);
      const bob = await setup.commands.signInWithApple('apple_bob');
      const cara = await setup.commands.signInWithApple('apple_cara');
      await setup.db.close();

      const left = await openCommands(file, seq);
      const right = await openCommands(file, seq);
      const results = await Promise.allSettled([
        left.commands.acceptInvitation(bob.sessionToken, invite.code),
        right.commands.acceptInvitation(cara.sessionToken, invite.code),
      ]);
      const fulfilled = results.filter((row) => row.status === 'fulfilled');
      const rejected = results.filter((row) => row.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        code: FAMILY_ERROR.INVITE_ALREADY_USED,
      });
      const check = await openCommands(file, seq);
      const members = (await check.commands.listMembership(alice.sessionToken)).family?.members ?? [];
      expect(members).toHaveLength(2);
      await left.db.close();
      await right.db.close();
      await check.db.close();
    });
  }, 15000);

  it('lets only one concurrent create or join succeed for the same account', async () => {
    await withSqliteFile(async (file) => {
      const seq = { n: 0 };
      const setup = await openCommands(file, seq);
      const alice = await setup.commands.signInWithApple('apple_alice');
      const bob = await setup.commands.signInWithApple('apple_bob');
      const family = await setup.commands.createFamily(bob.sessionToken);
      const invite = await setup.commands.inviteMember(bob.sessionToken, family.familyId);
      await setup.db.close();

      const left = await openCommands(file, seq);
      const right = await openCommands(file, seq);
      const results = await Promise.allSettled([
        left.commands.createFamily(alice.sessionToken),
        right.commands.acceptInvitation(alice.sessionToken, invite.code),
      ]);
      const fulfilled = results.filter((row) => row.status === 'fulfilled');
      const rejected = results.filter((row) => row.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        code: FAMILY_ERROR.ALREADY_IN_FAMILY,
      });
      const check = await openCommands(file, seq);
      const listed = await check.commands.listMembership(alice.sessionToken);
      expect(listed.family).not.toBeNull();
      await left.db.close();
      await right.db.close();
      await check.db.close();
    });
  }, 15000);

  it('does not return success when the transaction cannot commit', async () => {
    await withSqliteFile(async (file) => {
      const seq = { n: 0 };
      const real = openFamilySqliteDatabase(file);
      await applyFamilyApiSchema(real);
      let failCommit = false;
      const db: FamilySql = {
        exec: async (sql) => {
          if (sql === 'COMMIT' && failCommit) {
            throw new Error('disk full');
          }
          return real.exec(sql);
        },
        run: (sql, params) => real.run(sql, params),
        getFirst: (sql, params) => real.getFirst(sql, params),
        getAll: (sql, params) => real.getAll(sql, params),
        close: () => real.close(),
      };
      const commands = createFamilyCommands({
        repository: createSqliteFamilyRepository(db),
        apple: createMapAppleVerifier({ apple_alice: { appleSubject: 'apple.alice' } }),
        clock: { now: () => new Date('2026-09-25T03:00:00.000Z') },
        ids: idsWith(seq),
      });
      const alice = await commands.signInWithApple('apple_alice');
      failCommit = true;
      await expect(commands.createFamily(alice.sessionToken, 'create-fail')).rejects.toThrow(/disk full/);
      failCommit = false;
      expect((await commands.listMembership(alice.sessionToken)).family).toBeNull();
      await real.close();
    });
  });
});
