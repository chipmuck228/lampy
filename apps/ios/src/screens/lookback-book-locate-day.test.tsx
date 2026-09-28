import type { ReactElement } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions, ScrollView } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LookbackIndexScreen from '../app/lookback/index';
import { resetLookbackSessionForTests, writeLookbackBookIntent } from '../application/lookback-session';

const mockGetLookbackBook = jest.fn();
const mockGetHistoryMonth = jest.fn();
const mockGetHistoryDay = jest.fn();
const mockScrollTo = jest.fn();

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
    jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(mockScrollTo);
    resetLookbackSessionForTests();
    Dimensions.set({
      window: { width: 390, height: 844, scale: 2, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 2, fontScale: 1 },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('clears the locate after one scroll so relayout and a later day do not pull back', async () => {
    writeLookbackBookIntent({ year: 2026, month: 9, day: 24 });
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
      days: Array.from({ length: 30 }, (_, index) => ({
        day: index + 1,
        label: `9月${index + 1}日`,
        count: index + 1 === 24 ? 2 : index + 1 === 28 ? 1 : 0,
        status: index + 1 === 24 || index + 1 === 28 ? 'filled' : 'quiet',
        summary: index + 1 === 24 ? '有2条记录' : index + 1 === 28 ? '有1条记录' : '安静',
      })),
    });
    mockGetHistoryDay.mockResolvedValue({
      year: 2026,
      month: 9,
      day: 24,
      title: '2026年9月24日',
      isEmpty: false,
      items: [
        {
          id: 'm_day',
          note: '冷日回来',
          precision: 'day',
          timeLabel: '2026年9月24日',
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
      expect(view.getByText('冷日回来')).toBeTruthy();
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-locating')).toBeTruthy();
    });
    await act(async () => {
      fireEvent(view.getByTestId('lookback-book-locate-day-2026-09-24'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 480, width: 390, height: 80 } },
      });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.queryByTestId('lookback-book-locating')).toBeNull();
    });
    expect(mockScrollTo).toHaveBeenCalledWith({ y: 480, animated: false });
    const afterLocate = mockScrollTo.mock.calls.length;
    fireEvent(view.getByTestId('lookback-book-locate-day-2026-09-24'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 620, width: 390, height: 160 } },
    });
    fireEvent.scroll(view.getByTestId('lookback-scroll'), {
      nativeEvent: {
        contentOffset: { y: 36, x: 0 },
        contentSize: { height: 2400, width: 390 },
        layoutMeasurement: { height: 844, width: 390 },
      },
    });
    expect(mockScrollTo.mock.calls.length).toBe(afterLocate);
    mockGetHistoryDay.mockResolvedValue({
      year: 2026,
      month: 9,
      day: 28,
      title: '2026年9月28日',
      isEmpty: false,
      items: [
        {
          id: 'm_28',
          note: '换日后的摘录',
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
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-book-day-2026-09-28'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByText('换日后的摘录')).toBeTruthy();
    });
    fireEvent(view.getByTestId('lookback-book-locate-day-2026-09-24'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 480, width: 390, height: 80 } },
    });
    expect(mockScrollTo.mock.calls.length).toBe(afterLocate);
    expect(view.queryByTestId('lookback-book-locating')).toBeNull();
  });
});
