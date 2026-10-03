import type { AlbumCover, AlbumEntry } from '../application/life-album';
import { LIFE_ALBUM_SCHEMA_VERSION } from '../application/life-album';
import type { SqlDatabase } from './sql';

export type LifeAlbumRecord = {
  id: string;
  ownerId: string;
  schemaVersion: typeof LIFE_ALBUM_SCHEMA_VERSION;
  name: string;
  opening: string | null;
  cover: AlbumCover;
  createdAt: string;
  updatedAt: string;
};

export type AlbumEntryRecord = AlbumEntry & {
  albumId: string;
  sortOrder: number;
};

export interface LifeAlbumRepository {
  withTransaction(work: () => Promise<void>): Promise<void>;
  list(ownerId: string): Promise<LifeAlbumRecord[]>;
  findById(id: string): Promise<LifeAlbumRecord | null>;
  insert(album: LifeAlbumRecord): Promise<void>;
  update(album: LifeAlbumRecord): Promise<void>;
  delete(id: string): Promise<void>;
  listEntries(albumId: string): Promise<AlbumEntryRecord[]>;
  findEntry(albumId: string, momentId: string): Promise<AlbumEntryRecord | null>;
  insertEntry(entry: AlbumEntryRecord): Promise<'inserted' | 'exists'>;
  deleteEntry(albumId: string, momentId: string): Promise<boolean>;
  replaceEntryOrder(albumId: string, momentIds: string[]): Promise<void>;
  listAlbumIdsContaining(momentId: string): Promise<string[]>;
}

function cloneCover(cover: AlbumCover): AlbumCover {
  return cover.kind === 'words'
    ? { kind: 'words' }
    : { kind: 'image', momentId: cover.momentId, assetId: cover.assetId };
}

function cloneAlbum(album: LifeAlbumRecord): LifeAlbumRecord {
  return {
    ...album,
    opening: album.opening,
    cover: cloneCover(album.cover),
  };
}

function cloneEntry(entry: AlbumEntryRecord): AlbumEntryRecord {
  return { ...entry };
}

export function createMemoryLifeAlbumRepository(): LifeAlbumRepository {
  const albums = new Map<string, LifeAlbumRecord>();
  const entries = new Map<string, AlbumEntryRecord[]>();

  return {
    async withTransaction(work) {
      await work();
    },
    async list(ownerId) {
      return [...albums.values()]
        .filter((album) => album.ownerId === ownerId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map(cloneAlbum);
    },
    async findById(id) {
      const found = albums.get(id);
      return found ? cloneAlbum(found) : null;
    },
    async insert(album) {
      if (albums.has(album.id)) {
        throw new Error('album already exists');
      }
      albums.set(album.id, cloneAlbum(album));
      entries.set(album.id, []);
    },
    async update(album) {
      if (!albums.has(album.id)) {
        throw new Error('album missing');
      }
      albums.set(album.id, cloneAlbum(album));
    },
    async delete(id) {
      albums.delete(id);
      entries.delete(id);
    },
    async listEntries(albumId) {
      return (entries.get(albumId) ?? [])
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder || left.collectedAt.localeCompare(right.collectedAt))
        .map(cloneEntry);
    },
    async findEntry(albumId, momentId) {
      const found = (entries.get(albumId) ?? []).find((entry) => entry.momentId === momentId);
      return found ? cloneEntry(found) : null;
    },
    async insertEntry(entry) {
      const current = entries.get(entry.albumId) ?? [];
      if (current.some((item) => item.momentId === entry.momentId)) return 'exists';
      current.push(cloneEntry(entry));
      entries.set(entry.albumId, current);
      return 'inserted';
    },
    async deleteEntry(albumId, momentId) {
      const current = entries.get(albumId);
      if (!current) return false;
      const next = current.filter((entry) => entry.momentId !== momentId);
      if (next.length === current.length) return false;
      entries.set(albumId, next);
      return true;
    },
    async replaceEntryOrder(albumId, momentIds) {
      const current = entries.get(albumId) ?? [];
      const byId = new Map(current.map((entry) => [entry.momentId, entry]));
      entries.set(
        albumId,
        momentIds.map((momentId, index) => {
          const found = byId.get(momentId);
          if (!found) throw new Error('album reorder missing entry');
          return { ...found, sortOrder: index };
        }),
      );
    },
    async listAlbumIdsContaining(momentId) {
      const ids: string[] = [];
      for (const [albumId, albumEntries] of entries) {
        if (albumEntries.some((entry) => entry.momentId === momentId)) ids.push(albumId);
      }
      return ids;
    },
  };
}

function decodeCover(kind: string, momentId: string | null, assetId: string | null): AlbumCover {
  if (kind === 'image' && momentId && assetId) {
    return { kind: 'image', momentId, assetId };
  }
  return { kind: 'words' };
}

