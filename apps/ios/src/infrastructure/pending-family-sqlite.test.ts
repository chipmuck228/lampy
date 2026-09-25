import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createIosFamilyUseCases } from '../application/container';
import { createMemoryFamilySessionStore } from '../application/family-use-cases';
import { createFamilyApiClient } from './family-http-client';
import { openPreparedNodeSqliteDatabase } from './node-sqlite';
import { createSqlitePendingFamilyOperationStore } from './pending-family-operations';

async function withSqliteFile<T>(run: (file: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), 'lampy-family-pending-'));
  const file = path.join(dir, 'lampy.db');
  try {
    return await run(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('SQLite pending family operations through the iOS composition root', () => {
  it('reuses the persisted key across two independent use-case instances on one database file', async () => {
    await withSqliteFile(async (file) => {
      const keys: string[] = [];
      let failNetwork = true;
      const client = createFamilyApiClient({
        async request(input) {
          if (input.path !== '/v1/families') throw new Error(`unexpected ${input.path}`);
          keys.push(String(input.idempotencyKey));
          if (failNetwork) throw new Error('network down');
          return { status: 200, body: { familyId: 'fam_1', role: 'creator', members: [] } };
        },
      });
      let next = 0;
      const idempotencyKey = (prefix: string) => {
        next += 1;
        return `${prefix}-${next}`;
      };

      const session = createMemoryFamilySessionStore();
      await session.setSession({ userId: 'usr_alice', sessionToken: 'ses_alice' });
      const firstDb = await openPreparedNodeSqliteDatabase(file);
      const first = createIosFamilyUseCases({
        db: firstDb,
        client,
        session,
        idempotencyKey,
      });
      await expect(first.createFamily()).rejects.toMatchObject({ code: 'SERVER_UNREACHABLE' });
      await firstDb.close();

      const rebuiltSession = createMemoryFamilySessionStore();
      await rebuiltSession.setSession({ userId: 'usr_alice', sessionToken: 'ses_alice' });
      const secondDb = await openPreparedNodeSqliteDatabase(file);
      const second = createIosFamilyUseCases({
        db: secondDb,
        client,
        session: rebuiltSession,
        idempotencyKey,
      });
      failNetwork = false;
      await second.createFamily();
      expect(keys).toEqual(['createFamily-1', 'createFamily-1']);

      const leftover = await createSqlitePendingFamilyOperationStore(secondDb).find(
        'usr_alice',
        'createFamily',
        'createFamily',
      );
      expect(leftover).toBeNull();
      await secondDb.close();
    });
  });
});
