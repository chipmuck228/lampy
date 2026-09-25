import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createNodeMediaStore } from './node-media';

describe('node media persist faults', () => {
  it('classifies a missing source as COPY_FAILED and does not leave a dest file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lampy-node-media-'));
    try {
      const store = createNodeMediaStore(path.join(dir, 'assets'));
      await expect(
        store.persistImage({
          assetId: 'asset_missing_source',
          sourceUri: path.join(dir, 'no-such.jpg'),
          mimeType: 'image/jpeg',
        }),
      ).rejects.toMatchObject({ code: 'COPY_FAILED' });
      await expect(store.exists(path.join(dir, 'assets', 'asset_missing_source.jpg'))).resolves.toBe(
        false,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('does not delete a file outside the app asset directory', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lampy-node-media-'));
    try {
      const albumDir = path.join(dir, 'DCIM');
      await mkdir(albumDir);
      const album = path.join(albumDir, 'IMG_0001.JPG');
      await writeFile(album, Buffer.from('album'));
      const store = createNodeMediaStore(path.join(dir, 'assets'));
      await expect(store.removeAppOwned(album)).resolves.toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
