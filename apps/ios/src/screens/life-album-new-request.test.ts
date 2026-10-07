import { albumNewSourceKey, shouldApplyAlbumNewRequest } from './life-album-new-request';

describe('album new request eligibility', () => {
  it('accepts only the current request id', () => {
    expect(shouldApplyAlbumNewRequest({ requestId: 2, currentRequestId: 2 })).toBe(true);
    expect(shouldApplyAlbumNewRequest({ requestId: 1, currentRequestId: 2 })).toBe(false);
  });

  it('keys collect sources by intent and moment', () => {
    expect(albumNewSourceKey({ intentToken: 'ac1', momentParam: 'm1' })).toBe('ac1:m1');
    expect(albumNewSourceKey({})).toBe(':');
  });
});
