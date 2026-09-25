import { createHash } from 'node:crypto';

import { sampleAudioBytes, sampleJpegBytes, samplePngBytes, sha256MediaBytes } from './media-validate';

describe('sha256MediaBytes', () => {
  it('matches Node crypto for the sample payloads', () => {
    for (const bytes of [sampleJpegBytes(), samplePngBytes(), sampleAudioBytes()]) {
      expect(sha256MediaBytes(bytes)).toBe(createHash('sha256').update(bytes).digest('hex'));
    }
  });
});
