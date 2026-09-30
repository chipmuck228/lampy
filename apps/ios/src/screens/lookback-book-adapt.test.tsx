import type { ReactElement } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LookbackIndexScreen from '../app/lookback/index';
import { resetLookbackSessionForTests } from '../application/lookback-session';

const mockGetLookbackBook = jest.fn();
const mockGetHistoryMonth = jest.fn();
const mockGetHistoryDay = jest.fn();

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

function wrap(ui: ReactElement, width: number, height: number) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width, height },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      {ui}
    </SafeAreaProvider>
  );
}

function armSparseBook() {
  mockGetLookbackBook.mockResolvedValue({
    unknownCount: 0,
    isEmpty: false,
    years: [
      {
        year: 2025,
        momentCount: 1,
        title: '2025年',
        yearUnconfirmedCount: 0,
        yearUnconfirmedLabel: '这一年，月份未确认',
        months: [{ month: 4, label: '4月', count: 1, summary: '有1条记录' }],
      },
    ],
  });
  mockGetHistoryMonth.mockResolvedValue({
    year: 2025,
    month: 4,
    title: '2025年4月',
    dayUnconfirmedCount: 0,
    dayUnconfirmedLabel: '日子未确认',
    isEmpty: false,
    days: Array.from({ length: 30 }, (_, index) => {
      const day = index + 1;
      const filled = day === 8;
      return {
        day,
        label: `4月${day}日`,
        count: filled ? 1 : 0,
        status: filled ? 'filled' : 'quiet',
        summary: filled ? '有1条记录' : '安静',
      };
    }),
  });
  mockGetHistoryDay.mockResolvedValue({
    year: 2025,
    month: 4,
    day: 8,
    title: '2025年4月8日',
    isEmpty: false,
    items: [
      {
        id: 'm_sparse',
        note: '稀疏月一条',
        precision: 'day',
        timeLabel: '2025年4月8日',
        usedRecordedAtFallback: false,
        feeling: null,
        images: [],
        audio: null,
        unknownMedia: [],
      },
    ],
    hasMore: false,
  });
}

describe('lookback book adapt surfaces', () => {
  beforeEach(() => {
    cleanup();
    mockGetLookbackBook.mockReset();
    mockGetHistoryMonth.mockReset();
    mockGetHistoryDay.mockReset();
    resetLookbackSessionForTests();
    armSparseBook();
  });

  afterEach(() => {
    cleanup();
  });

  it('opens a sparse month as one date row and shows that day’s excerpt', async () => {
    Dimensions.set({
      window: { width: 390, height: 844, scale: 2, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 2, fontScale: 1 },
    });
    const view = await render(wrap(<LookbackIndexScreen />, 390, 844));
    await waitFor(() => {
      expect(view.getByLabelText('2025年4月，有1条记录，已收起')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-book-month-2025-04'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByLabelText('4月8日 · 星期二，有1条记录')).toBeTruthy();
    });
    expect(view.queryByTestId(/lookback-book-day-2025-04-(?!08)/)).toBeNull();
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-book-day-2025-04-08'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByText('稀疏月一条')).toBeTruthy();
    });
    expect(view.getByLabelText('看这条，稀疏月一条')).toBeTruthy();
    view.unmount();
  });

  it('keeps the book and bottom band on a short landscape phone', async () => {
    Dimensions.set({
      window: { width: 852, height: 393, scale: 2, fontScale: 1 },
      screen: { width: 852, height: 393, scale: 2, fontScale: 1 },
    });
    const view = await render(wrap(<LookbackIndexScreen />, 852, 393));
    await waitFor(() => {
      expect(view.getByText('2025年')).toBeTruthy();
    });
    expect(view.getByTestId('root-nav-band')).toBeTruthy();
    expect(view.getByLabelText('回看，当前页')).toBeTruthy();
    expect(view.queryByTestId('lookback-back')).toBeNull();
    view.unmount();
  });

  it('keeps the same book on a regular-width iPad and still names the year', async () => {
    Dimensions.set({
      window: { width: 1024, height: 1366, scale: 2, fontScale: 1 },
      screen: { width: 1024, height: 1366, scale: 2, fontScale: 1 },
    });
    const view = await render(wrap(<LookbackIndexScreen />, 1024, 1366));
    await waitFor(() => {
      expect(view.getByLabelText('2025年4月，有1条记录，已收起')).toBeTruthy();
    });
    expect(view.getByTestId('root-nav-band')).toBeTruthy();
    expect(view.getByLabelText('回看，当前页')).toBeTruthy();
    view.unmount();
  });
});
