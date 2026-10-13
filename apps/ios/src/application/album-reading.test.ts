import {
  albumReadingFingerprint,
  captureAlbumReadingPosition,
  restoreAlbumReadingPosition,
} from './album-reading';
import type { AlbumLayoutInput } from './album-layout-input';
const metadata = {
  fingerprint: 'original',
  width: 342,
  style: 'plain' as const,
};
const anchors = { first: 500, second: 900 };
it('restores exact pixels only for the same content, width and style', () => {
  const saved = captureAlbumReadingPosition({ ...metadata, y: 950 }, anchors);
  expect(saved.anchor).toBe('second');
  expect(restoreAlbumReadingPosition(saved, metadata, anchors)).toBe(950);
  expect(
    restoreAlbumReadingPosition(
      saved,
      { ...metadata, width: 620 },
      { second: 700 },
    ),
  ).toBe(700);
  expect(
    restoreAlbumReadingPosition(
      saved,
      { ...metadata, fingerprint: 'edited' },
      { second: 1100 },
    ),
  ).toBe(1100);
  expect(
    restoreAlbumReadingPosition(
      saved,
      { ...metadata, style: 'handmade' },
      anchors,
    ),
  ).toBe(900);
  expect(
    restoreAlbumReadingPosition(
      saved,
      { ...metadata, fingerprint: 'removed' },
      { first: 500 },
    ),
  ).toBe(0);
});
it('fingerprints full content without saving private text in position state', () => {
  const input = {
    album: { name: 'private title' },
    entries: [{ note: 'private text' }],
  } as unknown as AlbumLayoutInput;
  const hash = albumReadingFingerprint(input);
  expect(hash).toMatch(/^[a-f0-9]{64}$/);
  expect(
    albumReadingFingerprint({
      ...input,
      entries: [{ ...input.entries[0], note: 'changed' }],
    }),
  ).not.toBe(hash);
});
