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
let anchorPageY = 400;

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

function armBook() {
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
  mockGetHistoryDay.mockImplementation(async (_year, _month, day: number) => ({
    year: 2026,
    month: 9,
    day,
    title: `2026年9月${day}日`,
    isEmpty: false,
    items: [
      {
        id: `m_${day}`,
        note: `第${day}天摘录`,
        precision: 'day',
        timeLabel: `2026年9月${day}日`,
        usedRecordedAtFallback: false,
        feeling: null,
        images: [],
        audio: null,
        unknownMedia: [],
      },
    ],
    hasMore: false,
  }));
}

function dayId(day: number) {
  return `day-2026-09-${String(day).padStart(2, '0')}`;
}

async function openMonth() {
  writeLookbackBookIntent({ year: 2026, month: 9 });
  const view = await render(wrap(<LookbackIndexScreen />));
  await waitFor(() => {
    expect(view.getByTestId('lookback-book-day-2026-09-28')).toBeTruthy();
  });
  return view;
}

async function pickDay(view: Awaited<ReturnType<typeof openMonth>>, day: number) {
  if (!view.queryByTestId('lookback-catalog')) {
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-catalog-toggle'));
    });
    await waitFor(() => {
      expect(view.getByTestId(`lookback-book-day-2026-09-${String(day).padStart(2, '0')}`)).toBeTruthy();
    });
  }
  await act(async () => {
    fireEvent.press(view.getByTestId(`lookback-book-day-2026-09-${String(day).padStart(2, '0')}`));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  await waitFor(() => {
    expect(view.getByText(`第${day}天摘录`)).toBeTruthy();
  });
  await waitFor(() => {
    expect(view.getByTestId('lookback-book-locating').props.accessibilityLabel).toBe(dayId(day));
  });
}

function fireLocate(view: Awaited<ReturnType<typeof openMonth>>, day: number) {
  fireEvent(view.getByTestId(`lookback-book-locate-${dayId(day)}`), 'layout', {
    nativeEvent: { layout: { x: 0, y: 8, width: 390, height: 8 } },
  });
}

describe('lookback book staggered same-day locate', () => {
  beforeEach(() => {
    cleanup();
    mockGetLookbackBook.mockReset();
    mockGetHistoryMonth.mockReset();
    mockGetHistoryDay.mockReset();
    mockScrollTo.mockReset();
    pendingMeasures.length = 0;
    anchorPageY = 400;
    jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(mockScrollTo);
    jest.spyOn(View.prototype, 'measureInWindow').mockImplementation(function (this: object, callback) {
      const isScroll = this instanceof ScrollView;
      const y = isScroll ? 120 : anchorPageY;
      pendingMeasures.push(() => callback(0, y, 390, isScroll ? 844 : 48));
    });
    resetLookbackSessionForTests();
    Dimensions.set({
      window: { width: 390, height: 844, scale: 2, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 2, fontScale: 1 },
    });
    armBook();
  });

  afterEach(() => {
    cleanup();
  });

  it('does not let the first day-10 measure win after 10→28→10', async () => {
    const view = await openMonth();
    mockScrollTo.mockClear();
    pendingMeasures.length = 0;
    anchorPageY = 400;
    await pickDay(view, 10);
    await act(async () => {
      fireLocate(view, 10);
    });
    anchorPageY = 2200;
    await pickDay(view, 28);
    await act(async () => {
      fireLocate(view, 28);
    });
    anchorPageY = 800;
    await pickDay(view, 10);
    await act(async () => {
      fireLocate(view, 10);
      flushMeasures();
    });
    await waitFor(() => {
      expect(view.queryByTestId('lookback-book-locating')).toBeNull();
    });
    expect(mockScrollTo).toHaveBeenCalledTimes(1);
    expect(mockScrollTo).toHaveBeenCalledWith({ y: 680, animated: false });
    expect(mockScrollTo).not.toHaveBeenCalledWith({ y: 280, animated: false });
    expect(mockScrollTo).not.toHaveBeenCalledWith({ y: 2080, animated: false });
  });
});
