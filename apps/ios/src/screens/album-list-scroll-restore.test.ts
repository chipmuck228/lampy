import {
  albumListRestoreScrollY,
  albumListScrollRestoreReady,
  albumListShouldRecordScrollOffset,
  clampAlbumListScrollY,
} from './album-list-scroll-restore';

describe('album list scroll restore', () => {
  it('waits until list ready, guide ready, and content sized', () => {
    expect(
      albumListScrollRestoreReady({
        listReady: false,
        guideReady: true,
        contentSized: true,
        contentHeight: 800,
      }),
    ).toBe(false);
    expect(
      albumListScrollRestoreReady({
        listReady: true,
        guideReady: false,
        contentSized: true,
        contentHeight: 800,
      }),
    ).toBe(false);
    expect(
      albumListScrollRestoreReady({
        listReady: true,
        guideReady: true,
        contentSized: false,
        contentHeight: 800,
      }),
    ).toBe(false);
    expect(
      albumListScrollRestoreReady({
        listReady: true,
        guideReady: true,
        contentSized: true,
        contentHeight: 800,
      }),
    ).toBe(true);
  });

  it('does not record offsets while restore is pending or list is loading', () => {
    expect(
      albumListShouldRecordScrollOffset({ restorePending: true, listLoading: false, offsetY: 0 }),
    ).toBe(false);
    expect(
      albumListShouldRecordScrollOffset({ restorePending: false, listLoading: true, offsetY: 0 }),
    ).toBe(false);
    expect(
      albumListShouldRecordScrollOffset({ restorePending: false, listLoading: false, offsetY: 120 }),
    ).toBe(true);
  });

  it('clamps restore into the legal range when content shortens', () => {
    expect(clampAlbumListScrollY(900, 500, 400)).toBe(100);
    expect(clampAlbumListScrollY(50, 500, 400)).toBe(50);
    expect(clampAlbumListScrollY(10, 300, 400)).toBe(0);
  });

  it('restores only after gates pass; skips when saved Y is zero', () => {
    expect(
      albumListRestoreScrollY({
        restorePending: true,
        savedY: 220,
        listReady: false,
        guideReady: true,
        contentSized: true,
        contentHeight: 1000,
        viewportHeight: 600,
      }).action,
    ).toBe('wait');

    expect(
      albumListRestoreScrollY({
        restorePending: true,
        savedY: 220,
        listReady: true,
        guideReady: true,
        contentSized: true,
        contentHeight: 1000,
        viewportHeight: 600,
      }),
    ).toEqual({ action: 'restore', y: 220 });

    expect(
      albumListRestoreScrollY({
        restorePending: true,
        savedY: 0,
        listReady: true,
        guideReady: true,
        contentSized: true,
        contentHeight: 1000,
        viewportHeight: 600,
      }).action,
    ).toBe('skip');

    expect(
      albumListRestoreScrollY({
        restorePending: false,
        savedY: 220,
        listReady: true,
        guideReady: true,
        contentSized: true,
        contentHeight: 1000,
        viewportHeight: 600,
      }).action,
    ).toBe('skip');
  });

  it('clamps a restore when the page became shorter', () => {
    expect(
      albumListRestoreScrollY({
        restorePending: true,
        savedY: 800,
        listReady: true,
        guideReady: true,
        contentSized: true,
        contentHeight: 500,
        viewportHeight: 400,
      }),
    ).toEqual({ action: 'restore', y: 100 });
  });
});
