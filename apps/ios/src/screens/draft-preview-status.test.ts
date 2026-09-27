import { draftPreviewStatus } from './moment-audio';

describe('draftPreviewStatus', () => {
  it('keeps an unbound interrupted clip idle instead of finished', () => {
    expect(draftPreviewStatus('finished', false, 'asset_kept', null)).toBe('idle');
    expect(draftPreviewStatus('finished', false, 'asset_kept', 'asset_old')).toBe('idle');
    expect(draftPreviewStatus('playing', false, 'asset_kept', null)).toBe('idle');
  });

  it('follows the player only after this clip was asked to play', () => {
    expect(draftPreviewStatus('playing', false, 'asset_kept', 'asset_kept')).toBe('playing');
    expect(draftPreviewStatus('paused', false, 'asset_kept', 'asset_kept')).toBe('paused');
    expect(draftPreviewStatus('finished', false, 'asset_kept', 'asset_kept')).toBe('finished');
    expect(draftPreviewStatus('paused', true, 'asset_kept', 'asset_kept')).toBe('unavailable');
  });
});
