import type { ReactElement } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions, ScrollView, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LookbackIndexScreen from '../app/lookback/index';
import { resetLookbackSessionForTests, writeLookbackBookIntent } from '../application/lookback-session';

const mockGetLookbackBook = jest.fn();
const mockGetHistoryMonth = jest.fn();
const mockGetHistoryDay = jest.fn();
const mockScrollTo = jest.fn();
const pendingMeasures: Array<() => void> = [];

function flushMeasures() {
  let guard = 0;
  while (pendingMeasures.length > 0 && guard < 16) {
    const batch = pendingMeasures.splice(0, pendingMeasures.length);
    batch.forEach((run) => run());
    guard += 1;
  }
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

describe('lookback book day locate', () => {
  beforeEach(() => {
    cleanup();
    mockGetLookbackBook.mockReset();
    mockGetHistoryMonth.mockReset();
    mockGetHistoryDay.mockReset();
    mockScrollTo.mockReset();
    pendingMeasures.length = 0;
    jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(mockScrollTo);
    jest.spyOn(View.prototype, 'measureInWindow').mockImplementation(function (this: object, callback) {
      const isScroll = this instanceof ScrollView;
      pendingMeasures.push(() => {
        if (isScroll) callback(0, 120, 390, 844);
        else callback(0, 2200, 390, 48);
      });
    });
    resetLookbackSessionForTests();
    Dimensions.set({
      window: { width: 390, height: 844, scale: 2, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 2, fontScale: 1 },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('scrolls a far day from window measure, then lets relayout and another day stay put', async () => {
    writeLookbackBookIntent({ year: 2026, month: 9, day: 28 });
    mockGetLookbackBook.mockResolvedValue({
      unknownCount: 0,
      isEmpty: false,
      years: [
        {
          year: 2026,
          momentCount: 28,
          title: '2026年',
          yearUnconfirmedCount: 0,
          yearUnconfirmedLabel: '这一年，月份未确认',
          months: [{ month: 9, label: '9月', count: 28, summary: '有28条记录' }],
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
      days: Array.from({ length: 28 }, (_, index) => ({
        day: index + 1,
        label: `9月${index + 1}日`,
        count: 1,
        status: 'filled' as const,
        summary: '有1条记录',
      })),
    });
    mockGetHistoryDay.mockResolvedValue({
      year: 2026,
      month: 9,
      day: 28,
      title: '2026年9月28日',
      isEmpty: false,
      items: [
        {
          id: 'm_day',
          note: '月末这一天',
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
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByText('月末这一天')).toBeTruthy();
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-locating')).toBeTruthy();
    });
    expect(view.getByTestId('lookback-book-day-2026-09-01')).toBeTruthy();
    expect(view.getByTestId('lookback-book-day-2026-09-28')).toBeTruthy();
    await act(async () => {
      fireEvent(view.getByTestId('lookback-book-locate-day-2026-09-28'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 8, width: 390, height: 8 } },
      });
    });
    expect(mockScrollTo).not.toHaveBeenCalled();
    await act(async () => {
      flushMeasures();
    });
    await waitFor(() => {
      expect(view.queryByTestId('lookback-book-locating')).toBeNull();
    });
    expect(mockScrollTo).toHaveBeenCalledTimes(1);
    expect(mockScrollTo).toHaveBeenCalledWith({ y: 2080, animated: false });
    expect(mockScrollTo).not.toHaveBeenCalledWith({ y: 8, animated: false });
    const afterLocate = mockScrollTo.mock.calls.length;
    fireEvent(view.getByTestId('lookback-book-locate-day-2026-09-28'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 8, width: 390, height: 8 } },
    });
    flushMeasures();
    fireEvent.scroll(view.getByTestId('lookback-scroll'), {
      nativeEvent: {
        contentOffset: { y: 36, x: 0 },
        contentSize: { height: 4200, width: 390 },
        layoutMeasurement: { height: 844, width: 390 },
      },
    });
    expect(mockScrollTo.mock.calls.length).toBe(afterLocate);
    expect(view.queryByTestId('lookback-book-locating')).toBeNull();
  });
});
