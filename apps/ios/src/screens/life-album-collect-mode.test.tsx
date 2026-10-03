import type { ReactElement } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LookbackIndexScreen from '../app/lookback/index';
import { ApplicationError } from '../application/errors';
import { resetLookbackSessionForTests } from '../application/lookback-session';

const mockGetLookbackBook = jest.fn();
const mockGetHistoryMonth = jest.fn();
const mockGetHistoryDay = jest.fn();
const mockGetAlbum = jest.fn();
const mockCollect = jest.fn();
const mockWithdraw = jest.fn();
const mockSetParams = jest.fn();
const mockPlay = jest.fn();
const mockPause = jest.fn(async () => undefined);
const mockCard = jest.fn(() => ({ status: 'paused' as const, currentTimeMs: 900 }));

let mockSearchParams: { o?: string; collect?: string } = {};
const mockSearchListeners = new Set<() => void>();
const mockFocusListeners = new Set<() => void>();

function setMockSearchParams(next: { o?: string; collect?: string }) {
  mockSearchParams = next;
  mockSearchListeners.forEach((listener) => listener());
}

function emitLookbackFocus() {
  mockFocusListeners.forEach((listener) => listener());
}

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect, useState } = require('react');
  return {
    useRouter: () => ({
      push: jest.fn(),
      back: jest.fn(),
      replace: jest.fn(),
      dismissTo: jest.fn(),
      setParams: mockSetParams,
    }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(() => {
        let cleanup = effect();
        const onFocus = () => {
          if (typeof cleanup === 'function') cleanup();
          cleanup = effect();
        };
        mockFocusListeners.add(onFocus);
        return () => {
          mockFocusListeners.delete(onFocus);
          if (typeof cleanup === 'function') cleanup();
        };
      }, [effect]);
    },
    useLocalSearchParams: () => {
      const [params, setParams] = useState(mockSearchParams);
      useEffect(() => {
        const sync = () => setParams(mockSearchParams);
        mockSearchListeners.add(sync);
        return () => {
          mockSearchListeners.delete(sync);
        };
      }, []);
      return params;
    },
    useNavigation: () => ({
      getState: () => ({ index: 0, routes: [{ name: 'lookback/index' }] }),
      addListener: () => () => undefined,
    }),
  };
});

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    getLookbackBook: mockGetLookbackBook,
    getHistoryMonth: mockGetHistoryMonth,
    getHistoryDay: mockGetHistoryDay,
    getHistoryUnknown: async () => ({ items: [], hasMore: false, title: '', explanation: '' }),
    getHistoryYearUnconfirmed: async () => ({ items: [], hasMore: false, title: '', explanation: '' }),
    getHistoryMonthUnconfirmed: async () => ({ items: [], hasMore: false, title: '', explanation: '' }),
    getAlbum: mockGetAlbum,
    collectAlbumEntry: mockCollect,
    withdrawAlbumEntry: mockWithdraw,
  }),
}));

jest.mock('./use-recent-clip-playback', () => ({
  useRecentClipPlayback: () => ({
    card: mockCard,
    play: mockPlay,
    pause: mockPause,
  }),
}));

function wrap(ui: ReactElement) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      {ui}
    </SafeAreaProvider>
  );
}

