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
  isolateAccount(userId: string): Promise<void>;
  isolateFamily(userId: string, familyId: string): Promise<void>;
  isolateShare(userId: string, familyId: string, shareId: string): Promise<void>;
  replaceVisible(userId: string, familyId: string, shares: ShareView[]): Promise<void>;
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
      for (let i = shares.length - 1; i >= 0; i -= 1) {
        if (shares[i]?.userId === userId) shares.splice(i, 1);
      }
      for (let i = media.length - 1; i >= 0; i -= 1) {
        if (media[i]?.userId === userId) media.splice(i, 1);
      }
      for (const key of [...files.keys()]) {
        if (key.startsWith(`${userId}/`)) files.delete(key);
      }
    },
    async isolateFamily(userId, familyId) {
      for (let i = shares.length - 1; i >= 0; i -= 1) {
        if (shares[i]?.userId === userId && shares[i]?.familyId === familyId) shares.splice(i, 1);
      }
      for (let i = media.length - 1; i >= 0; i -= 1) {
        if (media[i]?.userId === userId && media[i]?.familyId === familyId) media.splice(i, 1);
      }
      for (const key of [...files.keys()]) {
        if (key.startsWith(`${userId}/${familyId}/`)) files.delete(key);
      }
    },
    async isolateShare(userId, familyId, shareId) {
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
      for (const key of [...files.keys()]) {
        if (key.startsWith(`${userId}/${familyId}/${shareId}/`)) files.delete(key);
      }
    },
    async replaceVisible(userId, familyId, visible) {
      const keep = new Set(visible.map((share) => share.shareId));
      for (const share of visible) {
        await this.upsertListed(userId, share);
      }
      for (const row of shares.filter((item) => item.userId === userId && item.familyId === familyId)) {
        if (keep.has(row.shareId)) continue;
        const index = shares.indexOf(row);
        if (index >= 0) shares.splice(index, 1);
        for (let i = media.length - 1; i >= 0; i -= 1) {
          if (media[i]?.userId === userId && media[i]?.familyId === familyId && media[i]?.shareId === row.shareId) {
            media.splice(i, 1);
          }
        }
        for (const key of [...files.keys()]) {
          if (key.startsWith(`${userId}/${familyId}/${row.shareId}/`)) files.delete(key);
        }
      }
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
    await files.removePrefix(`${row.userId}/${row.familyId}/${row.shareId}`);
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
      await db.run('DELETE FROM family_received_media WHERE user_id = ?', [userId]);
      await db.run('DELETE FROM family_received_shares WHERE user_id = ?', [userId]);
      await files.removePrefix(userId).catch(() => undefined);
    },
    async isolateFamily(userId, familyId) {
      await db.run('DELETE FROM family_received_media WHERE user_id = ? AND family_id = ?', [userId, familyId]);
      await db.run('DELETE FROM family_received_shares WHERE user_id = ? AND family_id = ?', [userId, familyId]);
      await files.removePrefix(`${userId}/${familyId}`).catch(() => undefined);
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
      await files.removePrefix(`${userId}/${familyId}/${shareId}`).catch(() => undefined);
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
      for (const row of rows) {
        if (keep.has(row.share_id)) continue;
        await db.run(
          `DELETE FROM family_received_media WHERE user_id = ? AND family_id = ? AND share_id = ?`,
          [userId, familyId, row.share_id],
        );
        await db.run(
          `DELETE FROM family_received_shares WHERE user_id = ? AND family_id = ? AND share_id = ?`,
          [userId, familyId, row.share_id],
        );
        await files.removePrefix(`${userId}/${familyId}/${row.share_id}`).catch(() => undefined);
      }
    },
  };
}
