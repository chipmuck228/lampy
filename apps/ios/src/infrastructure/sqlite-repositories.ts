/* eslint-disable @typescript-eslint/no-require-imports */
import { validateAsset, type AssetRecord } from '../domain-adapters/asset-commands';
import { DomainError, ERROR_CODES } from '../domain-adapters/errors';
import { validateMoment, type MomentRecord } from '../domain-adapters/moment-commands';
import type {
  AssetRead,
  AssetReferenceLookup,
  AssetRepository,
  DraftRepository,
  MomentRead,
  MomentRepository,
} from './repositories';
import type { SqlDatabase } from './sql';

const hash = require('@lampy/domain/shared/hash.js') as { hashCode: (value: string) => number };

function fingerprintOf(entityType: string, raw: unknown) {
  return `${entityType}:${hash.hashCode(JSON.stringify(raw))}`;
}

type Decoded =
  | { ok: true; moment: MomentRecord }
  | { ok: false; raw: unknown; errors: { code: string; message: string }[] };

function decodeMoment(json: string): Decoded {
  try {
    const raw = JSON.parse(json) as unknown;
    const result = validateMoment(raw);
    if (!result.ok) {
      return { ok: false, raw, errors: result.errors };
    }
    return { ok: true, moment: raw as MomentRecord };
  } catch {
    return {
      ok: false,
      raw: json,
      errors: [{ code: ERROR_CODES.REPOSITORY_INVALID_RECORD, message: 'moment json could not be parsed' }],
    };
  }
}

