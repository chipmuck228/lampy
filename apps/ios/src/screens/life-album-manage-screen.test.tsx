import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LifeAlbumManageScreen from './life-album-manage-screen';

const mockPush = jest.fn();
const mockGetAlbum = jest.fn();
const mockUpdate = jest.fn();
const mockSetCover = jest.fn();
const mockMove = jest.fn();
const mockWithdraw = jest.fn();
const mockDelete = jest.fn();

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    useRouter: () => ({
      dismissTo: jest.fn(),
      push: mockPush,
    }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(effect, [effect]);
    },
    useLocalSearchParams: () => ({ id: 'album_1' }),
  };
});

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    getAlbum: mockGetAlbum,
    updateAlbum: mockUpdate,
    setAlbumCover: mockSetCover,
    moveAlbumEntry: mockMove,
    withdrawAlbumEntry: mockWithdraw,
    deleteAlbum: mockDelete,
  }),
}));

function wrap() {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <LifeAlbumManageScreen />
    </SafeAreaProvider>
  );
}

function manageView() {
  return {
    album: {
      id: 'album_1',
      name: '一些日子',
      opening: null,
      cover: { kind: 'words' as const },
      entries: [
        { momentId: 'm1', collectedAt: '2026-10-03T00:00:00.000Z', sourceRevisionAtCollect: 1 },
      ],
      createdAt: '2026-10-03T00:00:00.000Z',
      updatedAt: '2026-10-03T00:00:00.000Z',
      schemaVersion: 1,
    },
    entries: [
      {
        momentId: 'm1',
        collectedAt: '2026-10-03T00:00:00.000Z',
        sourceRevisionAtCollect: 1,
        source: 'ready' as const,
        noteExcerpt: '门口的风',
        dateLabel: '2026年10月1日',
        mediaHint: '有照片',
        photoCount: 1,
        hasAudio: false,
        unknownCount: 0,
        audioDurationMs: null,
        thumbnailUri: 'file://photo.jpg',
        occurredSortKey: Date.parse('2026-10-01T00:00:00.000Z'),
      },
    ],
    coverCandidates: [
      {
        momentId: 'm1',
        assetId: 'asset_missing',
        available: false,
      },
    ],
  };
}

describe('life album manage screen', () => {
  afterEach(async () => {
    await act(async () => {
      await Promise.resolve();
    });
    cleanup();
  });

  beforeEach(() => {
    cleanup();
    mockPush.mockReset();
    mockUpdate.mockReset();
    mockSetCover.mockReset();
    mockMove.mockReset();
    mockWithdraw.mockReset();
    mockDelete.mockReset();
    mockGetAlbum.mockResolvedValue(manageView());
    mockUpdate.mockResolvedValue({
      ...manageView(),
      album: { ...manageView().album, name: '改过的名字' },
    });
    mockSetCover.mockResolvedValue(manageView());
  });

  it('shows the original note excerpt, date, and media hint', async () => {
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByTestId('life-album-entry-note-m1')).toBeTruthy();
    });
    expect(view.getByText('门口的风')).toBeTruthy();
    expect(view.getByText('2026年10月1日')).toBeTruthy();
    expect(view.getByTestId('life-album-preview-open')).toBeTruthy();
    expect(view.queryByTestId('life-album-manage-name')).toBeNull();
    expect(view.queryByTestId('life-album-move-up-m1')).toBeNull();
    expect(view.queryByText('删除这一册')).toBeNull();
    expect(view.getByText('1条 · 2026年10月1日')).toBeTruthy();
  });

  it('keeps an unsaved opening after cover and rename', async () => {
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByTestId('life-album-edit')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('life-album-preview-open'));
    expect(mockPush).toHaveBeenCalledWith('/albums/album_1/preview');
    fireEvent.press(view.getByTestId('life-album-entry-open-m1'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/moment/[id]', params: { id: 'm1' } });
    fireEvent.press(view.getByTestId('life-album-edit'));
    fireEvent.press(view.getByTestId('life-album-organize'));
    await waitFor(() => {
      expect(view.getByTestId('life-album-manage-opening')).toBeTruthy();
      expect(view.getByTestId('life-album-cover-words')).toBeTruthy();
      expect(view.getByTestId('life-album-move-up-m1')).toBeTruthy();
    });
    expect(view.getByText('这张照片现在看不到')).toBeTruthy();
    fireEvent.press(view.getByTestId('life-album-cover-asset_missing'));
    expect(mockSetCover).not.toHaveBeenCalled();
    expect(view.getByTestId('life-album-move-up-m1').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    fireEvent.press(view.getByTestId('life-album-move-up-m1'));
    expect(mockMove).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-cover-words'));
    });
    await waitFor(() => {
      expect(mockSetCover).toHaveBeenCalled();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-manage-save-name'));
    });
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled();
    });
  });
});
