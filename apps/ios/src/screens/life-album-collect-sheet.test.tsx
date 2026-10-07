import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { LifeAlbumCollectSheet, shouldApplyCollectSheetResult } from './life-album-collect-sheet';

const mockCollect = jest.fn();
const mockCreate = jest.fn();
const mockList = jest.fn();
const mockContaining = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    listAlbums: mockList,
    albumIdsContainingMoment: mockContaining,
    createAlbum: mockCreate,
    collectAlbumEntry: mockCollect,
  }),
}));

jest.mock('expo-image', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return { Image: View };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

const albumRow = {
  id: 'album_1',
  name: '一些日子',
  entryCount: 2,
  lastCollectedAt: null,
  lastCollectedLabel: null,
  cover: { kind: 'words' as const },
  coverUri: null,
};

describe('life album collect sheet', () => {
  beforeEach(() => {
    mockList.mockResolvedValue({
      status: 'ready',
      albums: [albumRow],
    });
    mockContaining.mockResolvedValue([]);
    mockCreate.mockReset();
    mockCollect.mockReset();
    mockPush.mockReset();
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

  it('renders a cover wall with join action and words fallback', async () => {
    const view = await render(
      <LifeAlbumCollectSheet visible momentId="moment_ready" onClose={() => undefined} />,
    );
    await waitFor(() => {
      expect(view.getByTestId('life-album-collect-cover-wall')).toBeTruthy();
      expect(view.getByTestId('life-album-sheet-words-cover-album_1')).toBeTruthy();
      expect(view.getByTestId('life-album-sheet-album_1')).toBeTruthy();
    });
    expect(view.getAllByLabelText('一些日子，2条，加入此册').length).toBeGreaterThanOrEqual(1);
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

  it('joins an existing album without creating one', async () => {
    const view = await render(
      <LifeAlbumCollectSheet visible momentId="moment_ready" onClose={() => undefined} />,
    );
    await waitFor(() => {
      expect(view.getByTestId('life-album-sheet-album_1')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-sheet-album_1'));
    });
    await waitFor(() => {
      expect(mockCollect).toHaveBeenCalledWith({ albumId: 'album_1', momentId: 'moment_ready' });
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('collects from the cover tile through the same path without double submit', async () => {
    const write = deferred<void>();
    mockCollect.mockReturnValue(write.promise);
    const view = await render(
      <LifeAlbumCollectSheet visible momentId="moment_ready" onClose={() => undefined} />,
    );
    await waitFor(() => {
      expect(view.getByTestId('life-album-sheet-tile-album_1')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-sheet-tile-album_1'));
      fireEvent.press(view.getByTestId('life-album-sheet-album_1'));
    });
    expect(mockCollect).toHaveBeenCalledTimes(1);
    await act(async () => {
      write.resolve();
    });
    await waitFor(() => {
      expect(view.getByTestId('life-album-sheet-status-album_1')).toBeTruthy();
      expect(view.getByText('已收下')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-sheet-tile-album_1'));
    });
    expect(mockCollect).toHaveBeenCalledTimes(1);
  });

  it('opens the named create screen instead of creating from the sheet', async () => {
    const onClose = jest.fn();
    const view = await render(
      <LifeAlbumCollectSheet visible momentId="moment_ready" onClose={onClose} />,
    );
    await waitFor(() => {
      expect(view.getByTestId('life-album-sheet-create')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-sheet-create'));
    });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockCollect).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/albums/new');
  });

  it('closes from the mask without collecting', async () => {
    const onClose = jest.fn();
    const view = await render(
      <LifeAlbumCollectSheet visible momentId="moment_ready" onClose={onClose} />,
    );
    await waitFor(() => {
      expect(view.getByTestId('life-album-sheet-mask')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-sheet-mask'));
    });
    expect(onClose).toHaveBeenCalled();
    expect(mockCollect).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
