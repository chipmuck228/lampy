import type { ReactElement } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LookbackIndexScreen from '../app/lookback/index';
import { resetLookbackSessionForTests } from '../application/lookback-session';
import { resetRecentClipMemoryForTests } from './recent-clip-memory';

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
      addListener: () => () => undefined,
    }),
  };
});

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    getLookbackBook: mockGetLookbackBook,
    getHistoryMonth: mockGetHistoryMonth,
    getHistoryDay: mockGetHistoryDay,
    getHistoryUnknown: async () => ({ items: [], hasMore: false, title: '', explanation: '' }),
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

describe('lookback book expand', () => {
  beforeEach(() => {
    cleanup();
    mockPush.mockReset();
    mockGetLookbackBook.mockReset();
    mockGetHistoryMonth.mockReset();
    mockGetHistoryDay.mockReset();
    resetLookbackSessionForTests();
    resetRecentClipMemoryForTests();
    Dimensions.set({
      window: { width: 390, height: 844, scale: 2, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 2, fontScale: 1 },
    });
  });

  it('opens a selected day for continuous reading and keeps the exact id', async () => {
    mockGetLookbackBook.mockResolvedValue({
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
    });
    mockGetHistoryMonth.mockResolvedValue({
      year: 2026,
      month: 9,
      title: '2026年9月',
      dayUnconfirmedCount: 0,
      dayUnconfirmedLabel: '日子未确认',
      isEmpty: false,
      days: Array.from({ length: 30 }, (_, index) => {
        const day = index + 1;
        const count = day === 27 ? 11 : day === 28 ? 3 : 0;
        return {
          day,
          label: `9月${day}日`,
          count,
          status: count > 0 ? 'filled' : 'quiet',
          summary: count > 0 ? `有${count}条记录` : '安静',
        };
      }),
    });
    mockGetHistoryDay.mockResolvedValue({
      year: 2026,
      month: 9,
      day: 27,
      title: '2026年9月27日',
      isEmpty: false,
      items: [
        {
          id: 'm_first',
          note: '第一条',
          precision: 'day',
          timeLabel: '2026年9月27日',
          usedRecordedAtFallback: false,
          feeling: null,
          images: [],
          audio: null,
          unknownMedia: [],
        },
        {
          id: 'm_second',
          note: '第二条',
          precision: 'day',
          timeLabel: '2026年9月27日',
          usedRecordedAtFallback: false,
          feeling: null,
          images: [],
          audio: null,
          unknownMedia: [],
        },
        {
          id: 'm_third',
          note: '第三条',
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
      expect(view.getByTestId('lookback-catalog-toggle')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-catalog-toggle'));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-day-2026-09-27')).toBeTruthy();
    });
    expect(view.getByLabelText('2026年9月，有14条记录，已展开')).toBeTruthy();
    expect(view.queryByTestId('lookback-month-calendar')).toBeNull();
    expect(view.getByText('28日 / 周一 / 3条')).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-book-day-2026-09-27'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-open-m_first')).toBeTruthy();
    });
    expect(view.getByLabelText('2026年9月27日，星期日，11条')).toBeTruthy();
    expect(view.getByText('第一条')).toBeTruthy();
    expect(view.getByText('第二条')).toBeTruthy();
    expect(view.getByText('第三条')).toBeTruthy();
    expect(view.queryByLabelText('这一天还有9条')).toBeNull();
    fireEvent.press(view.getByTestId('lookback-book-open-m_first'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/moment/[id]', params: { id: 'm_first' } });
    view.unmount();
  });
});
