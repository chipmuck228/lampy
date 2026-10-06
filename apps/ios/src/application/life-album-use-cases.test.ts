import { createAsset } from '../domain-adapters/asset-commands';
import { activateMoment, attachAsset, createDraftMoment } from '../domain-adapters/moment-commands';
import { LOCAL_OWNER_ID } from '../domain-adapters/identity';
import { createMemoryLifeAlbumRepository } from '../infrastructure/life-album-repository';
import { createMemoryRepositories } from '../infrastructure/repositories';
import { ApplicationError } from './errors';
import { albumNoteExcerpt, DEFAULT_ALBUM_NAME } from './life-album';
import { ALBUM_NOT_FOUND, ALBUM_WRITE_FAILED_CODE, createLifeAlbumUseCases } from './life-album-use-cases';
import { createUseCases } from './use-cases';

function clockAt(iso: string) {
  return { now: () => new Date(iso) };
}

async function seedMoment(
  repos: ReturnType<typeof createMemoryRepositories>,
  id: string,
  note: string,
  at: string,
  assetIds: string[] = [],
) {
  let moment = createDraftMoment(
    {
      content: { note, emotion: '' },
      origin: { type: 'created' },
    },
    { now: () => new Date(at), ownerId: LOCAL_OWNER_ID, id: () => id },
  );
  for (const assetId of assetIds) {
    moment = attachAsset(moment, assetId, LOCAL_OWNER_ID, at);
  }
  moment = activateMoment(moment, LOCAL_OWNER_ID, new Date(at));
  await repos.moments.save(moment);
  return moment;
}

async function seedImage(
  repos: ReturnType<typeof createMemoryRepositories>,
  id: string,
  at: string,
) {
  const asset = createAsset(
    {
      id,
      ownerId: LOCAL_OWNER_ID,
      type: 'image',
      localUri: `memory://${id}.jpg`,
      storage: { status: 'local' },
      metadata: { mimeType: 'image/jpeg', width: 80, height: 80 },
    },
    { now: () => new Date(at), ownerId: LOCAL_OWNER_ID, id: () => id },
  );
  await repos.assets.save(asset);
  return asset;
}