async function quarantine(
  db: SqlDatabase,
  entityType: string,
  raw: unknown,
  errors: { code: string; message: string }[],
): Promise<void> {
  const stamp = new Date().toISOString();
  const reason = errors[0]?.code || ERROR_CODES.REPOSITORY_INVALID_RECORD;
  const fingerprint = fingerprintOf(entityType, raw);
  const existing = await db.getFirst<{ fingerprint: string }>(
    'SELECT fingerprint FROM record_quarantine WHERE fingerprint = ?',
    [fingerprint],
  );
  if (existing) {
    await db.run('UPDATE record_quarantine SET last_seen_at = ? WHERE fingerprint = ?', [
      stamp,
      fingerprint,
    ]);
    return;
  }
  await db.run(
    `INSERT INTO record_quarantine
      (fingerprint, entity_type, reason, errors_json, raw_json, first_seen_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [fingerprint, entityType, reason, JSON.stringify(errors), JSON.stringify(raw), stamp, stamp],
  );
}

type DecodedAsset =
  | { ok: true; asset: AssetRecord }
  | { ok: false; raw: unknown; errors: { code: string; message: string }[] };

function decodeAsset(json: string): DecodedAsset {
  try {
    const raw = JSON.parse(json) as unknown;
    const result = validateAsset(raw);
    if (!result.ok) {
      return { ok: false, raw, errors: result.errors };
    }
    return { ok: true, asset: raw as AssetRecord };
  } catch {
    return {
      ok: false,
      raw: json,
      errors: [{ code: ERROR_CODES.REPOSITORY_INVALID_RECORD, message: 'asset json could not be parsed' }],
    };
  }
}

function assertValid(record: MomentRecord) {
  const result = validateMoment(record);
  if (!result.ok) {
    throw new DomainError(
      ERROR_CODES.REPOSITORY_INVALID_RECORD,
      result.errors[0]?.message || 'invalid record',
    );
  }
}

function peekAssetType(raw: unknown, columnType?: string): string | undefined {
  if (columnType === 'image' || columnType === 'audio' || columnType === 'video') {
    return columnType;
  }
  if (raw && typeof raw === 'object' && 'type' in raw) {
    const type = (raw as { type: unknown }).type;
    if (type === 'image' || type === 'audio' || type === 'video') return type;
  }
  return typeof columnType === 'string' && columnType ? columnType : undefined;
}

async function lookupMomentRows(
  db: SqlDatabase,
  entityType: string,
  rows: { json: string }[],
  assetId: string,
): Promise<AssetReferenceLookup> {
  let unknown = false;
  for (const row of rows) {
    const decoded = decodeMoment(row.json);
    if (!decoded.ok) {
      await quarantine(db, entityType, decoded.raw, decoded.errors);
      unknown = true;
      continue;
    }
    if (decoded.moment.assetIds.includes(assetId)) return 'referenced';
  }
  return unknown ? 'unknown' : 'clear';
}

function assertValidAsset(record: AssetRecord) {
  const result = validateAsset(record);
  if (!result.ok) {
    throw new DomainError(
      ERROR_CODES.REPOSITORY_INVALID_RECORD,
      result.errors[0]?.message || 'invalid asset',
    );
  }
}

export function createSqliteRepositories(db: SqlDatabase): {
  moments: MomentRepository;
  drafts: DraftRepository;
  assets: AssetRepository;
} {
  return {
    moments: {
      async save(moment) {
        assertValid(moment);
        const existing = await db.getFirst<{ json: string }>(
          'SELECT json FROM moments WHERE id = ?',
          [moment.id],
        );
        if (existing) {
          const decoded = decodeMoment(existing.json);
          if (!decoded.ok) {
            await quarantine(db, 'moment', decoded.raw, decoded.errors);
            throw new DomainError(
              ERROR_CODES.REPOSITORY_INVALID_RECORD,
              'refusing to overwrite an unreadable moment',
            );
          }
          await db.run(
            `UPDATE moments
             SET owner_id = ?, lifecycle_status = ?, recorded_at = ?, occurred_at = ?, json = ?
             WHERE id = ?`,
            [
              moment.ownerId,
              moment.lifecycle.status,
              moment.time.recordedAt,
              moment.time.occurredAt ?? null,
              JSON.stringify(moment),
              moment.id,
            ],
          );
          return;
        }
        await db.run(
          `INSERT INTO moments
            (id, owner_id, lifecycle_status, recorded_at, occurred_at, json)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            moment.id,
            moment.ownerId,
            moment.lifecycle.status,
            moment.time.recordedAt,
            moment.time.occurredAt ?? null,
            JSON.stringify(moment),
          ],
        );
      },
      async findById(id): Promise<MomentRead> {
        const row = await db.getFirst<{ json: string }>('SELECT json FROM moments WHERE id = ?', [id]);
        if (!row) return { kind: 'missing' };
        const decoded = decodeMoment(row.json);
        if (!decoded.ok) {
          await quarantine(db, 'moment', decoded.raw, decoded.errors);
          return { kind: 'unreadable' };
        }
        return { kind: 'ready', moment: decoded.moment };
      },
      async listRecent(limit = 50) {
        const rows = await db.getAll<{ json: string }>(
          `SELECT json FROM moments
           WHERE lifecycle_status = 'active'
           ORDER BY recorded_at DESC
           LIMIT ?`,
          [limit],
        );
        const valid: MomentRecord[] = [];
        for (const row of rows) {
          const decoded = decodeMoment(row.json);
          if (decoded.ok) {
            valid.push(decoded.moment);
          } else {
            await quarantine(db, 'moment', decoded.raw, decoded.errors);
          }
        }
        return valid;
      },
      async lookupAssetReferences(assetId) {
        const rows = await db.getAll<{ json: string }>('SELECT json FROM moments');
        return lookupMomentRows(db, 'moment', rows, assetId);
      },
    },
    drafts: {
      async save(draft) {
        assertValid(draft);
        const rows = await db.getAll<{ id: string; json: string }>('SELECT id, json FROM drafts');
        const staleValidIds: string[] = [];
        for (const row of rows) {
          const decoded = decodeMoment(row.json);
          if (row.id === draft.id) {
            if (!decoded.ok) {
              await quarantine(db, 'draft', decoded.raw, decoded.errors);
              throw new DomainError(
                ERROR_CODES.REPOSITORY_INVALID_RECORD,
                'refusing to overwrite an unreadable draft',
              );
            }
            continue;
          }
          if (decoded.ok) staleValidIds.push(row.id);
          else await quarantine(db, 'draft', decoded.raw, decoded.errors);
        }
        await db.withTransaction(async () => {
          for (const id of staleValidIds) {
            await db.run('DELETE FROM drafts WHERE id = ?', [id]);
          }
          await db.run(
            `INSERT INTO drafts (id, json, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               json = excluded.json,
               updated_at = excluded.updated_at`,
            [draft.id, JSON.stringify(draft), draft.audit.updatedAt],
          );
        });
      },
      async loadActive() {
        const row = await db.getFirst<{ json: string }>(
          'SELECT json FROM drafts ORDER BY updated_at DESC LIMIT 1',
        );
        if (!row) return null;
        const decoded = decodeMoment(row.json);
        if (!decoded.ok) {
          await quarantine(db, 'draft', decoded.raw, decoded.errors);
          return null;
        }
        return decoded.moment;
      },
      async clear(draftId) {
        await db.run('DELETE FROM drafts WHERE id = ?', [draftId]);
      },
      async lookupAssetReferences(assetId) {
        const rows = await db.getAll<{ json: string }>('SELECT json FROM drafts');
        return lookupMomentRows(db, 'draft', rows, assetId);
      },
    },
    assets: {
      async save(asset) {
        assertValidAsset(asset);
        const existing = await db.getFirst<{ json: string }>('SELECT json FROM assets WHERE id = ?', [
          asset.id,
        ]);
        if (existing) {
          const decoded = decodeAsset(existing.json);
          if (!decoded.ok) {
            await quarantine(db, 'asset', decoded.raw, decoded.errors);
            throw new DomainError(
              ERROR_CODES.REPOSITORY_INVALID_RECORD,
              'refusing to overwrite an unreadable asset',
            );
          }
          await db.run('UPDATE assets SET owner_id = ?, type = ?, json = ? WHERE id = ?', [
            asset.ownerId,
            asset.type,
            JSON.stringify(asset),
            asset.id,
          ]);
          return;
        }
        await db.run('INSERT INTO assets (id, owner_id, type, json) VALUES (?, ?, ?, ?)', [
          asset.id,
          asset.ownerId,
          asset.type,
          JSON.stringify(asset),
        ]);
      },
      async findById(id): Promise<AssetRead> {
        const row = await db.getFirst<{ json: string; type: string | null }>(
          'SELECT json, type FROM assets WHERE id = ?',
          [id],
        );
        if (!row) return { kind: 'missing' };
        const decoded = decodeAsset(row.json);
        if (!decoded.ok) {
          await quarantine(db, 'asset', decoded.raw, decoded.errors);
          return { kind: 'unreadable', type: peekAssetType(decoded.raw, row.type ?? undefined) };
        }
        return { kind: 'ready', asset: decoded.asset };
      },
      async remove(assetId) {
        await db.run('DELETE FROM assets WHERE id = ?', [assetId]);
      },
    },
  };
}

export async function listQuarantine(db: SqlDatabase) {
  return db.getAll<{ fingerprint: string; entity_type: string; raw_json: string }>(
    'SELECT fingerprint, entity_type, raw_json FROM record_quarantine',
  );
}