export function createSqliteLifeAlbumRepository(db: SqlDatabase): LifeAlbumRepository {
  return {
    withTransaction(work) {
      return db.withTransaction(work);
    },
    async list(ownerId) {
      const rows = await db.getAll<{
        id: string;
        owner_id: string;
        schema_version: number;
        name: string;
        opening: string | null;
        cover_kind: string;
        cover_moment_id: string | null;
        cover_asset_id: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT id, owner_id, schema_version, name, opening, cover_kind, cover_moment_id, cover_asset_id, created_at, updated_at
         FROM life_albums
         WHERE owner_id = ?
         ORDER BY updated_at DESC`,
        [ownerId],
      );
      return rows.map((row) => ({
        id: row.id,
        ownerId: row.owner_id,
        schemaVersion: LIFE_ALBUM_SCHEMA_VERSION,
        name: row.name,
        opening: row.opening,
        cover: decodeCover(row.cover_kind, row.cover_moment_id, row.cover_asset_id),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    },
    async findById(id) {
      const row = await db.getFirst<{
        id: string;
        owner_id: string;
        schema_version: number;
        name: string;
        opening: string | null;
        cover_kind: string;
        cover_moment_id: string | null;
        cover_asset_id: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT id, owner_id, schema_version, name, opening, cover_kind, cover_moment_id, cover_asset_id, created_at, updated_at
         FROM life_albums
         WHERE id = ?`,
        [id],
      );
      if (!row) return null;
      return {
        id: row.id,
        ownerId: row.owner_id,
        schemaVersion: LIFE_ALBUM_SCHEMA_VERSION,
        name: row.name,
        opening: row.opening,
        cover: decodeCover(row.cover_kind, row.cover_moment_id, row.cover_asset_id),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },
    async insert(album) {
      await db.run(
        `INSERT INTO life_albums
          (id, owner_id, schema_version, name, opening, cover_kind, cover_moment_id, cover_asset_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          album.id,
          album.ownerId,
          album.schemaVersion,
          album.name,
          album.opening,
          album.cover.kind,
          album.cover.kind === 'image' ? album.cover.momentId : null,
          album.cover.kind === 'image' ? album.cover.assetId : null,
          album.createdAt,
          album.updatedAt,
        ],
      );
    },
    async update(album) {
      await db.run(
        `UPDATE life_albums
         SET name = ?, opening = ?, cover_kind = ?, cover_moment_id = ?, cover_asset_id = ?, updated_at = ?
         WHERE id = ?`,
        [
          album.name,
          album.opening,
          album.cover.kind,
          album.cover.kind === 'image' ? album.cover.momentId : null,
          album.cover.kind === 'image' ? album.cover.assetId : null,
          album.updatedAt,
          album.id,
        ],
      );
    },
    async delete(id) {
      await db.run('DELETE FROM life_album_entries WHERE album_id = ?', [id]);
      await db.run('DELETE FROM life_albums WHERE id = ?', [id]);
    },
    async listEntries(albumId) {
      const rows = await db.getAll<{
        album_id: string;
        moment_id: string;
        collected_at: string;
        source_revision_at_collect: number;
        sort_order: number;
      }>(
        `SELECT album_id, moment_id, collected_at, source_revision_at_collect, sort_order
         FROM life_album_entries
         WHERE album_id = ?
         ORDER BY sort_order ASC, collected_at ASC`,
        [albumId],
      );
      return rows.map((row) => ({
        albumId: row.album_id,
        momentId: row.moment_id,
        collectedAt: row.collected_at,
        sourceRevisionAtCollect: row.source_revision_at_collect,
        sortOrder: row.sort_order,
      }));
    },
    async findEntry(albumId, momentId) {
      const row = await db.getFirst<{
        album_id: string;
        moment_id: string;
        collected_at: string;
        source_revision_at_collect: number;
        sort_order: number;
      }>(
        `SELECT album_id, moment_id, collected_at, source_revision_at_collect, sort_order
         FROM life_album_entries
         WHERE album_id = ? AND moment_id = ?`,
        [albumId, momentId],
      );
      if (!row) return null;
      return {
        albumId: row.album_id,
        momentId: row.moment_id,
        collectedAt: row.collected_at,
        sourceRevisionAtCollect: row.source_revision_at_collect,
        sortOrder: row.sort_order,
      };
    },
    async insertEntry(entry) {
      const existing = await db.getFirst<{ moment_id: string }>(
        'SELECT moment_id FROM life_album_entries WHERE album_id = ? AND moment_id = ?',
        [entry.albumId, entry.momentId],
      );
      if (existing) return 'exists';
      await db.run(
        `INSERT INTO life_album_entries
          (album_id, moment_id, collected_at, source_revision_at_collect, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
        [
          entry.albumId,
          entry.momentId,
          entry.collectedAt,
          entry.sourceRevisionAtCollect,
          entry.sortOrder,
        ],
      );
      return 'inserted';
    },
    async deleteEntry(albumId, momentId) {
      const existing = await db.getFirst<{ moment_id: string }>(
        'SELECT moment_id FROM life_album_entries WHERE album_id = ? AND moment_id = ?',
        [albumId, momentId],
      );
      if (!existing) return false;
      await db.run('DELETE FROM life_album_entries WHERE album_id = ? AND moment_id = ?', [
        albumId,
        momentId,
      ]);
      return true;
    },
    async replaceEntryOrder(albumId, momentIds) {
      for (const [index, momentId] of momentIds.entries()) {
        await db.run(
          'UPDATE life_album_entries SET sort_order = ? WHERE album_id = ? AND moment_id = ?',
          [index, albumId, momentId],
        );
      }
    },
    async listAlbumIdsContaining(momentId) {
      const rows = await db.getAll<{ album_id: string }>(
        'SELECT album_id FROM life_album_entries WHERE moment_id = ?',
        [momentId],
      );
      return rows.map((row) => row.album_id);
    },
  };
}
