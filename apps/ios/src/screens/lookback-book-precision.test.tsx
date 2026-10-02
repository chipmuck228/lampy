import type { ReactElement } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LookbackIndexScreen from '../app/lookback/index';
import { resetLookbackSessionForTests } from '../application/lookback-session';

const mockPush = jest.fn();
const mockGetLookbackBook = jest.fn();
const mockGetHistoryMonth = jest.fn();

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
      addListener: () => () => undefined,
    }),
  };
});

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    getLookbackBook: mockGetLookbackBook,
    getHistoryMonth: mockGetHistoryMonth,
    getHistoryDay: jest.fn(),
    getHistoryUnknown: async () => ({ items: [], hasMore: false, title: '', explanation: '' }),
    getHistoryYearUnconfirmed: async () => ({
      items: [],
      hasMore: false,
      title: '这一年，月份未确认',
      explanation: '这些记录只知道年份。',
    }),
    getHistoryMonthUnconfirmed: async () => ({
      items: [],
      hasMore: false,
      title: '日子未确认',
      explanation: '这些记录只知道月份。',
    }),
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

describe('lookback book precision rows', () => {
  beforeEach(() => {
    cleanup();
    mockPush.mockReset();
    mockGetLookbackBook.mockReset();
    mockGetHistoryMonth.mockReset();
    resetLookbackSessionForTests();
    Dimensions.set({
      window: { width: 390, height: 844, scale: 2, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 2, fontScale: 1 },
    });
  });

  it('keeps year-precision outside months and month-precision off the date list', async () => {
    mockGetLookbackBook.mockResolvedValue({
      unknownCount: 0,
      isEmpty: false,
      years: [
        {
          year: 2026,
          momentCount: 3,
          title: '2026年',
          yearUnconfirmedCount: 1,
          yearUnconfirmedLabel: '这一年，月份未确认',
          months: [{ month: 4, label: '4月', count: 2, summary: '有2条记录' }],
        },
      ],
    });
    mockGetHistoryMonth.mockResolvedValue({
      year: 2026,
      month: 4,
      title: '2026年4月',
      dayUnconfirmedCount: 2,
      dayUnconfirmedLabel: '日子未确认',
      isEmpty: false,
      days: Array.from({ length: 30 }, (_, index) => ({
        day: index + 1,
        label: `4月${index + 1}日`,
        count: 0,
        status: 'quiet',
        summary: '安静',
      })),
    });
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-year-unconfirmed-2026')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-book-month-2026-04'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-day-unconfirmed-2026-04')).toBeTruthy();
    });
    expect(view.queryByTestId(/lookback-book-day-2026-04-/)).toBeNull();
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-book-year-unconfirmed-2026'));
    });
    await waitFor(() => {
      expect(view.getByText('这一年，月份未确认')).toBeTruthy();
    });
    expect(mockPush).not.toHaveBeenCalled();
    view.unmount();
  });
});
