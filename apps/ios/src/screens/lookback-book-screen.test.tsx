import type { ReactElement } from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LookbackIndexScreen from '../app/lookback/index';
import LookbackYearScreen from '../app/lookback/[year]/index';
import LookbackMonthScreen from '../app/lookback/[year]/[month]/index';
import LookbackDayScreen from '../app/lookback/[year]/[month]/[day]';
import {
  peekLookbackBookIntentForTests,
  resetLookbackSessionForTests,
  takeLookbackBookIntent,
  writeLookbackBookIntent,
} from '../application/lookback-session';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
const mockGetState = jest.fn();
const mockGetLookbackBook = jest.fn();
const mockGetHistoryMonth = jest.fn();
const mockGetHistoryDay = jest.fn();
const mockSearchParams: Record<string, string> = {
  year: '2026',
  month: '01',
  day: '02',
};

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    useRouter: () => ({
      push: mockPush,
      back: mockBack,
      replace: mockReplace,
      dismissTo: mockDismissTo,
    }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(effect, [effect]);
    },
    useLocalSearchParams: () => mockSearchParams,
    useNavigation: () => ({
      getState: mockGetState,
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

function bookView(overrides: Record<string, unknown> = {}) {
  return {
    unknownCount: 1,
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
    ...overrides,
  };
}

describe('lookback book screen', () => {
  beforeEach(() => {
    cleanup();
    mockPush.mockReset();
    mockReplace.mockReset();
    mockBack.mockReset();
    mockDismissTo.mockReset();
    mockGetLookbackBook.mockReset();
    mockGetHistoryMonth.mockReset();
    mockGetHistoryDay.mockReset();
    mockGetState.mockReset();
    mockGetState.mockReturnValue({ index: 0, routes: [{ name: 'lookback/index' }] });
    mockSearchParams.year = '2026';
    mockSearchParams.month = '01';
    mockSearchParams.day = '02';
    delete mockSearchParams.o;
    delete mockSearchParams.b;
    resetLookbackSessionForTests();
    Dimensions.set({
      window: { width: 390, height: 844, scale: 2, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 2, fontScale: 1 },
    });
  });

  it('shows a quiet empty lookback only when the book is truly empty', async () => {
    mockGetLookbackBook.mockResolvedValue({ unknownCount: 0, isEmpty: true, years: [] });
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByTestId('lookback-empty')).toBeTruthy();
    }, { timeout: 10000 });
    expect(view.getByText('以后可以按时间回来看。')).toBeTruthy();
    expect(view.queryByTestId('lookback-unconfirmed')).toBeNull();
    view.unmount();
  });

  it('does not treat unknown dates as an empty library', async () => {
    mockGetLookbackBook.mockResolvedValue({ unknownCount: 2, isEmpty: false, years: [] });
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByLabelText('时间未确认，有2条记录')).toBeTruthy();
    });
    expect(view.queryByTestId('lookback-empty')).toBeNull();
    view.unmount();
  });

  it('opens recorded months on the lookback book without a top back', async () => {
    mockGetLookbackBook.mockResolvedValue(bookView());
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-year-2026')).toBeTruthy();
    });
    expect(view.getByLabelText('时间未确认，有1条记录')).toBeTruthy();
    expect(view.getByText('9月')).toBeTruthy();
    expect(view.getAllByText('14条').length).toBeGreaterThanOrEqual(1);
    expect(view.getByLabelText('2026年9月，有14条记录，已收起')).toBeTruthy();
    expect(view.queryByTestId('lookback-year-2026')).toBeNull();
    expect(view.getByTestId('root-nav-band')).toBeTruthy();
    expect(view.queryByTestId('lookback-back')).toBeNull();
    view.unmount();
  });

  it('consumes a year-only intent without expanding a month or inventing a day', async () => {
    writeLookbackBookIntent({ year: 2026 });
    mockGetLookbackBook.mockResolvedValue(bookView());
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-year-2026')).toBeTruthy();
    });
    expect(view.queryByTestId('lookback-book-expand-2026-09')).toBeNull();
    expect(view.queryByTestId('lookback-book-selected-day')).toBeNull();
    expect(view.getByTestId('lookback-book-locate-year-2026')).toBeTruthy();
    expect(takeLookbackBookIntent()).toBeNull();
    view.unmount();
  });

  it('replaces a year deep link onto /lookback with a one-shot year intent', async () => {
    mockSearchParams.year = '2026';
    const yearPage = await render(wrap(<LookbackYearScreen />));
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/lookback');
    });
    expect(takeLookbackBookIntent()).toEqual({ year: 2026 });
    expect(takeLookbackBookIntent()).toBeNull();
    yearPage.unmount();
  });

  it('replaces a month deep link onto /lookback with a one-shot month intent', async () => {
    mockSearchParams.year = '2026';
    mockSearchParams.month = '09';
    const monthPage = await render(wrap(<LookbackMonthScreen />));
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/lookback');
    });
    expect(peekLookbackBookIntentForTests()).toEqual({ year: 2026, month: 9 });
    monthPage.unmount();
  });

  it('writes the day route into a book intent when leaving a cold day page', async () => {
    mockGetHistoryDay.mockResolvedValue({
      year: 2026,
      month: 1,
      day: 2,
      title: '2026年1月2日',
      isEmpty: false,
      items: [
        {
          id: 'm_exact',
          note: '门口的风',
          precision: 'day',
          timeLabel: '2026年1月2日',
          usedRecordedAtFallback: false,
          feeling: null,
          images: [],
          audio: null,
          unknownMedia: [],
        },
      ],
      hasMore: false,
    });
    const day = await render(wrap(<LookbackDayScreen />));
    await waitFor(() => {
      expect(day.getByText('门口的风')).toBeTruthy();
    });
    fireEvent.press(day.getByTestId('lookback-back'));
    expect(takeLookbackBookIntent()).toEqual({ year: 2026, month: 1, day: 2 });
    expect(mockDismissTo).toHaveBeenCalledWith('/lookback');
    expect(mockBack).not.toHaveBeenCalled();
    day.unmount();
  });
});
