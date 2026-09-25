import { sha256MediaBytes } from '../family-api/media-validate';
import type { ShareSnapshot, ShareView } from '../family-api/types';
import type { FamilyReceiveFileStore } from './family-receive-files';
import type { SqlDatabase } from './sql';

export type ReceivedShareStatus = 'listed' | 'receiving' | 'received' | 'failed';

export type ReceivedShareRecord = {
  userId: string;
  familyId: string;
  shareId: string;
  snapshotRevision: number;
  authorUserId: string;
  snapshot: ShareSnapshot;
  sharedAt: string;
  receiveStatus: ReceivedShareStatus;
  expectedMediaCount: number;
};

export type ReceivedMediaRecord = {
  userId: string;
  familyId: string;
  shareId: string;
  objectId: string;
  mimeType: string;
  byteLength: number;
  contentSha256: string;
  storageKey: string;
  status: 'pending' | 'stored' | 'failed';
};

export type FamilyCacheCleanup = {
  hidden: true;
  diskCleared: boolean;
};

export type FamilyReceiveCache = {
  list(userId: string, familyId: string): Promise<ReceivedShareRecord[]>;
  find(userId: string, familyId: string, shareId: string): Promise<ReceivedShareRecord | null>;
  upsertListed(userId: string, share: ShareView): Promise<ReceivedShareRecord>;
  beginReceive(userId: string, share: ShareView): Promise<ReceivedShareRecord>;
  saveStoredMedia(input: Omit<ReceivedMediaRecord, 'status'> & { bytes: Uint8Array }): Promise<ReceivedMediaRecord>;
  listMedia(userId: string, familyId: string, shareId: string): Promise<ReceivedMediaRecord[]>;
  readMediaBytes(storageKey: string): Promise<Uint8Array>;
  markReceived(userId: string, familyId: string, shareId: string): Promise<ReceivedShareRecord>;
  markFailed(userId: string, familyId: string, shareId: string): Promise<ReceivedShareRecord>;
  isolateAccount(userId: string): Promise<FamilyCacheCleanup>;
  isolateFamily(userId: string, familyId: string): Promise<FamilyCacheCleanup>;
  isolateShare(userId: string, familyId: string, shareId: string): Promise<FamilyCacheCleanup>;
  replaceVisible(userId: string, familyId: string, shares: ShareView[]): Promise<FamilyCacheCleanup>;
  recoverDisk(): Promise<FamilyCacheCleanup>;
  pendingCleanupPrefixes(): Promise<string[]>;
};

function snapshotFrom(share: ShareView): ShareSnapshot {
  return {
    note: share.snapshot.note,
    emotion: share.snapshot.emotion,
    occurredAt: share.snapshot.occurredAt,
    occurredAtPrecision: share.snapshot.occurredAtPrecision,
    media: share.snapshot.media.map((item) => ({
      objectId: item.objectId,
      mimeType: item.mimeType,
      byteLength: item.byteLength,
    })),
    origin: share.snapshot.origin,
  };
}

function fromShare(userId: string, share: ShareView, receiveStatus: ReceivedShareStatus): ReceivedShareRecord {
  return {
    userId,
    familyId: share.familyId,
    shareId: share.shareId,
    snapshotRevision: share.sourceRevision,
    authorUserId: share.authorUserId,
    snapshot: snapshotFrom(share),
    sharedAt: share.sharedAt,
    receiveStatus,
    expectedMediaCount: share.snapshot.media.length,
  };
}