function momentItem(id: string, note: string) {
  return {
    id,
    note,
    precision: 'day' as const,
    timeLabel: '2026年9月28日',
    usedRecordedAtFallback: false,
    feeling: null,
    images: [],
    audio: {
      id: `asset-${id}`,
      status: 'available' as const,
      uri: `memory://${id}.m4a`,
      durationMs: 4000,
      label: '一段声音',
    },
    unknownMedia: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function albumView(id: string, name: string, momentIds: string[] = []) {
  return {
    album: {
      id,
      name,
      opening: null,
      cover: { kind: 'words' as const },
      entries: momentIds.map((momentId) => ({
        momentId,
        collectedAt: '2026-10-03T00:00:00.000Z',
        sourceRevisionAtCollect: 1,
      })),
      createdAt: '2026-10-03T00:00:00.000Z',
      updatedAt: '2026-10-03T00:00:00.000Z',
      schemaVersion: 1,
    },
    entries: [],
    coverCandidates: [],
  };
}

function armBook() {
  mockGetLookbackBook.mockResolvedValue({
    unknownCount: 0,
    isEmpty: false,
    years: [
      {
        year: 2026,
        momentCount: 1,
        title: '2026年',
        yearUnconfirmedCount: 0,
        yearUnconfirmedLabel: '这一年，月份未确认',
        months: [{ month: 9, label: '9月', count: 1, summary: '有1条记录' }],
      },
    ],
  });
  mockGetHistoryMonth.mockResolvedValue({
    year: 2026,
    month: 9,
    title: '2026年9月',
    dayUnconfirmedCount: 0,
    dayUnconfirmedLabel: '日子未确认',
    isEmpty: false,
    days: [{ day: 28, label: '9月28日', count: 1, status: 'filled', summary: '有1条记录' }],
  });
  mockGetHistoryDay.mockResolvedValue({
    year: 2026,
    month: 9,
    day: 28,
    title: '2026年9月28日',
    isEmpty: false,
    items: [momentItem('m28', '二十八')],
    hasMore: false,
    totalCount: 1,
  });
  mockGetAlbum.mockResolvedValue(albumView('album_1', '一些日子'));
}

describe('lookback collect mode', () => {
  afterEach(async () => {
    await act(async () => {
      await Promise.resolve();
    });
    cleanup();
  });

  beforeEach(() => {
    cleanup();
    mockSearchListeners.clear();
    mockFocusListeners.clear();
    mockSearchParams = { o: 'lb-keep', collect: 'album_1' };
    mockGetLookbackBook.mockReset();
    mockGetHistoryMonth.mockReset();
    mockGetHistoryDay.mockReset();
    mockGetAlbum.mockReset();
    mockCollect.mockReset();
    mockWithdraw.mockReset();
    mockSetParams.mockReset();
    mockPlay.mockClear();
    mockPause.mockClear();
    mockCard.mockClear();
    resetLookbackSessionForTests();
    Dimensions.set({
      window: { width: 390, height: 844, scale: 2, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 2, fontScale: 1 },
    });
    armBook();
  });

  it('collects and withdraws without reloading the book', async () => {
    mockCollect.mockResolvedValue({
      album: {
        id: 'album_1',
        name: '一些日子',
        entries: [{ momentId: 'm28', collectedAt: '2026-10-03T00:00:00.000Z', sourceRevisionAtCollect: 1 }],
      },
      inserted: true,
      alreadyCollected: false,
    });
    mockWithdraw.mockResolvedValue({
      album: { id: 'album_1', name: '一些日子', entries: [] },
    });
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByTestId('life-album-collect-banner')).toBeTruthy();
      expect(view.getByText('正在收进《一些日子》')).toBeTruthy();
      expect(view.getByTestId('lookback-reading-m28')).toBeTruthy();
    });
    const bookCalls = mockGetLookbackBook.mock.calls.length;
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-collect-m28'));
    });
    await waitFor(() => {
      expect(view.getByLabelText('已收下')).toBeTruthy();
    });
    expect(mockCollect).toHaveBeenCalledWith({ albumId: 'album_1', momentId: 'm28' });
    expect(mockGetLookbackBook.mock.calls.length).toBe(bookCalls);
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-collect-m28'));
    });
    await waitFor(() => {
      expect(view.getByLabelText('收进这一册')).toBeTruthy();
    });
    expect(mockWithdraw).toHaveBeenCalledWith({ albumId: 'album_1', momentId: 'm28' });
    fireEvent.press(view.getByTestId('life-album-collect-exit'));
    expect(mockSetParams).toHaveBeenCalledWith({ collect: undefined, o: 'lb-keep' });
  });

  it('shows collected after returning from detail collect and still reads the latest day', async () => {
    mockWithdraw.mockResolvedValue({
      album: { id: 'album_1', name: '一些日子', entries: [] },
    });
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByText('正在收进《一些日子》')).toBeTruthy();
      expect(view.getByLabelText('收进这一册')).toBeTruthy();
      expect(view.getByTestId('lookback-reading-m28')).toBeTruthy();
    });
    const bookCalls = mockGetLookbackBook.mock.calls.length;
    const dayCalls = mockGetHistoryDay.mock.calls.length;
    mockGetAlbum.mockResolvedValue(albumView('album_1', '一些日子', ['m28']));
    await act(async () => {
      emitLookbackFocus();
    });
    await waitFor(() => {
      expect(view.getByLabelText('已收下')).toBeTruthy();
    });
    expect(view.getByTestId('lookback-reading-m28')).toBeTruthy();
    expect(mockGetLookbackBook.mock.calls.length).toBeGreaterThan(bookCalls);
    expect(mockGetHistoryDay.mock.calls.length).toBeGreaterThan(dayCalls);
    expect(mockCollect).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-collect-m28'));
    });
    await waitFor(() => {
      expect(view.getByLabelText('收进这一册')).toBeTruthy();
    });
    expect(mockWithdraw).toHaveBeenCalledTimes(1);
    expect(mockWithdraw).toHaveBeenCalledWith({ albumId: 'album_1', momentId: 'm28' });
    expect(mockCollect).not.toHaveBeenCalled();
  });

  it('does not let a stale album read overwrite a newer collect', async () => {
    const staleRead = deferred<ReturnType<typeof albumView>>();
    mockCollect.mockResolvedValue({
      album: {
        id: 'album_1',
        name: '一些日子',
        entries: [{ momentId: 'm28', collectedAt: '2026-10-03T00:00:00.000Z', sourceRevisionAtCollect: 1 }],
      },
      inserted: true,
      alreadyCollected: false,
    });
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByLabelText('收进这一册')).toBeTruthy();
    });
    mockGetAlbum.mockImplementation(() => staleRead.promise);
    await act(async () => {
      emitLookbackFocus();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-collect-m28'));
    });
    await waitFor(() => {
      expect(view.getByLabelText('已收下')).toBeTruthy();
    });
    await act(async () => {
      staleRead.resolve(albumView('album_1', '一些日子'));
    });
    expect(view.getByLabelText('已收下')).toBeTruthy();
    expect(mockCollect).toHaveBeenCalledWith({ albumId: 'album_1', momentId: 'm28' });
  });

  it('hides collect actions while the catalog is open', async () => {
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByTestId('life-album-collect-banner')).toBeTruthy();
      expect(view.getByTestId('lookback-reading-m28')).toBeTruthy();
      expect(view.getByTestId('life-album-collect-m28')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-catalog-toggle'));
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-catalog')).toBeTruthy();
    });
    expect(view.queryByTestId('lookback-life-album')).toBeNull();
    expect(view.queryByTestId('life-album-collect-m28')).toBeNull();
    expect(view.getByTestId('lookback-reading-m28')).toBeTruthy();
  });

  it('leaves a missing album without trapping lookback', async () => {
    mockGetAlbum.mockRejectedValue(
      new ApplicationError('ALBUM_NOT_FOUND', '这一册已经不在。原来的记录还在。'),
    );
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByText('这一册已经不在。原来的记录还在。')).toBeTruthy();
    });
    expect(view.getByTestId('lookback-reading-m28')).toBeTruthy();
    fireEvent.press(view.getByTestId('life-album-collect-exit'));
    expect(mockSetParams).toHaveBeenCalledWith({ collect: undefined, o: 'lb-keep' });
  });

  it('does not use album A collected state after switching to B', async () => {
    const loadB = deferred<ReturnType<typeof albumView>>();
    mockGetAlbum.mockImplementation((id: string) => {
      if (id === 'album_a') return Promise.resolve(albumView('album_a', '春天', ['m28']));
      if (id === 'album_b') return loadB.promise;
      return Promise.reject(new Error(id));
    });
    mockCollect.mockResolvedValue({
      album: {
        id: 'album_b',
        name: '夏天',
        entries: [{ momentId: 'm28', collectedAt: '2026-10-03T00:00:00.000Z', sourceRevisionAtCollect: 1 }],
      },
      inserted: true,
      alreadyCollected: false,
    });
    setMockSearchParams({ o: 'lb-keep', collect: 'album_a' });
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByText('正在收进《春天》')).toBeTruthy();
      expect(view.getByLabelText('已收下')).toBeTruthy();
    });
    await act(async () => {
      setMockSearchParams({ o: 'lb-keep', collect: 'album_b' });
    });
    expect(view.queryByTestId('life-album-collect-m28')).toBeNull();
    await act(async () => {
      loadB.resolve(albumView('album_b', '夏天'));
    });
    await waitFor(() => {
      expect(view.getByText('正在收进《夏天》')).toBeTruthy();
      expect(view.getByLabelText('收进这一册')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-collect-m28'));
    });
    await waitFor(() => {
      expect(mockCollect).toHaveBeenCalledWith({ albumId: 'album_b', momentId: 'm28' });
    });
    expect(mockWithdraw).not.toHaveBeenCalled();
  });

  it('reloads album A after A to B to A without keeping B', async () => {
    const loadB = deferred<ReturnType<typeof albumView>>();
    mockGetAlbum.mockImplementation((id: string) => {
      if (id === 'album_a') return Promise.resolve(albumView('album_a', '春天', ['m28']));
      if (id === 'album_b') return loadB.promise;
      return Promise.reject(new Error(id));
    });
    setMockSearchParams({ o: 'lb-keep', collect: 'album_a' });
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByText('正在收进《春天》')).toBeTruthy();
      expect(view.getByLabelText('已收下')).toBeTruthy();
    });
    await act(async () => {
      setMockSearchParams({ o: 'lb-keep', collect: 'album_b' });
    });
    expect(view.queryByTestId('life-album-collect-m28')).toBeNull();
    await act(async () => {
      setMockSearchParams({ o: 'lb-keep', collect: 'album_a' });
    });
    await act(async () => {
      loadB.resolve(albumView('album_b', '夏天'));
    });
    await waitFor(() => {
      expect(view.getByText('正在收进《春天》')).toBeTruthy();
      expect(view.getByLabelText('已收下')).toBeTruthy();
    });
    expect(view.queryByText('正在收进《夏天》')).toBeNull();
  });

  it('ignores a late collect result after the target album changed', async () => {
    const writeA = deferred<{
      album: { id: string; name: string; entries: { momentId: string }[] };
    }>();
    mockGetAlbum.mockImplementation(async (id: string) => {
      if (id === 'album_a') return albumView('album_a', '春天');
      if (id === 'album_b') return albumView('album_b', '夏天');
      throw new Error(id);
    });
    mockCollect.mockImplementation((input: { albumId: string }) => {
      if (input.albumId === 'album_a') return writeA.promise;
      return Promise.resolve({
        album: {
          id: 'album_b',
          name: '夏天',
          entries: [{ momentId: 'm28', collectedAt: '2026-10-03T00:00:00.000Z', sourceRevisionAtCollect: 1 }],
        },
        inserted: true,
        alreadyCollected: false,
      });
    });
    setMockSearchParams({ o: 'lb-keep', collect: 'album_a' });
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByText('正在收进《春天》')).toBeTruthy();
      expect(view.getByTestId('life-album-collect-m28')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-collect-m28'));
    });
    await act(async () => {
      setMockSearchParams({ o: 'lb-keep', collect: 'album_b' });
    });
    await waitFor(() => {
      expect(view.getByText('正在收进《夏天》')).toBeTruthy();
      expect(view.getByLabelText('收进这一册')).toBeTruthy();
    });
    await act(async () => {
      writeA.resolve({
        album: {
          id: 'album_a',
          name: '春天',
          entries: [{ momentId: 'm28' }],
        },
      });
    });
    expect(view.getByLabelText('收进这一册')).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByTestId('life-album-collect-m28'));
    });
    await waitFor(() => {
      expect(mockCollect).toHaveBeenCalledWith({ albumId: 'album_b', momentId: 'm28' });
    });
  });
});
