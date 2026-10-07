import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';

import { ALBUM_LIST_GUIDE_SECURE_KEY } from '../infrastructure/album-list-guide-store';
import LifeAlbumListScreen from './life-album-list-screen';

const mockList = jest.fn();
const mockPush = jest.fn();
const mockDismissTo = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, dismissTo: mockDismissTo, back: jest.fn() }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require('react');
    useEffect(() => effect(), [effect]);
  },
  useLocalSearchParams: () => ({}),
}));

jest.mock('../application/container', () => ({
  getUseCases: () =>
    Promise.resolve({
      listAlbums: mockList,
    }),
}));

jest.mock('../infrastructure/family-config', () => ({
  isFamilyProductEntryOpen: () => false,
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-image', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return { Image: View };
});

function wrap() {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <LifeAlbumListScreen />
    </SafeAreaProvider>
  );
}

describe('life album list root', () => {
  beforeEach(() => {
    cleanup();
    mockPush.mockReset();
    mockDismissTo.mockReset();
    mockList.mockReset();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    Dimensions.set({
      window: { width: 390, height: 844, scale: 2, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 2, fontScale: 1 },
    });
  });

  afterEach(async () => {
    await act(async () => {
      await Promise.resolve();
    });
    cleanup();
  });

  it('renders a cover wall with image, words, and missing-uri fallback tiles', async () => {
    mockList.mockResolvedValue({
      status: 'ready',
      albums: [
        {
          id: 'album_photo',
          name: '有封面',
          entryCount: 3,
          lastCollectedAt: null,
          lastCollectedLabel: null,
          cover: { kind: 'image', momentId: 'm1', assetId: 'a1' },
          coverUri: 'file://cover.jpg',
        },
        {
          id: 'album_words',
          name: '文字封面册',
          entryCount: 1,
          lastCollectedAt: null,
          lastCollectedLabel: null,
          cover: { kind: 'words' },
          coverUri: null,
        },
        {
          id: 'album_missing',
          name: '封面缺失',
          entryCount: 2,
          lastCollectedAt: null,
          lastCollectedLabel: null,
          cover: { kind: 'image', momentId: 'm2', assetId: 'a2' },
          coverUri: null,
        },
      ],
    });
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByTestId('life-album-cover-wall')).toBeTruthy();
    });
    expect(view.getByTestId('life-album-tile-album_photo')).toBeTruthy();
    expect(view.getByTestId('life-album-words-cover-album_words')).toBeTruthy();
    expect(view.getByTestId('life-album-words-cover-album_missing')).toBeTruthy();
    expect(view.getByLabelText('有封面，3条')).toBeTruthy();
    expect(view.queryByTestId('recent-leave-fab')).toBeNull();
    expect(view.getByTestId('root-nav-here-wrap')).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-tile-album_photo'));
    });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/albums/[id]', params: { id: 'album_photo' } });
  });

  it('keeps one create action when empty and dismisses the guide persistently', async () => {
    mockList.mockResolvedValue({ status: 'ready', albums: [] });
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByTestId('life-album-list-empty')).toBeTruthy();
      expect(view.getByTestId('life-album-guide')).toBeTruthy();
    });
    expect(view.getAllByTestId('life-album-new')).toHaveLength(1);
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-guide-dismiss'));
    });
    await waitFor(() => {
      expect(view.queryByTestId('life-album-guide')).toBeNull();
      expect(view.getByTestId('life-album-guide-reopen')).toBeTruthy();
    });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(ALBUM_LIST_GUIDE_SECURE_KEY, 'dismissed');
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-guide-reopen'));
    });
    expect(view.getByTestId('life-album-guide')).toBeTruthy();
  });

  it('does not show a settings-style back control on the albums root', async () => {
    mockList.mockResolvedValue({ status: 'ready', albums: [] });
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByTestId('life-album-list')).toBeTruthy();
    });
    expect(view.getByTestId('home-lookback')).toBeTruthy();
    expect(view.queryByLabelText('本机设置')).toBeNull();
    expect(view.queryByTestId('settings-back')).toBeNull();
    expect(view.queryByTestId('settings-page-back')).toBeNull();
  });
});
