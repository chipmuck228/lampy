import type { ReactElement } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LookbackIndexScreen from '../app/lookback/index';
import { resetLookbackSessionForTests } from '../application/lookback-session';

const mockGetLookbackBook = jest.fn();
const mockGetHistoryMonth = jest.fn();
const mockGetHistoryDay = jest.fn();
const mockFocusListeners = new Set<() => void>();

function emitLookbackFocus() {
  mockFocusListeners.forEach((listener) => listener());
}

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
    card: () => ({ status: 'idle', currentTimeMs: 0 }),
    play: jest.fn(),
    pause: jest.fn(async () => undefined),
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
    audio: null,
    unknownMedia: [],
  };
}

function bookView(count: number) {
  return {
    unknownCount: 0,
    isEmpty: count === 0,
    years:
      count === 0
        ? []
        : [
            {
              year: 2026,
              momentCount: count,
              title: '2026年',
              yearUnconfirmedCount: 0,
              yearUnconfirmedLabel: '这一年，月份未确认',
              months: [{ month: 9, label: '9月', count, summary: `有${count}条记录` }],
            },
          ],
  };
}

function monthView(count: number) {
  return {
    year: 2026,
    month: 9,
    title: '2026年9月',
    dayUnconfirmedCount: 0,
    dayUnconfirmedLabel: '日子未确认',
    isEmpty: count === 0,
    days: [
      {
        day: 28,
        label: '9月28日',
        count,
        status: count > 0 ? 'filled' : 'quiet',
        summary: count > 0 ? `有${count}条记录` : '安静',
      },
    ],
  };
}

function dayView(items: ReturnType<typeof momentItem>[], extra: { hasMore?: boolean; offset?: number } = {}) {
  return {
    year: 2026,
    month: 9,
    day: 28,
    title: '2026年9月28日',
    isEmpty: items.length === 0,
    items,
    hasMore: extra.hasMore ?? false,
    totalCount: extra.hasMore ? items.length + 1 : items.length,
  };
}

describe('lookback book refresh on refocus', () => {
  afterEach(async () => {
    await act(async () => {
      await Promise.resolve();
    });
    cleanup();
  });

  beforeEach(() => {
    cleanup();
    mockFocusListeners.clear();
    mockGetLookbackBook.mockReset();
    mockGetHistoryMonth.mockReset();
    mockGetHistoryDay.mockReset();
    resetLookbackSessionForTests();
    Dimensions.set({
      window: { width: 390, height: 844, scale: 2, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 2, fontScale: 1 },
    });
  });

  it('reads a newly left record on return without dropping the current day, pages, or catalog', async () => {
    mockGetLookbackBook.mockResolvedValue(bookView(2));
    mockGetHistoryMonth.mockResolvedValue(monthView(2));
    mockGetHistoryDay.mockImplementation(async (_year: number, _month: number, _day: number, offset = 0) => {
      if (offset === 0) return dayView([momentItem('m1', '第一页')], { hasMore: true });
      return dayView([momentItem('m2', '第二页')]);
    });
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByTestId('lookback-reading-m1')).toBeTruthy();
      expect(view.getByTestId('lookback-reading-more')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-reading-more'));
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-reading-m2')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-catalog-toggle'));
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-catalog')).toBeTruthy();
      expect(view.getByTestId('lookback-book-expand-2026-09')).toBeTruthy();
    });
    const bookCalls = mockGetLookbackBook.mock.calls.length;
    const dayCalls = mockGetHistoryDay.mock.calls.length;
    mockGetLookbackBook.mockResolvedValue(bookView(3));
    mockGetHistoryMonth.mockResolvedValue(monthView(3));
    mockGetHistoryDay.mockImplementation(async (_year: number, _month: number, _day: number, offset = 0) => {
      if (offset === 0) return dayView([momentItem('m-new', '新留下的'), momentItem('m1', '第一页')], { hasMore: true });
      return dayView([momentItem('m2', '第二页')]);
    });
    await act(async () => {
      emitLookbackFocus();
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-reading-m-new')).toBeTruthy();
    });
    expect(view.getByTestId('lookback-reading-m1')).toBeTruthy();
    expect(view.getByTestId('lookback-reading-m2')).toBeTruthy();
    expect(view.getByTestId('lookback-catalog')).toBeTruthy();
    expect(view.getByTestId('lookback-book-expand-2026-09')).toBeTruthy();
    expect(view.getByLabelText('2026年9月，有3条记录，已展开')).toBeTruthy();
    expect(view.getByLabelText('2026年9月28日，星期一，3条')).toBeTruthy();
    expect(mockGetLookbackBook.mock.calls.length).toBeGreaterThan(bookCalls);
    expect(mockGetHistoryDay.mock.calls.length).toBeGreaterThan(dayCalls);
  });

  it('leaves the empty lookback and shows the first record after returning', async () => {
    mockGetLookbackBook.mockResolvedValue(bookView(0));
    mockGetHistoryMonth.mockResolvedValue(monthView(0));
    mockGetHistoryDay.mockResolvedValue(dayView([]));
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByTestId('lookback-empty')).toBeTruthy();
    });
    expect(view.queryByTestId('lookback-reading-m28')).toBeNull();
    mockGetLookbackBook.mockResolvedValue(bookView(1));
    mockGetHistoryMonth.mockResolvedValue(monthView(1));
    mockGetHistoryDay.mockResolvedValue(dayView([momentItem('m28', '第一条')]));
    await act(async () => {
      emitLookbackFocus();
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-reading-m28')).toBeTruthy();
    });
    expect(view.queryByTestId('lookback-empty')).toBeNull();
    expect(view.getByText('第一条')).toBeTruthy();
  });
});
