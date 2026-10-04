import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { LifeAlbumCollectSheet, shouldApplyCollectSheetResult } from './life-album-collect-sheet';

const mockCollect = jest.fn();
const mockCreate = jest.fn();
const mockList = jest.fn();
const mockContaining = jest.fn();

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    listAlbums: mockList,
    albumIdsContainingMoment: mockContaining,
    createAlbum: mockCreate,
    collectAlbumEntry: mockCollect,
  }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('life album collect sheet', () => {
  beforeEach(() => {
    mockList.mockResolvedValue({
      status: 'ready',
      albums: [
        {
          id: 'album_1',
          name: '一些日子',
          entryCount: 0,
          lastCollectedAt: null,
          lastCollectedLabel: null,
          cover: { kind: 'words' },
        },
      ],
    });
    mockContaining.mockResolvedValue([]);
    mockCreate.mockReset();
    mockCollect.mockReset();
  });

  it('keeps the album list scrollable and pins cancel', async () => {
    const view = await render(
      <LifeAlbumCollectSheet visible momentId="moment_ready" onClose={() => undefined} />,
    );
    await waitFor(() => {
      expect(view.getByTestId('life-album-collect-sheet-scroll')).toBeTruthy();
      expect(view.getByTestId('life-album-sheet-cancel')).toBeTruthy();
    });
  });

  it('does not close a reopened sheet from a cancelled save', async () => {
    const write = deferred<void>();
    mockCollect.mockReturnValue(write.promise);
    const onClose = jest.fn();
    const view = await render(
      <LifeAlbumCollectSheet visible momentId="moment_ready" onClose={onClose} />,
    );
    await waitFor(() => {
      expect(view.getByTestId('life-album-sheet-album_1')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-sheet-album_1'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-sheet-cancel'));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    onClose.mockClear();
    await act(async () => {
      view.rerender(
        <LifeAlbumCollectSheet visible={false} momentId="moment_ready" onClose={onClose} />,
      );
    });
    await act(async () => {
      view.rerender(
        <LifeAlbumCollectSheet visible momentId="moment_ready" onClose={onClose} />,
      );
    });
    await waitFor(() => {
      expect(view.getByTestId('life-album-sheet-album_1')).toBeTruthy();
    });
    await act(async () => {
      write.resolve();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('rejects a late result after the session changes', () => {
    expect(
      shouldApplyCollectSheetResult({ session: 1, currentSession: 2, cancelled: false }),
    ).toBe(false);
    expect(
      shouldApplyCollectSheetResult({ session: 2, currentSession: 2, cancelled: true }),
    ).toBe(false);
    expect(
      shouldApplyCollectSheetResult({ session: 2, currentSession: 2, cancelled: false }),
    ).toBe(true);
  });
});
