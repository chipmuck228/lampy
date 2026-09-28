import type { ReactElement } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions, ScrollView } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LookbackIndexScreen from '../app/lookback/index';
import { rememberLookbackScroll, resetLookbackSessionForTests, writeLookbackBookIntent } from '../application/lookback-session';

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

function reset() {
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
}

describe('lookback book year locate', () => {
  beforeEach(reset);
  afterEach(() => {
    cleanup();
  });

  it('scrolls a year intent to that chapter instead of restoring the last /lookback offset', async () => {
    rememberLookbackScroll('/lookback', 18);
    writeLookbackBookIntent({ year: 2024 });
    mockGetLookbackBook.mockResolvedValue({
      unknownCount: 0,
      isEmpty: false,
      years: [2022, 2023, 2024].map((year) => ({
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
    expect(view.queryByTestId('lookback-book-expand-2024-01')).toBeNull();
    await act(async () => {
      fireEvent(view.getByTestId('lookback-book-locate-year-2024'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 640, width: 390, height: 48 } },
      });
    });
    await waitFor(() => {
      expect(view.queryByTestId('lookback-book-locating')).toBeNull();
    });
    expect(mockScrollTo).toHaveBeenCalledWith({ y: 640, animated: false });
    expect(mockScrollTo).not.toHaveBeenCalledWith({ y: 18, animated: false });
    const afterLocate = mockScrollTo.mock.calls.length;
    fireEvent(view.getByTestId('lookback-book-locate-year-2024'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 880, width: 390, height: 48 } },
    });
    fireEvent.scroll(view.getByTestId('lookback-scroll'), {
      nativeEvent: {
        contentOffset: { y: 24, x: 0 },
        contentSize: { height: 2400, width: 390 },
        layoutMeasurement: { height: 844, width: 390 },
      },
    });
    fireEvent(view.getByTestId('lookback-book-locate-year-2024'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 880, width: 390, height: 48 } },
    });
    expect(mockScrollTo.mock.calls.length).toBe(afterLocate);
  });
});
