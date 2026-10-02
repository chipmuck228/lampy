import type { ReactElement } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions, ScrollView } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LookbackDayScreen from '../app/lookback/[year]/[month]/[day]';
import LookbackUnconfirmedScreen from '../app/lookback/unconfirmed';
import { resetLookbackSessionForTests } from '../application/lookback-session';

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

function septemberBook() {
  return {
    unknownCount: 0,
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

async function settleNeighbors() {
  await waitFor(() => {
    expect(mockGetHistoryMonth).toHaveBeenCalled();
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('lookback reading page guards', () => {
  beforeEach(() => {
    cleanup();
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

  it('keeps a first-load failure on the unconfirmed page and retries it', async () => {
    let fail = true;
    mockGetHistoryUnknown.mockImplementation(async () => {
      if (fail) throw new Error('unknown down');
      return {
        title: '时间未确认',
        explanation: '这些记录还没有确认发生的日子。',
        items: [momentItem('u1', '重试后的未确认')],
        hasMore: false,
        totalCount: 1,
      };
    });
    const view = await render(wrap(<LookbackUnconfirmedScreen />));
    await waitFor(() => {
      expect(view.getByTestId('lookback-unconfirmed-retry')).toBeTruthy();
    });
    expect(view.queryByText('重试后的未确认')).toBeNull();
    fail = false;
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-unconfirmed-retry'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByText('重试后的未确认')).toBeTruthy();
    });
    view.unmount();
  });

  it('does not append the same more-page twice on the old day page', async () => {
    mockGetLookbackBook.mockResolvedValue(septemberBook());
    mockGetHistoryMonth.mockResolvedValue(septemberDays({ 27: 11 }));
    let resolveMore: (value: ReturnType<typeof dayPage>) => void = () => undefined;
    mockGetHistoryDay.mockImplementation(async (_year: number, _month: number, _day: number, offset = 0) => {
      if (offset === 0) return dayPage(27, [momentItem('m1', '日页第一页')], { hasMore: true, totalCount: 11 });
      return new Promise<ReturnType<typeof dayPage>>((resolve) => {
        resolveMore = resolve;
      });
    });
    const view = await render(wrap(<LookbackDayScreen />));
    await waitFor(() => {
      expect(view.getByText('日页第一页')).toBeTruthy();
    });
    expect(view.getByText('周日 · 11条记录')).toBeTruthy();
    await act(async () => {
      const more = view.getByTestId('lookback-day-more');
      fireEvent.press(more);
      fireEvent.press(more);
      await Promise.resolve();
    });
    expect(mockGetHistoryDay.mock.calls.filter((call) => call[3] === 50)).toHaveLength(1);
    await act(async () => {
      resolveMore(dayPage(27, [momentItem('m2', '日页第二页')], { hasMore: false }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view.getAllByText('日页第二页')).toHaveLength(1);
    await settleNeighbors();
    view.unmount();
  });

  it('keeps a first-load failure on the old day page and retries it', async () => {
    mockGetLookbackBook.mockResolvedValue(septemberBook());
    mockGetHistoryMonth.mockResolvedValue(septemberDays({ 27: 1 }));
    let fail = true;
    mockGetHistoryDay.mockImplementation(async () => {
      if (fail) throw new Error('day down');
      return dayPage(27, [momentItem('m1', '重试后的日页')], { totalCount: 1 });
    });
    const view = await render(wrap(<LookbackDayScreen />));
    await waitFor(() => {
      expect(view.getByTestId('lookback-day-retry')).toBeTruthy();
    });
    expect(view.queryByText('这一天还没有留下什么。')).toBeNull();
    fail = false;
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-day-retry'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByText('重试后的日页')).toBeTruthy();
    });
    await settleNeighbors();
    view.unmount();
  });

  it('scrolls to the top when the old day page switches to a neighbor', async () => {
    mockGetLookbackBook.mockResolvedValue(septemberBook());
    mockGetHistoryMonth.mockResolvedValue(septemberDays({ 27: 2, 28: 1 }));
    mockGetHistoryDay.mockImplementation(async (_year: number, _month: number, day: number) =>
      day === 28
        ? dayPage(28, [momentItem('m28', '二十八', 28)], { totalCount: 1 })
        : dayPage(27, [momentItem('m27', '二十七')], { totalCount: 2 }),
    );
    const view = await render(wrap(<LookbackDayScreen />));
    await waitFor(() => {
      expect(view.getByText('二十七')).toBeTruthy();
    });
    fireEvent(view.getByTestId('lookback-scroll'), 'contentSizeChange');
    mockScrollTo.mockClear();
    mockSearchParams.day = '28';
    view.rerender(wrap(<LookbackDayScreen />));
    await waitFor(() => {
      expect(view.getByText('二十八')).toBeTruthy();
    });
    fireEvent(view.getByTestId('lookback-scroll'), 'contentSizeChange');
    expect(mockScrollTo).toHaveBeenCalledWith({ y: 0, animated: false });
    await settleNeighbors();
    view.unmount();
  });
});