export function createMemoryFamilyReceiveCache(): FamilyReceiveCache & {
  shares: ReceivedShareRecord[];
  media: ReceivedMediaRecord[];
  files: Map<string, Uint8Array>;
} {
  const shares: ReceivedShareRecord[] = [];
  const media: ReceivedMediaRecord[] = [];
  const files = new Map<string, Uint8Array>();
  const pending = new Set<string>();

  function sharePrefixOf(row: { userId: string; familyId: string; shareId: string }) {
    return `${row.userId}/${row.familyId}/${row.shareId}`;
  }

  function allowedPrefixes() {
    return new Set(shares.map(sharePrefixOf));
  }

  function isUnderPrefix(pathValue: string, prefix: string) {
    return pathValue === prefix || pathValue.startsWith(`${prefix}/`);
  }

  function deleteUnauthorized(prefix: string, allowed: Set<string>) {
    for (const key of [...files.keys()]) {
      if (!isUnderPrefix(key, prefix)) continue;
      const parts = key.split('/').filter(Boolean);
      if (parts.length >= 3 && allowed.has(`${parts[0]}/${parts[1]}/${parts[2]}`)) continue;
      files.delete(key);
    }
  }

  function leftoverSharePrefixes(allowed: Set<string>) {
    const leftovers = new Set<string>();
    for (const key of files.keys()) {
      const parts = key.split('/').filter(Boolean);
      if (parts.length < 3) continue;
      const sharePrefix = `${parts[0]}/${parts[1]}/${parts[2]}`;
      if (!allowed.has(sharePrefix)) leftovers.add(sharePrefix);
    }
    return leftovers;
  }

  function replaceShare(row: ReceivedShareRecord) {
    const index = shares.findIndex(
      (item) => item.userId === row.userId && item.familyId === row.familyId && item.shareId === row.shareId,
    );
    if (index >= 0) shares[index] = row;
    else shares.push(row);
    return row;
  }

  return {
    shares,
    media,
    files,
    async list(userId, familyId) {
      return shares.filter((row) => row.userId === userId && row.familyId === familyId);
    },
    async find(userId, familyId, shareId) {
      return shares.find((row) => row.userId === userId && row.familyId === familyId && row.shareId === shareId) ?? null;
    },
    async upsertListed(userId, share) {
      const existing = await this.find(userId, share.familyId, share.shareId);
      if (existing?.receiveStatus === 'received' && existing.snapshotRevision === share.sourceRevision) {
        return existing;
      }
      return replaceShare(fromShare(userId, share, existing?.receiveStatus === 'receiving' ? 'receiving' : 'listed'));
    },
    async beginReceive(userId, share) {
      return replaceShare(fromShare(userId, share, 'receiving'));
    },
    async saveStoredMedia(input) {
      const storageKey = `${input.userId}/${input.familyId}/${input.shareId}/${input.objectId}`;
      files.delete(`${storageKey}.part`);
      files.set(storageKey, input.bytes);
      const row: ReceivedMediaRecord = { ...input, storageKey, status: 'stored' };
      const index = media.findIndex(
        (item) =>
          item.userId === row.userId &&
          item.familyId === row.familyId &&
          item.shareId === row.shareId &&
          item.objectId === row.objectId,
      );
      if (index >= 0) media[index] = row;
      else media.push(row);
      return row;
    },
    async listMedia(userId, familyId, shareId) {
      return media.filter((row) => row.userId === userId && row.familyId === familyId && row.shareId === shareId);
    },
    async readMediaBytes(storageKey) {
      const bytes = files.get(storageKey);
      if (!bytes) throw new Error('family cache file is missing');
      return bytes;
    },
    async markReceived(userId, familyId, shareId) {
      const existing = await this.find(userId, familyId, shareId);
      if (!existing) throw new Error('share cache row is missing');
      return replaceShare({ ...existing, receiveStatus: 'received' });
    },
    async markFailed(userId, familyId, shareId) {
      const existing = await this.find(userId, familyId, shareId);
      if (!existing) throw new Error('share cache row is missing');
      for (const key of [...files.keys()]) {
        if (key.startsWith(`${userId}/${familyId}/${shareId}/`) && key.endsWith('.part')) files.delete(key);
      }
      return replaceShare({ ...existing, receiveStatus: 'failed' });
    },
    async isolateAccount(userId) {
      const doomed = shares.filter((row) => row.userId === userId).map(sharePrefixOf);
      for (let i = shares.length - 1; i >= 0; i -= 1) {
        if (shares[i]?.userId === userId) shares.splice(i, 1);
      }
      for (let i = media.length - 1; i >= 0; i -= 1) {
        if (media[i]?.userId === userId) media.splice(i, 1);
      }
      deleteUnauthorized(userId, allowedPrefixes());
      const leftovers = leftoverSharePrefixes(allowedPrefixes()).filter((item) => isUnderPrefix(item, userId));
      const diskCleared = leftovers.length === 0 && ![...files.keys()].some((key) => isUnderPrefix(key, userId));
      pending.delete(userId);
      const targets = leftovers.length ? leftovers : doomed;
      if (!diskCleared) {
        if (targets.length) targets.forEach((prefix) => pending.add(prefix));
        else pending.add(userId);
      } else {
        doomed.forEach((prefix) => pending.delete(prefix));
      }
      return { hidden: true as const, diskCleared };
    },
    async isolateFamily(userId, familyId) {
      const prefix = `${userId}/${familyId}`;
      const doomed = shares
        .filter((row) => row.userId === userId && row.familyId === familyId)
        .map(sharePrefixOf);
      for (let i = shares.length - 1; i >= 0; i -= 1) {
        if (shares[i]?.userId === userId && shares[i]?.familyId === familyId) shares.splice(i, 1);
      }
      for (let i = media.length - 1; i >= 0; i -= 1) {
        if (media[i]?.userId === userId && media[i]?.familyId === familyId) media.splice(i, 1);
      }
      deleteUnauthorized(prefix, allowedPrefixes());
      const leftovers = leftoverSharePrefixes(allowedPrefixes()).filter((item) => isUnderPrefix(item, prefix));
      const diskCleared = leftovers.length === 0 && ![...files.keys()].some((key) => isUnderPrefix(key, prefix));
      pending.delete(prefix);
      const targets = leftovers.length ? leftovers : doomed;
      if (!diskCleared) {
        if (targets.length) targets.forEach((item) => pending.add(item));
        else pending.add(prefix);
      } else {
        doomed.forEach((item) => pending.delete(item));
      }
      return { hidden: true as const, diskCleared };
    },
    async isolateShare(userId, familyId, shareId) {
      const prefix = `${userId}/${familyId}/${shareId}`;
      for (let i = shares.length - 1; i >= 0; i -= 1) {
        if (shares[i]?.userId === userId && shares[i]?.familyId === familyId && shares[i]?.shareId === shareId) {
          shares.splice(i, 1);
        }
      }
      for (let i = media.length - 1; i >= 0; i -= 1) {
        if (media[i]?.userId === userId && media[i]?.familyId === familyId && media[i]?.shareId === shareId) {
          media.splice(i, 1);
        }
      }
      deleteUnauthorized(prefix, allowedPrefixes());
      const diskCleared = ![...files.keys()].some((key) => isUnderPrefix(key, prefix));
      if (!diskCleared) pending.add(prefix);
      else pending.delete(prefix);
      return { hidden: true as const, diskCleared };
    },
    async replaceVisible(userId, familyId, visible) {
      const keep = new Set(visible.map((share) => share.shareId));
      for (const share of visible) {
        await this.upsertListed(userId, share);
      }
      let diskCleared = true;
      for (const row of shares.filter((item) => item.userId === userId && item.familyId === familyId)) {
        if (keep.has(row.shareId)) continue;
        const cleanup = await this.isolateShare(userId, familyId, row.shareId);
        if (!cleanup.diskCleared) diskCleared = false;
      }
      return { hidden: true as const, diskCleared };
    },
    async recoverDisk() {
      const allowed = allowedPrefixes();
      let diskCleared = true;
      for (const prefix of [...pending]) {
        if ([...allowed].some((share) => isUnderPrefix(share, prefix))) {
          deleteUnauthorized(prefix, allowed);
          pending.delete(prefix);
          continue;
        }
        deleteUnauthorized(prefix, allowed);
        if (![...files.keys()].some((key) => isUnderPrefix(key, prefix))) pending.delete(prefix);
        else diskCleared = false;
      }
      for (const prefix of leftoverSharePrefixes(allowed)) {
        deleteUnauthorized(prefix, allowed);
        if ([...files.keys()].some((key) => isUnderPrefix(key, prefix))) {
          pending.add(prefix);
          diskCleared = false;
        } else {
          pending.delete(prefix);
        }
      }
      return { hidden: true as const, diskCleared };
    },
    async pendingCleanupPrefixes() {
      return [...pending];
    },
  };
}

