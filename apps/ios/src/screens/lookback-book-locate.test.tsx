import type { ReactElement } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions, ScrollView, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LookbackIndexScreen from '../app/lookback/index';
import { rememberLookbackScroll, resetLookbackSessionForTests, writeLookbackBookIntent } from '../application/lookback-session';

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
      addListener: () => () => undefined,
    }),
  };
});

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    getLookbackBook: mockGetLookbackBook,
    getHistoryMonth: mockGetHistoryMonth,
    getHistoryDay: mockGetHistoryDay,
    getHistoryUnknown: async () => ({ items: [], hasMore: false, title: '时间未确认', explanation: '' }),
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

function reset() {
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
      else callback(0, 1960, 390, 48);
    });
  });
  resetLookbackSessionForTests();
  Dimensions.set({
    window: { width: 390, height: 844, scale: 2, fontScale: 1 },
    screen: { width: 390, height: 844, scale: 2, fontScale: 1 },
  });
}

describe('lookback book year locate', () => {
  beforeEach(reset);
  afterEach(() => {
    cleanup();
  });

  it('scrolls a far year from window measure instead of a nested layout y or the last offset', async () => {
    rememberLookbackScroll('/lookback', 18);
    writeLookbackBookIntent({ year: 2018 });
    mockGetLookbackBook.mockResolvedValue({
      unknownCount: 0,
      isEmpty: false,
      years: [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018].map((year) => ({
        year,
        momentCount: 1,
        title: `${year}年`,
        yearUnconfirmedCount: 0,
        yearUnconfirmedLabel: '这一年，月份未确认',
        months: [{ month: 1, label: '1月', count: 1, summary: '有1条记录' }],
      })),
    });
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-locating')).toBeTruthy();
    });
    expect(view.getByText('2018年')).toBeTruthy();
    expect(view.getByText('2026年')).toBeTruthy();
    expect(view.queryByTestId('lookback-book-expand-2018-01')).toBeNull();
    await act(async () => {
      fireEvent(view.getByTestId('lookback-book-locate-year-2018'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 8, width: 390, height: 48 } },
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
    expect(mockScrollTo).toHaveBeenCalledWith({ y: 1840, animated: false });
    expect(mockScrollTo).not.toHaveBeenCalledWith({ y: 8, animated: false });
    expect(mockScrollTo).not.toHaveBeenCalledWith({ y: 18, animated: false });
    const afterLocate = mockScrollTo.mock.calls.length;
    fireEvent(view.getByTestId('lookback-book-locate-year-2018'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 8, width: 390, height: 48 } },
    });
    flushMeasures();
    fireEvent.scroll(view.getByTestId('lookback-catalog-scroll'), {
      nativeEvent: {
        contentOffset: { y: 24, x: 0 },
        contentSize: { height: 4200, width: 390 },
        layoutMeasurement: { height: 844, width: 390 },
      },
    });
    expect(mockScrollTo.mock.calls.length).toBe(afterLocate);
  });
});
