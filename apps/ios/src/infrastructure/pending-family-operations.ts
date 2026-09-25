import { digestStable } from '../family-api/idempotency';
import type { SqlDatabase } from './sql';

export type FamilyWriteCommand = 'createFamily' | 'inviteMember' | 'acceptInvitation';

export type PendingFamilyOperation = {
  command: FamilyWriteCommand;
  requestFingerprint: string;
  operationId: string;
  idempotencyKey: string;
  userId: string;
  createdAt: string;
  familyId?: string;
};

export type PendingFamilyOperationStore = {
  find(userId: string, command: FamilyWriteCommand, operationId: string): Promise<PendingFamilyOperation | null>;
  save(operation: PendingFamilyOperation): Promise<void>;
  remove(userId: string, command: FamilyWriteCommand, operationId: string): Promise<void>;
};

export type PendingFamilyOperationDisk = {
  read(): PendingFamilyOperation[];
  write(rows: PendingFamilyOperation[]): void;
};

const COMMANDS = new Set<FamilyWriteCommand>(['createFamily', 'inviteMember', 'acceptInvitation']);

export function pendingCreateFamilyOperationId() {
  return 'createFamily';
}

export function pendingInviteFingerprint(familyId: string, operationId: string) {
  return digestStable(`InviteMember:client:familyId=${familyId}:operationId=${operationId}`);
}

export function pendingAcceptOperationId(code: string) {
  return digestStable(`AcceptInvitation:client:code=${digestStable(code)}`);
}

function rowKey(userId: string, command: string, operationId: string) {
  return `${userId}\0${command}\0${operationId}`;
}

function cloneOperation(operation: PendingFamilyOperation): PendingFamilyOperation {
  return {
    command: operation.command,
    requestFingerprint: operation.requestFingerprint,
    operationId: operation.operationId,
    idempotencyKey: operation.idempotencyKey,
    userId: operation.userId,
    createdAt: operation.createdAt,
    familyId: operation.familyId,
  };
}

export function createPendingFamilyOperationDisk(
  initial: PendingFamilyOperation[] = [],
): PendingFamilyOperationDisk {
  let snapshot = JSON.stringify(initial);
  return {
    read() {
      return JSON.parse(snapshot) as PendingFamilyOperation[];
    },
    write(rows) {
      snapshot = JSON.stringify(rows.map(cloneOperation));
    },
  };
}

export function createPendingFamilyOperationStore(
  disk: PendingFamilyOperationDisk,
): PendingFamilyOperationStore {
  return {
    async find(userId, command, operationId) {
      return disk.read().find(
        (row) => row.userId === userId && row.command === command && row.operationId === operationId,
      ) ?? null;
    },
    async save(operation) {
      const rows = disk.read().filter(
        (row) => rowKey(row.userId, row.command, row.operationId) !== rowKey(operation.userId, operation.command, operation.operationId),
      );
      rows.push(cloneOperation(operation));
      disk.write(rows);
    },
    async remove(userId, command, operationId) {
      disk.write(
        disk.read().filter(
          (row) => rowKey(row.userId, row.command, row.operationId) !== rowKey(userId, command, operationId),
        ),
      );
    },
  };
}

type PendingRow = {
  user_id: string;
  command: string;
  request_fingerprint: string;
  operation_id: string;
  idempotency_key: string;
  created_at: string;
  param_family_id: string | null;
};

function fromRow(row: PendingRow): PendingFamilyOperation | null {
  if (!COMMANDS.has(row.command as FamilyWriteCommand)) return null;
  return {
    command: row.command as FamilyWriteCommand,
    requestFingerprint: row.request_fingerprint,
    operationId: row.operation_id,
    idempotencyKey: row.idempotency_key,
    userId: row.user_id,
    createdAt: row.created_at,
    familyId: row.param_family_id || undefined,
  };
}

export function createSqlitePendingFamilyOperationStore(db: SqlDatabase): PendingFamilyOperationStore {
  return {
    async find(userId, command, operationId) {
      const row = await db.getFirst<PendingRow>(
        'SELECT user_id, command, request_fingerprint, operation_id, idempotency_key, created_at, param_family_id FROM family_pending_operations WHERE user_id = ? AND command = ? AND operation_id = ?',
        [userId, command, operationId],
      );
      return row ? fromRow(row) : null;
    },
    async save(operation) {
      await db.run(
        'INSERT OR REPLACE INTO family_pending_operations (user_id, command, request_fingerprint, operation_id, idempotency_key, created_at, param_family_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          operation.userId,
          operation.command,
          operation.requestFingerprint,
          operation.operationId,
          operation.idempotencyKey,
          operation.createdAt,
          operation.familyId ?? null,
        ],
      );
    },
    async remove(userId, command, operationId) {
      await db.run(
        'DELETE FROM family_pending_operations WHERE user_id = ? AND command = ? AND operation_id = ?',
        [userId, command, operationId],
      );
    },
  };
}
