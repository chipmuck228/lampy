import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions, ScrollView } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';

import { ALBUM_GUIDE_PERSIST_FAILED } from '../application/life-album';
import { ALBUM_LIST_GUIDE_SECURE_KEY } from '../infrastructure/album-list-guide-store';
import {
  peekAlbumListScroll,
  rememberAlbumListScroll,
  resetAlbumListScrollForTests,
} from './album-list-session';
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

const sampleAlbums = [
  {
    id: 'album_photo',
    name: '有封面',
    entryCount: 3,
    lastCollectedAt: null,
    lastCollectedLabel: null,
    cover: { kind: 'image' as const, momentId: 'm1', assetId: 'a1' },
    coverUri: 'file://cover.jpg',
  },
  {
    id: 'album_words',
    name: '文字封面册',
    entryCount: 1,
    lastCollectedAt: null,
    lastCollectedLabel: null,
    cover: { kind: 'words' as const },
    coverUri: null,
  },
  {
    id: 'album_missing',
    name: '封面缺失',
    entryCount: 2,
    lastCollectedAt: null,
    lastCollectedLabel: null,
    cover: { kind: 'image' as const, momentId: 'm2', assetId: 'a2' },
    coverUri: null,
  },
];

describe('life album list root', () => {
  beforeEach(() => {
    cleanup();
    mockPush.mockReset();
    mockDismissTo.mockReset();
    mockList.mockReset();
    resetAlbumListScrollForTests();
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
    mockList.mockResolvedValue({ status: 'ready', albums: sampleAlbums });
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

  it('shows the guide when isDismissed fails and still loads the wall', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(new Error('secure unavailable'));
    mockList.mockResolvedValue({ status: 'ready', albums: sampleAlbums });
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByTestId('life-album-guide')).toBeTruthy();
      expect(view.getByTestId('life-album-cover-wall')).toBeTruthy();
    });
  });

  it('keeps in-session dismiss when markDismissed fails and shows a short tip', async () => {
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValue(new Error('write failed'));
    mockList.mockResolvedValue({ status: 'ready', albums: [] });
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByTestId('life-album-guide')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-guide-dismiss'));
    });
    await waitFor(() => {
      expect(view.queryByTestId('life-album-guide')).toBeNull();
      expect(view.getByTestId('life-album-guide-persist-hint')).toBeTruthy();
    });
    expect(view.getByText(ALBUM_GUIDE_PERSIST_FAILED)).toBeTruthy();
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

  it('restores scroll after loading and guide settle; ignores early content size', async () => {
    rememberAlbumListScroll(240);
    const scrollTo = jest.fn();
    const spy = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(scrollTo);
    let resolveList!: (value: { status: 'ready'; albums: typeof sampleAlbums }) => void;
    mockList.mockReturnValue(
      new Promise((resolve) => {
        resolveList = resolve;
      }),
    );
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('dismissed');
    const view = await render(wrap());
    const scroll = view.getByTestId('life-album-list-scroll');

    await act(async () => {
      fireEvent(scroll, 'contentSizeChange', 390, 120);
    });
    expect(scrollTo).not.toHaveBeenCalled();
    expect(peekAlbumListScroll()).toBe(240);

    await act(async () => {
      fireEvent(scroll, 'scroll', {
        nativeEvent: { contentOffset: { y: 0 }, contentSize: { height: 120 }, layoutMeasurement: { height: 600 } },
      });
    });
    expect(peekAlbumListScroll()).toBe(240);

    await act(async () => {
      resolveList({ status: 'ready', albums: sampleAlbums });
    });
    await waitFor(() => {
      expect(view.getByTestId('life-album-cover-wall')).toBeTruthy();
    });

    await act(async () => {
      fireEvent(scroll, 'layout', { nativeEvent: { layout: { width: 390, height: 600 } } });
      fireEvent(scroll, 'contentSizeChange', 390, 1200);
    });

    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith({ y: 240, animated: false });
    });
    spy.mockRestore();
  });

  it('cancels pending restore when the user begins dragging', async () => {
    rememberAlbumListScroll(180);
    const scrollTo = jest.fn();
    const spy = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(scrollTo);
    mockList.mockResolvedValue({ status: 'ready', albums: sampleAlbums });
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('dismissed');
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByTestId('life-album-cover-wall')).toBeTruthy();
    });
    const scroll = view.getByTestId('life-album-list-scroll');

    await act(async () => {
      fireEvent(scroll, 'scrollBeginDrag');
      fireEvent(scroll, 'layout', { nativeEvent: { layout: { width: 390, height: 600 } } });
      fireEvent(scroll, 'contentSizeChange', 390, 1200);
    });

    expect(scrollTo).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not re-yank after a successful restore when content sizes again', async () => {
    rememberAlbumListScroll(200);
    const scrollTo = jest.fn();
    const spy = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(scrollTo);
    mockList.mockResolvedValue({ status: 'ready', albums: sampleAlbums });
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('dismissed');
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByTestId('life-album-cover-wall')).toBeTruthy();
    });
    const scroll = view.getByTestId('life-album-list-scroll');

    await act(async () => {
      fireEvent(scroll, 'layout', { nativeEvent: { layout: { width: 390, height: 600 } } });
      fireEvent(scroll, 'contentSizeChange', 390, 1200);
    });
    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      fireEvent(scroll, 'contentSizeChange', 390, 1300);
    });
    expect(scrollTo).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
