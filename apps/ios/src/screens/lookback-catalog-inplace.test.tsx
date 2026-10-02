import type { ReactElement } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LookbackIndexScreen from '../app/lookback/index';
import { resetLookbackSessionForTests } from '../application/lookback-session';

const mockGetLookbackBook = jest.fn();
const mockGetHistoryMonth = jest.fn();
const mockGetHistoryDay = jest.fn();
const mockPlay = jest.fn();
const mockPause = jest.fn(async () => undefined);
const mockCard = jest.fn(() => ({ status: 'paused' as const, currentTimeMs: 1200 }));

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    useRouter: () => ({
      push: jest.fn(),
      back: jest.fn(),
      replace: jest.fn(),
      dismissTo: jest.fn(),
    }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(effect, [effect]);
    },
    useLocalSearchParams: () => ({}),
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

function momentItem(id: string, note: string, day = 27) {
  return {
    id,
    note,
    precision: 'day' as const,
    timeLabel: `2026年9月${day}日`,
    usedRecordedAtFallback: false,
    feeling: null,
    images: [],
    audio: { id: `asset-${id}`, status: 'available' as const, uri: `memory://${id}.m4a`, durationMs: 4000, label: '一段声音' },
    unknownMedia: [],
  };
}

function armBook() {
  mockGetLookbackBook.mockResolvedValue({
    unknownCount: 0,
    isEmpty: false,
    years: [
      {
        year: 2026,
        momentCount: 2,
        title: '2026年',
        yearUnconfirmedCount: 0,
        yearUnconfirmedLabel: '这一年，月份未确认',
        months: [{ month: 9, label: '9月', count: 2, summary: '有2条记录' }],
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
    days: [27, 28].map((day) => ({
      day,
      label: `9月${day}日`,
      count: 1,
      status: 'filled',
      summary: '有1条记录',
    })),
  });
  mockGetHistoryDay.mockImplementation(async (_year: number, _month: number, day: number) => ({
    year: 2026,
    month: 9,
    day,
    title: `2026年9月${day}日`,
    isEmpty: false,
    items: [momentItem(day === 28 ? 'm28' : 'm27', day === 28 ? '二十八' : '二十七', day)],
    hasMore: false,
    totalCount: 1,
  }));
}

describe('lookback in-place catalog reading', () => {
  beforeEach(() => {
    cleanup();
    mockGetLookbackBook.mockReset();
    mockGetHistoryMonth.mockReset();
    mockGetHistoryDay.mockReset();
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

  it('does not locate the reading tree when the same day only collapses the catalog', async () => {
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByText('二十八')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-catalog-toggle'));
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-day-2026-09-28')).toBeTruthy();
    });
    expect(view.getByTestId('lookback-reading-m28')).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-book-day-2026-09-28'));
    });
    await waitFor(() => {
      expect(view.queryByTestId('lookback-catalog')).toBeNull();
    });
    expect(view.getByText('二十八')).toBeTruthy();
    expect(view.queryByTestId('lookback-book-locating')).toBeNull();
    view.unmount();
  });

  it('locates the new day title after a real day change', async () => {
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByText('二十八')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-catalog-toggle'));
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-day-2026-09-27')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-book-day-2026-09-27'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByText('二十七')).toBeTruthy();
    });
    expect(view.getByTestId('lookback-book-locating').props.accessibilityLabel).toBe('day-2026-09-27');
    expect(view.getByTestId('lookback-reading-title').props.accessibilityLabel).toContain('2026年9月27日');
    view.unmount();
  });

  it('keeps the current day visible while the next day is still loading', async () => {
    let finishDay: ((page: object) => void) | undefined;
    mockGetHistoryDay.mockImplementation(async (_year: number, _month: number, day: number) => {
      const page = {
        year: 2026,
        month: 9,
        day,
        title: `2026年9月${day}日`,
        isEmpty: false,
        items: [momentItem(day === 28 ? 'm28' : 'm27', day === 28 ? '二十八' : '二十七', day)],
        hasMore: false,
        totalCount: 1,
      };
      if (day === 27) {
        return new Promise((resolve) => {
          finishDay = resolve;
        });
      }
      return page;
    });
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByText('二十八')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-catalog-toggle'));
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-day-2026-09-27')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-book-day-2026-09-27'));
      await Promise.resolve();
    });
    expect(view.queryByTestId('lookback-reading-loading')).toBeNull();
    expect(view.getByText('二十八')).toBeTruthy();
    expect(view.getByTestId('lookback-reading-fade')).toBeTruthy();
    await act(async () => {
      finishDay?.({
        year: 2026,
        month: 9,
        day: 27,
        title: '2026年9月27日',
        isEmpty: false,
        items: [momentItem('m27', '二十七', 27)],
        hasMore: false,
        totalCount: 1,
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByText('二十七')).toBeTruthy();
    });
    expect(view.queryByTestId('lookback-reading-loading')).toBeNull();
    view.unmount();
  });

  it('keeps the same asset pause across catalog toggle and body expand', async () => {
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByTestId('lookback-reading-m28')).toBeTruthy();
    });
    expect(mockCard).toHaveBeenCalledWith('asset-m28');
    mockPause.mockClear();
    mockPlay.mockClear();
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-catalog-toggle'));
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-catalog')).toBeTruthy();
    });
    expect(mockPause).toHaveBeenCalled();
    expect(mockPlay).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-catalog-toggle'));
    });
    await waitFor(() => {
      expect(view.queryByTestId('lookback-catalog')).toBeNull();
    });
    expect(mockPlay).not.toHaveBeenCalled();
    expect(mockCard).toHaveBeenCalledWith('asset-m28');
    fireEvent(view.getByTestId('lookback-reading-note-measure-m28', { includeHiddenElements: true }), 'textLayout', {
      nativeEvent: { lines: Array.from({ length: 8 }, () => ({ text: '二十八' })) },
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-reading-expand-m28')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('lookback-reading-expand-m28'));
    expect(view.getByTestId('lookback-reading-m28')).toBeTruthy();
    expect(mockPlay).not.toHaveBeenCalled();
    expect(mockCard).toHaveBeenCalledWith('asset-m28');
    fireEvent.press(view.getByTestId('lookback-reading-sound-m28-play-asset-m28'));
    expect(mockPlay).toHaveBeenCalledWith('asset-m28', 'memory://m28.m4a');
    view.unmount();
  });
});
