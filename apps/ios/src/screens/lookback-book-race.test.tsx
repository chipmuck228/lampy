import type { ReactElement } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LookbackIndexScreen from '../app/lookback/index';
import { resetLookbackSessionForTests, writeLookbackBookIntent } from '../application/lookback-session';

const mockPush = jest.fn();
const mockGetLookbackBook = jest.fn();
const mockGetHistoryMonth = jest.fn();
const mockGetHistoryDay = jest.fn();

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
    useLocalSearchParams: () => ({}),
    useNavigation: () => ({
      getState: () => ({ index: 0, routes: [{ name: 'lookback/index' }] }),
    }),
  };
});

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    getLookbackBook: mockGetLookbackBook,
    getHistoryMonth: mockGetHistoryMonth,
    getHistoryDay: mockGetHistoryDay,
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

describe('lookback book race and intent', () => {
  beforeEach(() => {
    cleanup();
    mockPush.mockReset();
    mockGetLookbackBook.mockReset();
    mockGetHistoryMonth.mockReset();
    mockGetHistoryDay.mockReset();
    resetLookbackSessionForTests();
    Dimensions.set({
      window: { width: 390, height: 844, scale: 2, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 2, fontScale: 1 },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('expands a cold month intent without selecting a day', async () => {
    writeLookbackBookIntent({ year: 2026, month: 9 });
    mockGetLookbackBook.mockResolvedValue(septemberBook());
    mockGetHistoryMonth.mockResolvedValue(septemberDays({ 27: 11 }));
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-day-2026-09-27')).toBeTruthy();
    });
    expect(view.queryByTestId('lookback-book-selected-day')).toBeNull();
    expect(view.queryByTestId('lookback-book-excerpt-m_first')).toBeNull();
    expect(view.getByTestId('lookback-book-locate-month-2026-09')).toBeTruthy();
    expect(mockGetHistoryDay).not.toHaveBeenCalled();
  });

  it('ignores a slower previous day once another date is selected', async () => {
    mockGetLookbackBook.mockResolvedValue(septemberBook());
    mockGetHistoryMonth.mockResolvedValue(septemberDays({ 27: 1, 28: 1 }));
    let releaseTwentySeventh: (value: unknown) => void = () => undefined;
    const twentySeventh = new Promise((resolve) => {
      releaseTwentySeventh = resolve;
    });
    mockGetHistoryDay.mockImplementation((_year: number, _month: number, day: number) => {
      if (day === 27) return twentySeventh;
      return Promise.resolve({
        year: 2026,
        month: 9,
        day: 28,
        title: '2026年9月28日',
        isEmpty: false,
        items: [
          {
            id: 'm_28',
            note: '二十八的风',
            precision: 'day',
            timeLabel: '2026年9月28日',
            usedRecordedAtFallback: false,
            feeling: null,
            images: [],
            audio: null,
            unknownMedia: [],
          },
        ],
        hasMore: false,
      });
    });
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-month-2026-09')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-book-month-2026-09'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-day-2026-09-27')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-book-day-2026-09-27'));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-book-day-2026-09-28'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-open-m_28')).toBeTruthy();
    });
    await act(async () => {
      releaseTwentySeventh({
        year: 2026,
        month: 9,
        day: 27,
        title: '2026年9月27日',
        isEmpty: false,
        items: [
          {
            id: 'm_stale',
            note: '不该闪出来的旧摘录',
            precision: 'day',
            timeLabel: '2026年9月27日',
            usedRecordedAtFallback: false,
            feeling: null,
            images: [],
            audio: null,
            unknownMedia: [],
          },
        ],
        hasMore: false,
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view.queryByText('不该闪出来的旧摘录')).toBeNull();
    expect(view.getByText('二十八的风')).toBeTruthy();
  });

  it('keeps play and 看这条 as separate hits on an audio excerpt', async () => {
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
    mockGetHistoryMonth.mockResolvedValue(septemberDays({ 27: 1 }));
    mockGetHistoryDay.mockResolvedValue({
      year: 2026,
      month: 9,
      day: 27,
      title: '2026年9月27日',
      isEmpty: false,
      items: [
        {
          id: 'm_voice',
          note: '',
          precision: 'day',
          timeLabel: '2026年9月27日',
          usedRecordedAtFallback: false,
          feeling: null,
          images: [],
          audio: {
            id: 'a_voice',
            status: 'available',
            uri: 'memory://a_voice.m4a',
            durationMs: 3000,
            durationLabel: '3秒',
            label: '一段声音',
          },
          unknownMedia: [],
        },
      ],
      hasMore: false,
    });
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-month-2026-09')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-book-month-2026-09'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-day-2026-09-27')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-book-day-2026-09-27'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-sound-m_voice-play-a_voice')).toBeTruthy();
    });
    expect(view.getByTestId('lookback-book-open-m_voice')).toBeTruthy();
    fireEvent.press(view.getByTestId('lookback-book-open-m_voice'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/moment/[id]', params: { id: 'm_voice' } });
  });

  it('keeps a later same-day success when an earlier failure arrives late', async () => {
    mockGetLookbackBook.mockResolvedValue(septemberBook());
    mockGetHistoryMonth.mockResolvedValue(septemberDays({ 27: 3 }));
    let rejectFirst: (error: Error) => void = () => undefined;
    const first = new Promise((_, reject) => {
      rejectFirst = reject;
    });
    mockGetHistoryDay.mockImplementationOnce(() => first).mockResolvedValueOnce({
      year: 2026,
      month: 9,
      day: 27,
      title: '2026年9月27日',
      isEmpty: false,
      items: [
        {
          id: 'm_ok',
          note: '后到的成功',
          precision: 'day',
          timeLabel: '2026年9月27日',
          usedRecordedAtFallback: false,
          feeling: null,
          images: [],
          audio: null,
          unknownMedia: [],
        },
      ],
      hasMore: false,
    });
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-month-2026-09')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-book-month-2026-09'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-day-2026-09-27')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-book-day-2026-09-27'));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-book-day-2026-09-27'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByText('后到的成功')).toBeTruthy();
    });
    await act(async () => {
      rejectFirst(new Error('stale'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view.getByText('后到的成功')).toBeTruthy();
    expect(view.queryByTestId('lookback-book-day-retry')).toBeNull();
  });

  it('shows a retryable excerpt failure without pretending the day is empty', async () => {
    mockGetLookbackBook.mockResolvedValue(septemberBook());
    mockGetHistoryMonth.mockResolvedValue(septemberDays({ 27: 11 }));
    mockGetHistoryDay.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce({
      year: 2026,
      month: 9,
      day: 27,
      title: '2026年9月27日',
      isEmpty: false,
      items: [
        {
          id: 'm_recovered',
          note: '重试后的摘录',
          precision: 'day',
          timeLabel: '2026年9月27日',
          usedRecordedAtFallback: false,
          feeling: null,
          images: [],
          audio: null,
          unknownMedia: [],
        },
      ],
      hasMore: false,
    });
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-month-2026-09')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-book-month-2026-09'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-day-2026-09-27')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-book-day-2026-09-27'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-day-retry')).toBeTruthy();
    });
    expect(view.getByText('9月27日 · 星期日')).toBeTruthy();
    expect(view.getByText('11条')).toBeTruthy();
    expect(view.queryByLabelText(/这一天还有/)).toBeNull();
    expect(view.queryByTestId('lookback-book-excerpt-m_recovered')).toBeNull();
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-book-day-retry'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByText('重试后的摘录')).toBeTruthy();
    });
    expect(view.queryByTestId('lookback-book-day-retry')).toBeNull();
  });

  it('keeps a later same-month success when an earlier failure arrives late', async () => {
    mockGetLookbackBook.mockResolvedValue(septemberBook());
    let rejectFirst: (error: Error) => void = () => undefined;
    const first = new Promise((_, reject) => {
      rejectFirst = reject;
    });
    mockGetHistoryMonth.mockImplementationOnce(() => first).mockResolvedValueOnce(septemberDays({ 27: 1 }));
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-month-2026-09')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-book-month-2026-09'));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-book-month-2026-09'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-day-2026-09-27')).toBeTruthy();
    });
    await act(async () => {
      rejectFirst(new Error('stale-month'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view.getByTestId('lookback-book-day-2026-09-27')).toBeTruthy();
    expect(view.queryByTestId('lookback-book-month-retry')).toBeNull();
  });
});
