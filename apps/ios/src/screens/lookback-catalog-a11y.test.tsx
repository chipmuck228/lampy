import type { ReactElement } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LookbackIndexScreen from '../app/lookback/index';
import { resetLookbackSessionForTests } from '../application/lookback-session';

const mockGetLookbackBook = jest.fn();
const mockGetHistoryMonth = jest.fn();
const mockGetHistoryDay = jest.fn();
const mockPause = jest.fn(async () => undefined);

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
    getHistoryUnknown: async () => ({ items: [], hasMore: false, title: '', explanation: '' }),
    getHistoryYearUnconfirmed: async () => ({ items: [], hasMore: false, title: '', explanation: '' }),
    getHistoryMonthUnconfirmed: async () => ({ items: [], hasMore: false, title: '', explanation: '' }),
  }),
}));

jest.mock('./use-recent-clip-playback', () => ({
  useRecentClipPlayback: () => ({
    card: () => ({ status: 'playing', currentTimeMs: 1200 }),
    play: jest.fn(),
    pause: mockPause,
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

describe('lookback catalog overlay a11y', () => {
  beforeEach(() => {
    cleanup();
    mockGetLookbackBook.mockReset();
    mockGetHistoryMonth.mockReset();
    mockGetHistoryDay.mockReset();
    mockPause.mockClear();
    resetLookbackSessionForTests();
    Dimensions.set({
      window: { width: 390, height: 844, scale: 2, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 2, fontScale: 1 },
    });
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
        count: index + 1 === 27 ? 1 : 0,
        status: index + 1 === 27 ? 'filled' : 'quiet',
        summary: index + 1 === 27 ? '有1条记录' : '安静',
      })),
    });
    mockGetHistoryDay.mockResolvedValue({
      year: 2026,
      month: 9,
      day: 27,
      title: '2026年9月27日',
      isEmpty: false,
      items: [
        {
          id: 'm1',
          note: '门口的风还在。',
          precision: 'day',
          timeLabel: '2026年9月27日',
          usedRecordedAtFallback: false,
          feeling: null,
          images: [],
          audio: { id: 'a1', status: 'available', uri: 'memory://a.m4a', durationMs: 4000, label: '一段声音' },
          unknownMedia: [],
        },
      ],
      hasMore: false,
    });
  });

  it('hides the reading tree from VoiceOver while the catalog is open and does not autoplay on close', async () => {
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByTestId('lookback-reading-m1')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('lookback-change-day'));
    });
    await waitFor(() => {
      expect(view.getByTestId('lookback-catalog')).toBeTruthy();
    });
    expect(mockPause).toHaveBeenCalled();
    expect(view.getByTestId('lookback-catalog-close')).toBeTruthy();
    const fab = view.getByTestId('lookback-leave-fab', { includeHiddenElements: true });
    expect(fab.props.accessibilityElementsHidden).toBe(true);
    expect(fab.props.accessibilityState?.disabled ?? fab.props.disabled).toBeTruthy();
    const tree = view.getByTestId('lookback-reading-tree', { includeHiddenElements: true });
    expect(tree.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(tree.props.accessibilityElementsHidden).toBe(true);
    expect(view.getByTestId('lookback-reading-m1', { includeHiddenElements: true })).toBeTruthy();
    fireEvent.press(view.getByTestId('lookback-catalog-close'));
    await waitFor(() => {
      expect(view.queryByTestId('lookback-catalog')).toBeNull();
    });
    expect(view.getByTestId('lookback-change-day')).toBeTruthy();
    expect(view.getByTestId('lookback-reading-tree').props.accessibilityElementsHidden).toBe(false);
  });
});
