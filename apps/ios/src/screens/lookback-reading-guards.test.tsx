import type { ReactElement } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions, ScrollView } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LookbackIndexScreen from '../app/lookback/index';
import {
  rememberLookbackReadingSnapshot,
  resetLookbackSessionForTests,
} from '../application/lookback-session';

const mockPush = jest.fn();
const mockGetLookbackBook = jest.fn();
const mockGetHistoryMonth = jest.fn();
const mockGetHistoryDay = jest.fn();
const mockGetHistoryUnknown = jest.fn();
const mockScrollTo = jest.fn();
const mockSearchParams: Record<string, string> = {
  year: '2026',
  month: '09',
  day: '27',
};

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    useRouter: () => ({
      push: mockPush,
      back: jest.fn(),
      replace: jest.fn(),
      dismissTo: jest.fn(),
    }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(effect, [effect]);
    },
    useLocalSearchParams: () => mockSearchParams,
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
    getHistoryUnknown: mockGetHistoryUnknown,
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

function momentItem(id: string, note: string, day = 27) {
  return {
    id,
    note,
    precision: 'day' as const,
    timeLabel: `2026年9月${day}日`,
    usedRecordedAtFallback: false,
    feeling: null,
    images: [],
    audio: null,
    unknownMedia: [],
  };
}

function septemberBook(unknownCount = 0) {
  return {
    unknownCount,
    isEmpty: false,
    years: [
      {
        year: 2026,
        momentCount: 14,
        title: '2026年',
        yearUnconfirmedCount: 0,
        yearUnconfirmedLabel: '这一年，月份未确认',
        months: [{ month: 9, label: '9月', count: 14, summary: '有14条记录' }],
      },
    ],
  };
}

function septemberDays(filled: Record<number, number>) {
  return {
    year: 2026,
    month: 9,
    title: '2026年9月',
    dayUnconfirmedCount: 0,
    dayUnconfirmedLabel: '日子未确认',
    isEmpty: false,
    days: Array.from({ length: 30 }, (_, index) => {
      const day = index + 1;
      const count = filled[day] ?? 0;
      return {
        day,
        label: `9月${day}日`,
        count,
        status: count > 0 ? 'filled' : 'quiet',
        summary: count > 0 ? `有${count}条记录` : '安静',
      };
    }),
  };
}

function dayPage(day: number, items: ReturnType<typeof momentItem>[], extra: { hasMore?: boolean; totalCount?: number } = {}) {
  return {
    year: 2026,
    month: 9,
    day,
    title: `2026年9月${day}日`,
    isEmpty: items.length === 0,
    items,
    hasMore: extra.hasMore ?? false,
    totalCount: extra.totalCount,
  };
}

