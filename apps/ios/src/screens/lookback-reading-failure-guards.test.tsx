import type { ReactElement } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LookbackDayScreen from '../app/lookback/[year]/[month]/[day]';
import LookbackIndexScreen from '../app/lookback/index';
import LookbackUnconfirmedScreen from '../app/lookback/unconfirmed';
import { rememberLookbackReadingSnapshot, resetLookbackSessionForTests } from '../application/lookback-session';

const mockGetLookbackBook = jest.fn();
const mockGetHistoryMonth = jest.fn();
const mockGetHistoryDay = jest.fn();
const mockGetHistoryUnknown = jest.fn();
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
      push: jest.fn(),
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

function twoMonthBook() {
  return {
    unknownCount: 0,
    isEmpty: false,
    years: [
      {
        year: 2026,
        momentCount: 16,
        title: '2026年',
        yearUnconfirmedCount: 0,
        yearUnconfirmedLabel: '这一年，月份未确认',
        months: [
          { month: 10, label: '10月', count: 2, summary: '有2条记录' },
          { month: 9, label: '9月', count: 14, summary: '有14条记录' },
        ],
      },
    ],
  };
}

function monthDays(month: number, filled: Record<number, number>) {
  return {
    year: 2026,
    month,
    title: `2026年${month}月`,
    dayUnconfirmedCount: 0,
    dayUnconfirmedLabel: '日子未确认',
    isEmpty: false,
    days: Array.from({ length: 30 }, (_, index) => {
      const day = index + 1;
      const count = filled[day] ?? 0;
      return {
        day,
        label: `${month}月${day}日`,
        count,
        status: count > 0 ? 'filled' : 'quiet',
        summary: count > 0 ? `有${count}条记录` : '安静',
      };
    }),
  };
}

