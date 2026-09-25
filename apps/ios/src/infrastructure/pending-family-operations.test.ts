import {
  createPendingFamilyOperationDisk,
  createPendingFamilyOperationStore,
  createSqlitePendingFamilyOperationStore,
} from './pending-family-operations';
import type { SqlDatabase } from './sql';

function createReconstructiblePendingTable(): SqlDatabase {
  const rows = new Map<string, Record<string, unknown>>();
  const keyOf = (userId: unknown, command: unknown, operationId: unknown) =>
    `${String(userId)}|${String(command)}|${String(operationId)}`;
  return {
    async exec() {
      return undefined;
    },
    async run(sql, params = []) {
      if (sql.includes('INSERT OR REPLACE')) {
        const [userId, command, fingerprint, operationId, idempotencyKey, createdAt, familyId] = params;
        rows.set(keyOf(userId, command, operationId), {
          user_id: userId,
          command,
          request_fingerprint: fingerprint,
          operation_id: operationId,
          idempotency_key: idempotencyKey,
          created_at: createdAt,
          param_family_id: familyId,
        });
        return;
      }
      if (sql.includes('DELETE')) {
        rows.delete(keyOf(params[0], params[1], params[2]));
      }
    },
    async getFirst(_sql, params = []) {
      return (rows.get(keyOf(params[0], params[1], params[2])) as never) ?? null;
    },
    async getAll() {
      return [...rows.values()] as never;
    },
    async withTransaction(work) {
      await work();
    },
    async close() {
      return undefined;
    },
  };
}

describe('pending family operation persistence', () => {
  it('rebuilds from the same disk without sharing a use-case Map', async () => {
    const disk = createPendingFamilyOperationDisk();
    const first = createPendingFamilyOperationStore(disk);
    await first.save({
      command: 'inviteMember',
      requestFingerprint: 'fp',
      operationId: 'op-1',
      idempotencyKey: 'invite-1',
      userId: 'usr_a',
      createdAt: '2026-09-25T05:00:00.000Z',
      familyId: 'fam_1',
    });
    const rebuilt = createPendingFamilyOperationStore(disk);
    const found = await rebuilt.find('usr_a', 'inviteMember', 'op-1');
    expect(found?.idempotencyKey).toBe('invite-1');
    expect(found?.familyId).toBe('fam_1');
    expect(JSON.stringify(disk.read())).not.toContain('ses_');
    expect(JSON.stringify(disk.read())).not.toContain('apple_');
  });

  it('persists through the SQLite adapter against a reconstructible table', async () => {
    const db = createReconstructiblePendingTable();
    const first = createSqlitePendingFamilyOperationStore(db);
    await first.save({
      command: 'createFamily',
      requestFingerprint: 'fp-create',
      operationId: 'createFamily',
      idempotencyKey: 'create-1',
      userId: 'usr_a',
      createdAt: '2026-09-25T05:00:00.000Z',
    });
    const rebuilt = createSqlitePendingFamilyOperationStore(db);
    expect((await rebuilt.find('usr_a', 'createFamily', 'createFamily'))?.idempotencyKey).toBe('create-1');
    await rebuilt.remove('usr_a', 'createFamily', 'createFamily');
    expect(await first.find('usr_a', 'createFamily', 'createFamily')).toBeNull();
  });
});
