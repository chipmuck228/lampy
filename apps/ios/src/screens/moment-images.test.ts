import { momentImageAspectRatio } from './moment-images';

describe('moment image layout', () => {
  it('keeps the stored aspect ratio so portrait photos stay in document flow', () => {
    expect(momentImageAspectRatio({ width: 1200, height: 1600 })).toBe(0.75);
    expect(momentImageAspectRatio({ width: 1600, height: 900 })).toBeCloseTo(16 / 9);
  });

  it('does not invent a tall frame when size metadata is missing', () => {
    expect(momentImageAspectRatio({})).toBeCloseTo(4 / 3);
    expect(momentImageAspectRatio({ width: 0, height: 800 })).toBeCloseTo(4 / 3);
  });
});