function dayPage(
  day: number,
  items: ReturnType<typeof momentItem>[],
  extra: { hasMore?: boolean; totalCount?: number } = {},
) {
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

describe('lookback reading failure guards', () => {
  beforeEach(() => {
    cleanup();
    mockGetLookbackBook.mockReset();
    mockGetHistoryMonth.mockReset();
    mockGetHistoryDay.mockReset();
    mockGetHistoryUnknown.mockReset();
    mockSearchParams.year = '2026';
    mockSearchParams.month = '09';
    mockSearchParams.day = '27';
    resetLookbackSessionForTests();
    Dimensions.set({
      window: { width: 390, height: 844, scale: 2, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 2, fontScale: 1 },
    });
  });

  it('retries the first lookback book read once and then shows the page', async () => {
    let allow = false;
    mockGetLookbackBook.mockImplementation(async () => {
      if (!allow) throw new Error('book down');
      return { unknownCount: 1, isEmpty: false, years: [] };
    });
    mockGetHistoryUnknown.mockResolvedValue({
      title: '时间未确认',
      explanation: '这些记录没有可以确定的发生时间。',
      items: [momentItem('u1', '未确认重试后还在')],
      hasMore: false,
    });
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-retry')).toBeTruthy();
    });
    expect(view.getByText('回看暂时读不出来，原来的记录还在。再试一次')).toBeTruthy();
    expect(view.queryByText('未确认重试后还在')).toBeNull();
    const failedCalls = mockGetLookbackBook.mock.calls.length;
    allow = true;
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-book-retry'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByText('未确认重试后还在')).toBeTruthy();
    });
    expect(view.queryByTestId('lookback-book-retry')).toBeNull();
    expect(view.getByTestId('lookback-leave-fab')).toBeTruthy();
    expect(mockGetLookbackBook.mock.calls.length).toBe(failedCalls + 1);
    fireEvent(view.getByTestId('lookback-scroll'), 'contentSizeChange');
    await waitFor(() => {
      expect(view.getByText('这一段，读到这里。')).toBeTruthy();
    });
    expect(view.queryByText('这一日，读到这里。')).toBeNull();
    view.unmount();
  });

  it('requests the next unconfirmed page on the first more-retry press', async () => {
    let failMore = true;
    mockGetHistoryUnknown.mockImplementation(async (offset = 0) => {
      if (offset === 0) {
        return {
          title: '时间未确认',
          explanation: '这些记录还没有确认发生的日子。',
          items: [momentItem('u1', '未确认第一页')],
          hasMore: true,
          totalCount: 11,
        };
      }
      if (failMore) throw new Error('unknown more down');
      return {
        title: '时间未确认',
        explanation: '这些记录还没有确认发生的日子。',
        items: [momentItem('u2', '未确认重试页')],
        hasMore: false,
      };
    });
    const view = await render(wrap(<LookbackUnconfirmedScreen />));
    await waitFor(() => {
      expect(view.getByText('未确认第一页')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-unconfirmed-more'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByText('后面的记录暂时读不出来。再试一次')).toBeTruthy();
    });
    failMore = false;
    const moreCallsBeforeRetry = mockGetHistoryUnknown.mock.calls.filter((call) => call[0] === 50).length;
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-unconfirmed-more'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByText('未确认重试页')).toBeTruthy();
    });
    expect(mockGetHistoryUnknown.mock.calls.filter((call) => call[0] === 50).length).toBe(moreCallsBeforeRetry + 1);
    view.unmount();
  });

  it('keeps restored unconfirmed items and retries a later failed page', async () => {
    rememberLookbackReadingSnapshot({
      scope: { kind: 'unknown' },
      loadedOffset: 50,
      expandedIds: [],
      scrollY: 0,
    });
    let failLater = true;
    mockGetHistoryUnknown.mockImplementation(async (offset = 0) => {
      if (offset === 0) {
        return {
          title: '时间未确认',
          explanation: '这些记录还没有确认发生的日子。',
          items: [momentItem('u1', '未确认已恢复')],
          hasMore: true,
          totalCount: 11,
        };
      }
      if (failLater) throw new Error('unknown page 50 down');
      return {
        title: '时间未确认',
        explanation: '这些记录还没有确认发生的日子。',
        items: [momentItem('u2', '未确认恢复后的第二页')],
        hasMore: false,
      };
    });
    const view = await render(wrap(<LookbackUnconfirmedScreen />));
    await waitFor(() => {
      expect(view.getByText('未确认已恢复')).toBeTruthy();
    });
    expect(view.getByText('后面的记录暂时读不出来。再试一次')).toBeTruthy();
    failLater = false;
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-unconfirmed-more'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByText('未确认恢复后的第二页')).toBeTruthy();
    });
    view.unmount();
  });

  it('requests the next day page on the first more-retry press', async () => {
    mockGetLookbackBook.mockResolvedValue(twoMonthBook());
    mockGetHistoryMonth.mockResolvedValue(monthDays(9, { 27: 11 }));
    let failMore = true;
    mockGetHistoryDay.mockImplementation(async (_year: number, _month: number, _day: number, offset = 0) => {
      if (offset === 0) return dayPage(27, [momentItem('m1', '日页第一页')], { hasMore: true, totalCount: 11 });
      if (failMore) throw new Error('more down');
      return dayPage(27, [momentItem('m2', '日页重试页')], { hasMore: false });
    });
    const view = await render(wrap(<LookbackDayScreen />));
    await waitFor(() => {
      expect(view.getByText('日页第一页')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-day-more'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByText('后面的记录暂时读不出来。再试一次')).toBeTruthy();
    });
    failMore = false;
    const moreCallsBeforeRetry = mockGetHistoryDay.mock.calls.filter((call) => call[3] === 50).length;
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-day-more'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByText('日页重试页')).toBeTruthy();
    });
    expect(mockGetHistoryDay.mock.calls.filter((call) => call[3] === 50).length).toBe(moreCallsBeforeRetry + 1);
    expect(view.queryByText('后面的记录暂时读不出来。再试一次')).toBeNull();
    view.unmount();
  });

  it('keeps restored day items and retries a later failed page', async () => {
    rememberLookbackReadingSnapshot({
      scope: { kind: 'day', year: 2026, month: 9, day: 27 },
      loadedOffset: 50,
      expandedIds: [],
      scrollY: 0,
    });
    mockGetLookbackBook.mockResolvedValue(twoMonthBook());
    mockGetHistoryMonth.mockResolvedValue(monthDays(9, { 27: 11 }));
    let failLater = true;
    mockGetHistoryDay.mockImplementation(async (_year: number, _month: number, _day: number, offset = 0) => {
      if (offset === 0) return dayPage(27, [momentItem('m1', '已恢复第一页')], { hasMore: true, totalCount: 11 });
      if (failLater) throw new Error('page 50 down');
      return dayPage(27, [momentItem('m2', '恢复后的第二页')], { hasMore: false });
    });
    const view = await render(wrap(<LookbackDayScreen />));
    await waitFor(() => {
      expect(view.getByText('已恢复第一页')).toBeTruthy();
    });
    expect(view.getByText('后面的记录暂时读不出来。再试一次')).toBeTruthy();
    failLater = false;
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-day-more'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByText('恢复后的第二页')).toBeTruthy();
    });
    view.unmount();
  });

  it('keeps the old day and retries a failed neighbor query once', async () => {
    mockGetLookbackBook.mockResolvedValue(twoMonthBook());
    let failOctober = true;
    mockGetHistoryMonth.mockImplementation(async (_year: number, month: number) => {
      if (month === 10 && failOctober) throw new Error('october down');
      if (month === 10) return monthDays(10, { 2: 1 });
      return monthDays(9, { 27: 2, 28: 1 });
    });
    mockGetHistoryDay.mockResolvedValue(dayPage(28, [momentItem('m28', '二十八', 28)], { totalCount: 1 }));
    mockSearchParams.day = '28';
    const view = await render(wrap(<LookbackDayScreen />));
    await waitFor(() => {
      expect(view.getByText('二十八')).toBeTruthy();
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-day-neighbors-retry')).toBeTruthy();
    });
    expect(view.queryByTestId('lookback-reading-prev-day')).toBeNull();
    failOctober = false;
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-day-neighbors-retry'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-reading-prev-day')).toBeTruthy();
    });
    expect(view.getByText('二十八')).toBeTruthy();
    expect(view.queryByTestId('lookback-day-neighbors-retry')).toBeNull();
    view.unmount();
  });

  it('keeps the current day on the root page and retries a failed neighbor query once', async () => {
    rememberLookbackReadingSnapshot({
      scope: { kind: 'day', year: 2026, month: 9, day: 28 },
      loadedOffset: 0,
      expandedIds: [],
      scrollY: 0,
    });
    mockGetLookbackBook.mockResolvedValue(twoMonthBook());
    let failOctober = true;
    mockGetHistoryMonth.mockImplementation(async (_year: number, month: number) => {
      if (month === 10 && failOctober) throw new Error('october down');
      if (month === 10) return monthDays(10, { 2: 1 });
      return monthDays(9, { 27: 2, 28: 1 });
    });
    mockGetHistoryDay.mockResolvedValue(dayPage(28, [momentItem('m28', '二十八', 28)], { totalCount: 1 }));
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByText('二十八')).toBeTruthy();
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-reading-neighbors-retry')).toBeTruthy();
    });
    expect(view.queryByTestId('lookback-reading-prev-day')).toBeNull();
    failOctober = false;
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-reading-neighbors-retry'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-reading-prev-day')).toBeTruthy();
    });
    expect(view.getByText('二十八')).toBeTruthy();
    expect(view.queryByTestId('lookback-reading-neighbors-retry')).toBeNull();
    view.unmount();
  });

  it('requests the next root page on the first more-retry press', async () => {
    rememberLookbackReadingSnapshot({
      scope: { kind: 'day', year: 2026, month: 9, day: 27 },
      loadedOffset: 0,
      expandedIds: [],
      scrollY: 0,
    });
    mockGetLookbackBook.mockResolvedValue(twoMonthBook());
    mockGetHistoryMonth.mockResolvedValue(monthDays(9, { 27: 11 }));
    let failMore = true;
    mockGetHistoryDay.mockImplementation(async (_year: number, _month: number, _day: number, offset = 0) => {
      if (offset === 0) return dayPage(27, [momentItem('m1', '根页第一页')], { hasMore: true, totalCount: 11 });
      if (failMore) throw new Error('root more down');
      return dayPage(27, [momentItem('m2', '根页重试页')], { hasMore: false });
    });
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByText('根页第一页')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-reading-more'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-reading-more-retry')).toBeTruthy();
    });
    failMore = false;
    const moreCallsBeforeRetry = mockGetHistoryDay.mock.calls.filter((call) => call[3] === 50).length;
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-reading-more-retry'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByText('根页重试页')).toBeTruthy();
    });
    expect(mockGetHistoryDay.mock.calls.filter((call) => call[3] === 50).length).toBe(moreCallsBeforeRetry + 1);
    expect(view.queryByTestId('lookback-reading-more-retry')).toBeNull();
    view.unmount();
  });
});