async function settleRootNeighbors() {
  await waitFor(() => {
    expect(mockGetHistoryMonth).toHaveBeenCalled();
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('lookback reading guards', () => {
  beforeEach(() => {
    cleanup();
    mockPush.mockReset();
    mockGetLookbackBook.mockReset();
    mockGetHistoryMonth.mockReset();
    mockGetHistoryDay.mockReset();
    mockGetHistoryUnknown.mockReset();
    mockScrollTo.mockReset();
    mockSearchParams.year = '2026';
    mockSearchParams.month = '09';
    mockSearchParams.day = '27';
    resetLookbackSessionForTests();
    jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(mockScrollTo);
    Dimensions.set({
      window: { width: 390, height: 844, scale: 2, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 2, fontScale: 1 },
    });
  });

  afterEach(() => {
    cleanup();
    mockScrollTo.mockReset();
  });

  it('does not append the same more-page twice on the root reading page', async () => {
    rememberLookbackReadingSnapshot({
      scope: { kind: 'day', year: 2026, month: 9, day: 27 },
      loadedOffset: 0,
      expandedIds: [],
      scrollY: 0,
    });
    mockGetLookbackBook.mockResolvedValue(septemberBook());
    mockGetHistoryMonth.mockResolvedValue(septemberDays({ 27: 11 }));
    let resolveMore: (value: ReturnType<typeof dayPage>) => void = () => undefined;
    mockGetHistoryDay.mockImplementation(async (_year: number, _month: number, _day: number, offset = 0) => {
      if (offset === 0) return dayPage(27, [momentItem('m1', '第一页')], { hasMore: true, totalCount: 11 });
      return new Promise<ReturnType<typeof dayPage>>((resolve) => {
        resolveMore = resolve;
      });
    });
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByText('第一页')).toBeTruthy();
    });
    await act(async () => {
      const more = view.getByTestId('lookback-reading-more');
      fireEvent.press(more);
      fireEvent.press(more);
      await Promise.resolve();
    });
    expect(mockGetHistoryDay.mock.calls.filter((call) => call[3] === 50)).toHaveLength(1);
    await act(async () => {
      resolveMore(dayPage(27, [momentItem('m2', '第二页')], { hasMore: false }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view.getByText('第二页')).toBeTruthy();
    expect(view.getAllByText('第二页')).toHaveLength(1);
    await settleRootNeighbors();
    view.unmount();
  });

  it('keeps the newer day when a late unconfirmed page arrives', async () => {
    mockGetLookbackBook.mockResolvedValue(septemberBook(2));
    mockGetHistoryMonth.mockResolvedValue(septemberDays({ 27: 2, 28: 1 }));
    mockGetHistoryDay.mockImplementation(async (_year: number, _month: number, day: number) => {
      if (day === 28) return dayPage(28, [momentItem('m28', '二十八', 28)], { totalCount: 1 });
      return dayPage(27, [momentItem('m27', '二十七')], { totalCount: 2 });
    });
    let resolveUnknown: (value: {
      title: string;
      explanation: string;
      items: ReturnType<typeof momentItem>[];
      hasMore: boolean;
    }) => void = () => undefined;
    mockGetHistoryUnknown.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUnknown = resolve;
        }),
    );
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByText('二十八')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-catalog-toggle'));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-unconfirmed')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-unconfirmed'));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-catalog-toggle'));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-month-2026-09')).toBeTruthy();
    });
    if (!view.queryByTestId('lookback-book-day-2026-09-27')) {
      await act(async () => {
        fireEvent.press(view.getByTestId('lookback-book-month-2026-09'));
        await Promise.resolve();
        await Promise.resolve();
      });
    }
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
    await act(async () => {
      resolveUnknown({
        title: '时间未确认',
        explanation: '这些记录还没有确认发生的日子。',
        items: [momentItem('u1', '迟到的未确认')],
        hasMore: false,
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view.getByText('二十七')).toBeTruthy();
    expect(view.queryByText('迟到的未确认')).toBeNull();
    expect(view.queryByText('这些记录还没有确认发生的日子。')).toBeNull();
    await settleRootNeighbors();
    view.unmount();
  });

  it('shows the real range count while a multi-page day still has more', async () => {
    rememberLookbackReadingSnapshot({
      scope: { kind: 'day', year: 2026, month: 9, day: 27 },
      loadedOffset: 0,
      expandedIds: [],
      scrollY: 0,
    });
    mockGetLookbackBook.mockResolvedValue(septemberBook());
    mockGetHistoryMonth.mockResolvedValue(septemberDays({ 27: 11 }));
    mockGetHistoryDay.mockResolvedValue(
      dayPage(27, [momentItem('m1', '已加载一条'), momentItem('m2', '已加载二条')], {
        hasMore: true,
        totalCount: 11,
      }),
    );
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByText('已加载一条')).toBeTruthy();
    });
    expect(view.getByText('周日 · 11条记录')).toBeTruthy();
    expect(view.queryByText('周日 · 0条记录')).toBeNull();
    expect(view.queryByText('周日 · 2条记录')).toBeNull();
    await settleRootNeighbors();
    view.unmount();
  });

  it('scrolls to the top when the root page opens a neighbor day', async () => {
    mockGetLookbackBook.mockResolvedValue(septemberBook());
    mockGetHistoryMonth.mockResolvedValue(septemberDays({ 27: 2, 28: 1 }));
    mockGetHistoryDay.mockImplementation(async (_year: number, _month: number, day: number) => {
      if (day === 28) return dayPage(28, [momentItem('m28', '二十八', 28)], { totalCount: 1 });
      return dayPage(27, [momentItem('m27', '二十七')], { totalCount: 2 });
    });
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByText('二十八')).toBeTruthy();
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-reading-prev-day')).toBeTruthy();
    });
    fireEvent(view.getByTestId('lookback-scroll'), 'contentSizeChange');
    mockScrollTo.mockClear();
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-reading-prev-day'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByText('二十七')).toBeTruthy();
    });
    fireEvent(view.getByTestId('lookback-scroll'), 'contentSizeChange');
    expect(mockScrollTo).toHaveBeenCalledWith({ y: 0, animated: false });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await settleRootNeighbors();
    view.unmount();
  });
});