type ShareRow = {
  user_id: string;
  family_id: string;
  share_id: string;
  snapshot_revision: number;
  author_user_id: string;
  snapshot_json: string;
  shared_at: string;
  receive_status: ReceivedShareStatus;
  expected_media_count: number;
};

type MediaRow = {
  user_id: string;
  family_id: string;
  share_id: string;
  object_id: string;
  mime_type: string;
  byte_length: number;
  content_sha256: string;
  storage_key: string;
  status: 'pending' | 'stored' | 'failed';
};

function shareFrom(row: ShareRow): ReceivedShareRecord {
  return {
    userId: row.user_id,
    familyId: row.family_id,
    shareId: row.share_id,
    snapshotRevision: row.snapshot_revision,
    authorUserId: row.author_user_id,
    snapshot: JSON.parse(row.snapshot_json) as ShareSnapshot,
    sharedAt: row.shared_at,
    receiveStatus: row.receive_status,
    expectedMediaCount: row.expected_media_count,
  };
}

export function createSqliteFamilyReceiveCache(db: SqlDatabase, files: FamilyReceiveFileStore): FamilyReceiveCache {
  async function markPending(prefix: string) {
    await db.run(
      `INSERT OR REPLACE INTO family_receive_pending_cleanup (prefix, created_at) VALUES (?, ?)`,
      [prefix, new Date().toISOString()],
    );
  }

  async function clearPending(prefix: string) {
    await db.run(`DELETE FROM family_receive_pending_cleanup WHERE prefix = ?`, [prefix]);
  }

  function isUnderPrefix(pathValue: string, prefix: string) {
    return pathValue === prefix || pathValue.startsWith(`${prefix}/`);
  }

  async function authorizedPrefixes() {
    return new Set(
      (
        await db.getAll<{ user_id: string; family_id: string; share_id: string }>(
          'SELECT user_id, family_id, share_id FROM family_received_shares',
        )
      ).map((row) => `${row.user_id}/${row.family_id}/${row.share_id}`),
    );
  }

  async function tryRemovePrefix(prefix: string) {
    try {
      await files.removePrefix(prefix);
      await clearPending(prefix);
      return true;
    } catch {
      return false;
    }
  }

  async function removeUnauthorizedUnder(prefix: string, allowed: Set<string>) {
    const targets = new Set<string>();
    for (const key of await files.listKeys()) {
      if (!isUnderPrefix(key, prefix)) continue;
      const parts = key.split('/').filter(Boolean);
      if (parts.length < 3) {
        try {
          await files.remove(key);
        } catch {
          return false;
        }
        continue;
      }
      const sharePrefix = `${parts[0]}/${parts[1]}/${parts[2]}`;
      if (!allowed.has(sharePrefix)) targets.add(sharePrefix);
    }
    let diskCleared = true;
    for (const target of targets) {
      if (!(await tryRemovePrefix(target))) {
        await markPending(target);
        diskCleared = false;
      }
    }
    await clearPending(prefix);
    return diskCleared;
  }

  async function removeTracked(prefix: string) {
    const allowed = await authorizedPrefixes();
    if ([...allowed].some((share) => isUnderPrefix(share, prefix))) {
      return removeUnauthorizedUnder(prefix, allowed);
    }
    if (await tryRemovePrefix(prefix)) return true;
    await markPending(prefix);
    return false;
  }

  async function leftoverTargetsUnder(prefix: string) {
    const leftovers = new Set<string>();
    for (const key of await files.listKeys()) {
      if (!isUnderPrefix(key, prefix)) continue;
      const parts = key.split('/').filter(Boolean);
      if (parts.length >= 3) leftovers.add(`${parts[0]}/${parts[1]}/${parts[2]}`);
      else leftovers.add(key);
    }
    return leftovers;
  }

  async function isolateRowsThenFiles(
    doomed: string[],
    broadPrefix: string,
    deleteRows: () => Promise<void>,
  ): Promise<FamilyCacheCleanup> {
    await deleteRows();
    const allowed = await authorizedPrefixes();
    if ([...allowed].some((share) => isUnderPrefix(share, broadPrefix))) {
      const diskCleared = await removeUnauthorizedUnder(broadPrefix, allowed);
      return { hidden: true, diskCleared: diskCleared && (await leftoverTargetsUnder(broadPrefix)).size === 0 };
    }
    if (await tryRemovePrefix(broadPrefix)) {
      for (const prefix of doomed) await clearPending(prefix);
      if ((await leftoverTargetsUnder(broadPrefix)).size === 0) {
        return { hidden: true, diskCleared: true };
      }
    }
    await clearPending(broadPrefix);
    const targets = new Set(doomed);
    for (const leftover of await leftoverTargetsUnder(broadPrefix)) targets.add(leftover);
    let diskCleared = true;
    for (const prefix of targets) {
      if (await tryRemovePrefix(prefix)) continue;
      await markPending(prefix);
      diskCleared = false;
    }
    if ((await leftoverTargetsUnder(broadPrefix)).size > 0) {
      diskCleared = false;
      if (targets.size === 0) await markPending(broadPrefix);
    }
    return { hidden: true, diskCleared };
  }

  async function recoverDisk(): Promise<FamilyCacheCleanup> {
    const pending = await db.getAll<{ prefix: string }>('SELECT prefix FROM family_receive_pending_cleanup');
    let diskCleared = true;
    for (const row of pending) {
      if (!(await removeTracked(row.prefix))) diskCleared = false;
    }
    const allowed = await authorizedPrefixes();
    const leftovers = new Set<string>();
    for (const key of await files.listKeys()) {
      const parts = key.split('/').filter(Boolean);
      if (parts.length < 3) continue;
      const sharePrefix = `${parts[0]}/${parts[1]}/${parts[2]}`;
      if (!allowed.has(sharePrefix)) leftovers.add(sharePrefix);
    }
    for (const prefix of leftovers) {
      if (!(await removeTracked(prefix))) diskCleared = false;
    }
    return { hidden: true, diskCleared };
  }

  async function find(userId: string, familyId: string, shareId: string) {
    const row = await db.getFirst<ShareRow>(
      `SELECT user_id, family_id, share_id, snapshot_revision, author_user_id, snapshot_json, shared_at, receive_status, expected_media_count
       FROM family_received_shares WHERE user_id = ? AND family_id = ? AND share_id = ?`,
      [userId, familyId, shareId],
    );
    return row ? shareFrom(row) : null;
  }

  async function saveShare(row: ReceivedShareRecord) {
    await db.run(
      `INSERT INTO family_received_shares
       (user_id, family_id, share_id, snapshot_revision, author_user_id, snapshot_json, shared_at, receive_status, expected_media_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, family_id, share_id) DO UPDATE SET
         snapshot_revision = excluded.snapshot_revision,
         author_user_id = excluded.author_user_id,
         snapshot_json = excluded.snapshot_json,
         shared_at = excluded.shared_at,
         receive_status = excluded.receive_status,
         expected_media_count = excluded.expected_media_count`,
      [
        row.userId,
        row.familyId,
        row.shareId,
        row.snapshotRevision,
        row.authorUserId,
        JSON.stringify(row.snapshot),
        row.sharedAt,
        row.receiveStatus,
        row.expectedMediaCount,
      ],
    );
    return row;
  }

  async function listMedia(userId: string, familyId: string, shareId: string) {
    const rows = await db.getAll<MediaRow>(
      `SELECT user_id, family_id, share_id, object_id, mime_type, byte_length, content_sha256, storage_key, status
       FROM family_received_media WHERE user_id = ? AND family_id = ? AND share_id = ?`,
      [userId, familyId, shareId],
    );
    return rows.map((row) => ({
      userId: row.user_id,
      familyId: row.family_id,
      shareId: row.share_id,
      objectId: row.object_id,
      mimeType: row.mime_type,
      byteLength: row.byte_length,
      contentSha256: row.content_sha256,
      storageKey: row.storage_key,
      status: row.status,
    }));
  }

  async function demote(row: ReceivedShareRecord) {
    await db.run(
      `UPDATE family_received_media SET status = 'failed' WHERE user_id = ? AND family_id = ? AND share_id = ?`,
      [row.userId, row.familyId, row.shareId],
    );
    await removeTracked(`${row.userId}/${row.familyId}/${row.shareId}`);
    return saveShare({ ...row, receiveStatus: 'listed' });
  }

  async function reconcile(row: ReceivedShareRecord) {
    if (row.receiveStatus !== 'received') return row;
    const media = await listMedia(row.userId, row.familyId, row.shareId);
    if (media.length !== row.expectedMediaCount || media.some((item) => item.status !== 'stored')) {
      return demote(row);
    }
    for (const item of media) {
      try {
        const bytes = await files.read(item.storageKey);
        if (bytes.length !== item.byteLength || sha256MediaBytes(bytes) !== item.contentSha256) {
          return demote(row);
        }
      } catch {
        return demote(row);
      }
    }
    return row;
  }

  return {
    async list(userId, familyId) {
      await recoverDisk();
      const rows = await db.getAll<ShareRow>(
        `SELECT user_id, family_id, share_id, snapshot_revision, author_user_id, snapshot_json, shared_at, receive_status, expected_media_count
         FROM family_received_shares WHERE user_id = ? AND family_id = ?`,
        [userId, familyId],
      );
      return Promise.all(rows.map((row) => reconcile(shareFrom(row))));
    },
    find,
    async upsertListed(userId, share) {
      const existing = await find(userId, share.familyId, share.shareId);
      if (existing?.receiveStatus === 'received' && existing.snapshotRevision === share.sourceRevision) {
        return reconcile(existing);
      }
      return saveShare(fromShare(userId, share, existing?.receiveStatus === 'receiving' ? 'receiving' : 'listed'));
    },
    async beginReceive(userId, share) {
      return saveShare(fromShare(userId, share, 'receiving'));
    },
    async saveStoredMedia(input) {
      const storageKey = `${input.userId}/${input.familyId}/${input.shareId}/${input.objectId}`;
      await files.remove(`${storageKey}.part`).catch(() => undefined);
      await files.write(storageKey, input.bytes);
      const row: ReceivedMediaRecord = { ...input, storageKey, status: 'stored' };
      await db.run(
        `INSERT INTO family_received_media
         (user_id, family_id, share_id, object_id, mime_type, byte_length, content_sha256, storage_key, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, family_id, share_id, object_id) DO UPDATE SET
           mime_type = excluded.mime_type,
           byte_length = excluded.byte_length,
           content_sha256 = excluded.content_sha256,
           storage_key = excluded.storage_key,
           status = excluded.status`,
        [
          row.userId,
          row.familyId,
          row.shareId,
          row.objectId,
          row.mimeType,
          row.byteLength,
          row.contentSha256,
          row.storageKey,
          row.status,
        ],
      );
      return row;
    },
    listMedia,
    async readMediaBytes(storageKey) {
      return files.read(storageKey);
    },
    async markReceived(userId, familyId, shareId) {
      const existing = await find(userId, familyId, shareId);
      if (!existing) throw new Error('share cache row is missing');
      return saveShare({ ...existing, receiveStatus: 'received' });
    },
    async markFailed(userId, familyId, shareId) {
      const existing = await find(userId, familyId, shareId);
      if (!existing) throw new Error('share cache row is missing');
      for (const item of await listMedia(userId, familyId, shareId)) {
        await files.remove(`${item.storageKey}.part`).catch(() => undefined);
      }
      return saveShare({ ...existing, receiveStatus: 'failed' });
    },
    async isolateAccount(userId) {
      const doomed = (
        await db.getAll<{ family_id: string; share_id: string }>(
          'SELECT family_id, share_id FROM family_received_shares WHERE user_id = ?',
          [userId],
        )
      ).map((row) => `${userId}/${row.family_id}/${row.share_id}`);
      return isolateRowsThenFiles(doomed, userId, async () => {
        await db.run('DELETE FROM family_received_media WHERE user_id = ?', [userId]);
        await db.run('DELETE FROM family_received_shares WHERE user_id = ?', [userId]);
      });
    },
    async isolateFamily(userId, familyId) {
      const doomed = (
        await db.getAll<{ share_id: string }>(
          'SELECT share_id FROM family_received_shares WHERE user_id = ? AND family_id = ?',
          [userId, familyId],
        )
      ).map((row) => `${userId}/${familyId}/${row.share_id}`);
      return isolateRowsThenFiles(doomed, `${userId}/${familyId}`, async () => {
        await db.run('DELETE FROM family_received_media WHERE user_id = ? AND family_id = ?', [userId, familyId]);
        await db.run('DELETE FROM family_received_shares WHERE user_id = ? AND family_id = ?', [userId, familyId]);
      });
    },
    async isolateShare(userId, familyId, shareId) {
      await db.run(
        `DELETE FROM family_received_media WHERE user_id = ? AND family_id = ? AND share_id = ?`,
        [userId, familyId, shareId],
      );
      await db.run(
        `DELETE FROM family_received_shares WHERE user_id = ? AND family_id = ? AND share_id = ?`,
        [userId, familyId, shareId],
      );
      return { hidden: true as const, diskCleared: await removeTracked(`${userId}/${familyId}/${shareId}`) };
    },
    async replaceVisible(userId, familyId, visible) {
      const keep = new Set(visible.map((share) => share.shareId));
      for (const share of visible) {
        await this.upsertListed(userId, share);
      }
      const rows = await db.getAll<ShareRow>(
        `SELECT user_id, family_id, share_id, snapshot_revision, author_user_id, snapshot_json, shared_at, receive_status, expected_media_count
         FROM family_received_shares WHERE user_id = ? AND family_id = ?`,
        [userId, familyId],
      );
      let diskCleared = true;
      for (const row of rows) {
        if (keep.has(row.share_id)) continue;
        const cleanup = await this.isolateShare(userId, familyId, row.share_id);
        if (!cleanup.diskCleared) diskCleared = false;
      }
      return { hidden: true as const, diskCleared };
    },
    recoverDisk,
    async pendingCleanupPrefixes() {
      return (await db.getAll<{ prefix: string }>('SELECT prefix FROM family_receive_pending_cleanup')).map(
        (row) => row.prefix,
      );
    },
  };
}
