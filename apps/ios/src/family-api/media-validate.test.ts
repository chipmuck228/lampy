import { createHash } from 'node:crypto';

import {
  MEDIA_MAX_BYTES,
  sampleAudioBytes,
  sampleJpegBytes,
  samplePngBytes,
  sha256MediaBytes,
} from './media-validate';

function patternedBytes(length: number) {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    bytes[i] = (i * 31 + 7) & 0xff;
  }
  return bytes;
}

function expectDigestMatchesNode(bytes: Uint8Array) {
  const js = Buffer.from(sha256MediaBytes(bytes), 'hex');
  const node = createHash('sha256').update(bytes).digest();
  expect(js.length).toBe(32);
  expect(node.length).toBe(32);
  for (let i = 0; i < 32; i += 1) {
    expect(js[i]).toBe(node[i]);
  }
}

describe('sha256MediaBytes', () => {
  it('matches Node crypto for the sample payloads', () => {
    for (const bytes of [sampleJpegBytes(), samplePngBytes(), sampleAudioBytes()]) {
      expectDigestMatchesNode(bytes);
    }
  });

  it('matches Node crypto across 64-byte block boundaries', () => {
    for (const length of [55, 56, 63, 64, 65, 127, 128, 129]) {
      expectDigestMatchesNode(patternedBytes(length));
    }
  });

  it('matches Node crypto near the 8 MiB media limit', () => {
    expectDigestMatchesNode(patternedBytes(MEDIA_MAX_BYTES - 1));
    expectDigestMatchesNode(patternedBytes(MEDIA_MAX_BYTES));
  });
});
