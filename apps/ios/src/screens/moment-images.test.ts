import { recentImageColumnWidth } from './life-page';
import { detailImageBands, momentImageAspectRatio, recentImageBands, shouldPairRecentImages } from './moment-images';
import type { ImageView } from '../application/use-cases';

function photo(id: string, width: number, height: number): ImageView {
  return {
    id,
    status: 'available',
    uri: `memory://assets/${id}.jpg`,
    width,
    height,
    label: id,
  };
}

function missingPortrait(id: string): ImageView {
  return {
    id,
    status: 'unavailable',
    width: 900,
    height: 1200,
    label: id,
    unavailableLabel: '这张照片暂时找不到了，但这条记录还在。',
  };
}

describe('moment image layout', () => {
  it('keeps the stored aspect ratio so portrait photos stay in document flow', () => {
    expect(momentImageAspectRatio({ width: 1200, height: 1600 })).toBe(0.75);
    expect(momentImageAspectRatio({ width: 1600, height: 900 })).toBeCloseTo(16 / 9);
  });

  it('does not invent a tall frame when size metadata is missing', () => {
    expect(momentImageAspectRatio({})).toBeCloseTo(4 / 3);
    expect(momentImageAspectRatio({ width: 0, height: 800 })).toBeCloseTo(4 / 3);
  });

  it('pairs two portrait photos and keeps landscape images full width', () => {
    expect(detailImageBands([photo('a', 900, 1200), photo('b', 800, 1200)])).toEqual([
      { kind: 'pair', images: [photo('a', 900, 1200), photo('b', 800, 1200)] },
    ]);
    expect(detailImageBands([photo('wide', 1600, 900), photo('also', 1400, 900)])).toEqual([
      { kind: 'solo', images: [photo('wide', 1600, 900)] },
      { kind: 'solo', images: [photo('also', 1400, 900)] },
    ]);
  });

  it('keeps the first of three photos full width and pairs the rest when both are portrait', () => {
    const one = photo('one', 1200, 1600);
    const two = photo('two', 900, 1200);
    const three = photo('three', 800, 1100);
    expect(detailImageBands([one, two, three])).toEqual([
      { kind: 'solo', images: [one] },
      { kind: 'pair', images: [two, three] },
    ]);
  });

  it('pairs recent portraits when the content column is wide enough', () => {
    expect(shouldPairRecentImages(345)).toBe(true);
    expect(shouldPairRecentImages(200)).toBe(false);
    expect(shouldPairRecentImages(recentImageColumnWidth(390, 844))).toBe(true);
    expect(shouldPairRecentImages(recentImageColumnWidth(320, 700))).toBe(false);
    expect(shouldPairRecentImages(recentImageColumnWidth(1024, 1366))).toBe(true);
  });

  it('does not pair when the page is wide but the content column is under 280', () => {
    const column = recentImageColumnWidth(768, 1024, 200, 200);
    expect(768).toBeGreaterThanOrEqual(280);
    expect(column).toBeLessThan(280);
    expect(shouldPairRecentImages(column)).toBe(false);
    expect(shouldPairRecentImages(recentImageColumnWidth(768, 1024))).toBe(true);
  });

  it('keeps recent image order and stacks when pairing is off', () => {
    const one = photo('one', 1200, 1600);
    const two = photo('two', 900, 1200);
    expect(recentImageBands([one, two], false)).toEqual([
      { kind: 'solo', images: [one] },
      { kind: 'solo', images: [two] },
    ]);
    expect(recentImageBands([one, two], true)).toEqual([{ kind: 'pair', images: [one, two] }]);
  });

  it('stacks a readable portrait and a missing portrait that still has size, in the same order', () => {
    const ready = photo('ready', 900, 1200);
    const gone = missingPortrait('gone');
    expect(detailImageBands([ready, gone])).toEqual([
      { kind: 'solo', images: [ready] },
      { kind: 'solo', images: [gone] },
    ]);
    expect(detailImageBands([gone, ready])).toEqual([
      { kind: 'solo', images: [gone] },
      { kind: 'solo', images: [ready] },
    ]);
  });
});