describe('life album use cases', () => {
  it('defaults the album name and restores after a new app object', async () => {
    const repos = createMemoryRepositories();
    const first = createUseCases({
      ...repos,
      clock: clockAt('2026-10-03T02:00:00.000Z'),
      albumId: () => 'album_days',
    });
    const created = await first.createAlbum({ name: '  ' });
    expect(created.name).toBe(DEFAULT_ALBUM_NAME);
    expect(created.entries).toEqual([]);

    const second = createUseCases({
      ...repos,
      clock: clockAt('2026-10-03T02:01:00.000Z'),
    });
    const listed = await second.listAlbums();
    expect(listed.status).toBe('ready');
    if (listed.status === 'ready') {
      expect(listed.albums).toHaveLength(1);
      expect(listed.albums[0].id).toBe('album_days');
      expect(listed.albums[0].name).toBe(DEFAULT_ALBUM_NAME);
      expect(listed.albums[0].entryCount).toBe(0);
    }
  });

  it('collects the same moment once per album and independently across albums', async () => {
    const repos = createMemoryRepositories();
    await seedMoment(repos, 'moment_a', '门口', '2026-10-01T01:00:00.000Z');
    const app = createUseCases({
      ...repos,
      clock: clockAt('2026-10-03T03:00:00.000Z'),
      albumId: (() => {
        let n = 0;
        return () => `album_${n++}`;
      })(),
    });
    const first = await app.createAlbum({ name: '春天' });
    const second = await app.createAlbum({ name: '夏天' });
    const once = await app.collectAlbumEntry({ albumId: first.id, momentId: 'moment_a' });
    const again = await app.collectAlbumEntry({ albumId: first.id, momentId: 'moment_a' });
    const other = await app.collectAlbumEntry({ albumId: second.id, momentId: 'moment_a' });
    expect(once.inserted).toBe(true);
    expect(again.alreadyCollected).toBe(true);
    expect(again.album.entries).toHaveLength(1);
    expect(other.inserted).toBe(true);
    expect((await app.getAlbum(first.id)).album.entries.map((entry) => entry.momentId)).toEqual([
      'moment_a',
    ]);
    expect((await app.getAlbum(second.id)).album.entries.map((entry) => entry.momentId)).toEqual([
      'moment_a',
    ]);
  });

  it('withdraws, reorders, removes, and deletes the album without touching the moment', async () => {
    const repos = createMemoryRepositories();
    await seedMoment(repos, 'moment_a', '一', '2026-10-01T01:00:00.000Z');
    await seedMoment(repos, 'moment_b', '二', '2026-10-01T02:00:00.000Z');
    const app = createUseCases({
      ...repos,
      clock: clockAt('2026-10-03T04:00:00.000Z'),
      albumId: () => 'album_order',
    });
    const album = await app.createAlbum({ name: '顺序' });
    await app.collectAlbumEntry({ albumId: album.id, momentId: 'moment_a' });
    await app.collectAlbumEntry({ albumId: album.id, momentId: 'moment_b' });
    const moved = await app.moveAlbumEntry({
      albumId: album.id,
      momentId: 'moment_b',
      direction: 'up',
    });
    expect(moved.album.entries.map((entry) => entry.momentId)).toEqual(['moment_b', 'moment_a']);
    const withdrawn = await app.withdrawAlbumEntry({ albumId: album.id, momentId: 'moment_b' });
    expect(withdrawn.album.entries.map((entry) => entry.momentId)).toEqual(['moment_a']);
    await app.deleteAlbum(album.id);
    await expect(app.getAlbum(album.id)).rejects.toMatchObject({ code: ALBUM_NOT_FOUND });
    expect((await repos.moments.findById('moment_a')).kind).toBe('ready');
    expect((await repos.moments.findById('moment_b')).kind).toBe('ready');
    expect((await app.getRecentLife()).items.map((item) => item.id).sort()).toEqual([
      'moment_a',
      'moment_b',
    ]);
  });

  it('returns the cover to words after the cover entry is removed', async () => {
    const repos = createMemoryRepositories();
    await seedImage(repos, 'asset_cover', '2026-10-01T01:00:00.000Z');
    await seedMoment(repos, 'moment_photo', '一张', '2026-10-01T01:00:00.000Z', ['asset_cover']);
    await seedMoment(repos, 'moment_text', '一句', '2026-10-01T02:00:00.000Z');
    const app = createUseCases({
      ...repos,
      clock: clockAt('2026-10-03T05:00:00.000Z'),
      albumId: () => 'album_cover',
    });
    const album = await app.createAlbum({ name: '封面' });
    await app.collectAlbumEntry({ albumId: album.id, momentId: 'moment_photo' });
    await app.collectAlbumEntry({ albumId: album.id, momentId: 'moment_text' });
    const withCover = await app.setAlbumCover({
      albumId: album.id,
      cover: { kind: 'image', momentId: 'moment_photo', assetId: 'asset_cover' },
    });
    expect(withCover.album.cover).toEqual({
      kind: 'image',
      momentId: 'moment_photo',
      assetId: 'asset_cover',
    });
    const after = await app.withdrawAlbumEntry({ albumId: album.id, momentId: 'moment_photo' });
    expect(after.album.cover).toEqual({ kind: 'words' });
    expect(after.album.entries.map((entry) => entry.momentId)).toEqual(['moment_text']);
    expect((await repos.moments.findById('moment_photo')).kind).toBe('ready');
    expect((await repos.assets.findById('asset_cover')).kind).toBe('ready');
  });

  it('keeps a collected reference when the source moment is later missing', async () => {
    const repos = createMemoryRepositories();
    await seedMoment(repos, 'moment_gone', '还在册里', '2026-10-01T01:00:00.000Z');
    const app = createUseCases({
      ...repos,
      clock: clockAt('2026-10-03T06:00:00.000Z'),
      albumId: () => 'album_stub',
    });
    const album = await app.createAlbum({ name: '还在' });
    await app.collectAlbumEntry({ albumId: album.id, momentId: 'moment_gone' });
    const originalFind = repos.moments.findById.bind(repos.moments);
    repos.moments.findById = async (id) => {
      if (id === 'moment_gone') return { kind: 'missing' };
      return originalFind(id);
    };
    const view = await app.getAlbum(album.id);
    expect(view.entries).toHaveLength(1);
    expect(view.entries[0].momentId).toBe('moment_gone');
    expect(view.entries[0].source).toBe('missing');
    expect(view.entries[0].noteExcerpt).toBeNull();
    expect(view.entries[0].dateLabel).toBeNull();
    expect(view.entries[0].mediaHint).toBeNull();
    expect(view.entries[0].thumbnailUri).toBeNull();
    expect(view.entries[0].unknownCount).toBe(0);
  });

  it('describes a collected entry from the original note, date, and media', async () => {
    const repos = createMemoryRepositories();
    await seedImage(repos, 'asset_photo', '2026-10-01T01:00:00.000Z');
    const note = '门口的风还在，这一句故意写得很长很长很长很长很长';
    await seedMoment(repos, 'moment_photo', note, '2026-10-01T01:00:00.000Z', ['asset_photo']);
    const app = createUseCases({
      ...repos,
      clock: clockAt('2026-10-03T06:30:00.000Z'),
      albumId: () => 'album_words',
    });
    const album = await app.createAlbum({ name: '可辨认' });
    await app.collectAlbumEntry({ albumId: album.id, momentId: 'moment_photo' });
    const view = await app.getAlbum(album.id);
    expect(view.entries[0].source).toBe('ready');
    expect(view.entries[0].noteExcerpt).toBe(albumNoteExcerpt(note));
    expect(view.entries[0].dateLabel).toBe('记录于 2026年10月1日');
    expect(view.entries[0].mediaHint).toBe('有照片');
    expect(view.entries[0].photoCount).toBe(1);
    expect(view.entries[0].thumbnailUri).toBe('memory://asset_photo.jpg');
  });

  it('does not pretend a failed write succeeded', async () => {
    const albums = createMemoryLifeAlbumRepository();
    const repos = createMemoryRepositories();
    await seedMoment(repos, 'moment_a', '字', '2026-10-01T01:00:00.000Z');
    const failing = {
      ...albums,
      async insertEntry() {
        throw new Error('disk full');
      },
    };
    const app = createLifeAlbumUseCases({
      albums: failing,
      moments: repos.moments,
      assets: repos.assets,
      clock: clockAt('2026-10-03T07:00:00.000Z'),
      id: () => 'album_fail',
    });
    await app.createAlbum({ name: '失败' });
    await expect(
      app.collectAlbumEntry({ albumId: 'album_fail', momentId: 'moment_a' }),
    ).rejects.toMatchObject({ code: ALBUM_WRITE_FAILED_CODE });
    expect(await albums.findEntry('album_fail', 'moment_a')).toBeNull();
  });

  it('rejects a late collect after the target album was deleted', async () => {
    const repos = createMemoryRepositories();
    await seedMoment(repos, 'moment_a', '字', '2026-10-01T01:00:00.000Z');
    const app = createUseCases({
      ...repos,
      clock: clockAt('2026-10-03T08:00:00.000Z'),
      albumId: () => 'album_late',
    });
    const album = await app.createAlbum({ name: '迟到' });
    await app.deleteAlbum(album.id);
    await expect(
      app.collectAlbumEntry({ albumId: album.id, momentId: 'moment_a' }),
    ).rejects.toBeInstanceOf(ApplicationError);
  });
});
