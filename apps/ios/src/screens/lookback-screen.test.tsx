import type { ReactElement } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  readLookbackScroll,
  rememberLookbackScroll,
  resetLookbackSessionForTests,
} from '../application/lookback-session';
import LookbackIndexScreen from '../app/lookback/index';
import LookbackYearScreen from '../app/lookback/[year]/index';
import LookbackDayScreen from '../app/lookback/[year]/[month]/[day]';
import LookbackUnconfirmedScreen from '../app/lookback/unconfirmed';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockDismissTo = jest.fn();
const mockGetState = jest.fn();
const mockGetHistoryYears = jest.fn();
const mockGetHistoryYear = jest.fn();
const mockGetHistoryDay = jest.fn();
const mockGetHistoryUnknown = jest.fn();
const mockSearchParams: Record<string, string> = {
  year: '2026',
  month: '01',
  day: '02',
  id: 'm_exact',
};

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    useRouter: () => ({
      push: mockPush,
      back: mockBack,
      replace: jest.fn(),
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
    getHistoryYears: mockGetHistoryYears,
    getHistoryYear: mockGetHistoryYear,
    getHistoryDay: mockGetHistoryDay,
    getHistoryUnknown: mockGetHistoryUnknown,
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

describe('lookback screens', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockGetHistoryYears.mockReset();
    mockGetHistoryYear.mockReset();
    mockGetHistoryDay.mockReset();
    mockGetHistoryUnknown.mockReset();
    mockBack.mockReset();
    mockDismissTo.mockReset();
    mockGetState.mockReset();
    mockGetState.mockReturnValue({ index: 0, routes: [{ name: 'lookback/index' }] });
    delete mockSearchParams.from;
    delete mockSearchParams.o;
    resetLookbackSessionForTests();
    Dimensions.set({
      window: { width: 390, height: 844, scale: 2, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 2, fontScale: 1 },
    });
  });

  it('opens a year from the lookback entrance', async () => {
    mockGetHistoryYears.mockResolvedValue({
      years: [
        {
          year: 2026,
          monthCounts: Array.from({ length: 12 }, () => 0),
          filledMonths: 0,
          quietMonths: 12,
          yearUnconfirmedCount: 0,
          momentCount: 2,
        },
      ],
      unknownCount: 1,
      isEmpty: false,
    });
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByLabelText('2026年，有2条记录')).toBeTruthy();
    });
    expect(view.getByLabelText('时间未确认，有1条记录')).toBeTruthy();
    fireEvent.press(view.getByTestId('lookback-year-2026'));
    expect(mockPush).toHaveBeenCalledWith('/lookback/2026');
    expect(view.getByTestId('root-nav-band')).toBeTruthy();
    expect(view.queryByTestId('lookback-back')).toBeNull();
  });

  it('keeps empty months and opens the selected month', async () => {
    mockGetHistoryYear.mockResolvedValue({
      year: 2026,
      title: '2026年',
      yearUnconfirmedCount: 0,
      yearUnconfirmedLabel: '这一年，月份未确认',
      months: Array.from({ length: 12 }, (_, index) => ({
        month: index + 1,
        label: `2026年${index + 1}月`,
        count: index === 0 ? 2 : 0,
        status: index === 0 ? 'filled' : 'quiet',
        summary: index === 0 ? '有2条记录' : '安静',
      })),
    });
    const view = await render(wrap(<LookbackYearScreen />));
    await waitFor(() => {
      expect(view.getByTestId('lookback-month-2026-01')).toBeTruthy();
    });
    expect(view.getAllByLabelText('2026年1月，有2条记录').length).toBeGreaterThan(0);
    expect(view.getByLabelText('2026年4月，安静')).toBeTruthy();
    expect(view.queryByTestId('lookback-month-2026-04')).toBeNull();
    expect(view.getByTestId('lookback-month-quiet-2026-04')).toBeTruthy();
    expect(view.getByText('1月 · 有2条记录')).toBeTruthy();
    fireEvent.press(view.getByTestId('lookback-month-2026-01'));
    expect(mockPush).toHaveBeenCalledWith('/lookback/2026/01');
    expect(view.queryByTestId('root-nav-band')).toBeNull();
    expect(view.getByTestId('lookback-back')).toBeTruthy();
  });

  it('keeps month-precision-unconfirmed records off the year grid', async () => {
    mockGetHistoryYear.mockResolvedValue({
      year: 2026,
      title: '2026年',
      yearUnconfirmedCount: 1,
      yearUnconfirmedLabel: '这一年，月份未确认',
      months: Array.from({ length: 12 }, (_, index) => ({
        month: index + 1,
        label: `2026年${index + 1}月`,
        count: 0,
        status: 'quiet',
        summary: '安静',
      })),
    });
    const view = await render(wrap(<LookbackYearScreen />));
    await waitFor(() => {
      expect(view.getByLabelText('这一年，月份未确认，有1条记录')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('lookback-year-unconfirmed-2026'));
    expect(mockPush).toHaveBeenCalledWith('/lookback/2026/unconfirmed');
    expect(view.queryByTestId('lookback-year-entries')).toBeNull();
  });

  it('shows a quiet empty year without inventing month buttons', async () => {
    mockGetHistoryYear.mockResolvedValue({
      year: 2026,
      title: '2026年',
      yearUnconfirmedCount: 0,
      yearUnconfirmedLabel: '这一年，月份未确认',
      months: Array.from({ length: 12 }, (_, index) => ({
        month: index + 1,
        label: `2026年${index + 1}月`,
        count: 0,
        status: 'quiet',
        summary: '安静',
      })),
    });
    const view = await render(wrap(<LookbackYearScreen />));
    await waitFor(() => {
      expect(view.getByText('这一年还没有留下什么。')).toBeTruthy();
    });
    expect(view.queryByTestId('lookback-year-entries')).toBeNull();
    expect(view.queryByTestId('lookback-month-2026-01')).toBeNull();
  });

  it('hides the year grid at large type and still opens a filled month from the list', async () => {
    Dimensions.set({
      window: { width: 768, height: 1024, scale: 2, fontScale: 1.3 },
      screen: { width: 768, height: 1024, scale: 2, fontScale: 1.3 },
    });
    mockGetHistoryYear.mockResolvedValue({
      year: 2026,
      title: '2026年',
      yearUnconfirmedCount: 0,
      yearUnconfirmedLabel: '这一年，月份未确认',
      months: Array.from({ length: 12 }, (_, index) => ({
        month: index + 1,
        label: `2026年${index + 1}月`,
        count: index === 8 ? 1 : 0,
        status: index === 8 ? 'filled' : 'quiet',
        summary: index === 8 ? '有1条记录' : '安静',
      })),
    });
    const view = await render(wrap(<LookbackYearScreen />));
    await waitFor(() => {
      expect(view.getByTestId('lookback-year-entries')).toBeTruthy();
    });
    expect(view.queryByTestId('lookback-year-months')).toBeNull();
    fireEvent.press(view.getByTestId('lookback-month-entry-2026-09'));
    expect(mockPush).toHaveBeenCalledWith('/lookback/2026/09');
  });

  it('keeps failed photos and sound on a lookback day, then returns to the same date', async () => {
    rememberLookbackScroll('/lookback/2026/01/02', 240);
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
          precision: 'exact',
          timeLabel: '2026年1月2日 08:15',
          usedRecordedAtFallback: false,
          feeling: { value: '平静', label: '平静', known: true },
          images: [
            {
              id: 'asset_ok',
              status: 'available',
              uri: 'memory://assets/asset_ok.jpg',
              width: 800,
              height: 600,
              label: '照片 1/3',
            },
            {
              id: 'asset_gone',
              status: 'unavailable',
              label: '照片 2/3',
              unavailableLabel: '这张照片暂时找不到了，但这条记录还在。',
              reason: 'missing',
            },
            {
              id: 'asset_broken',
              status: 'unavailable',
              label: '照片 3/3',
              unavailableLabel: '这张照片打不开了，但这条记录还在。',
              reason: 'undecodable',
            },
          ],
          audio: {
            id: 'asset_voice_lookback',
            status: 'unavailable',
            durationMs: 1800,
            durationLabel: '2秒',
            label: '当时的声音',
            unavailableLabel: '这段声音暂时找不到了，其他内容仍然保留。',
            reason: 'missing',
          },
          unknownMedia: [
            {
              id: 'asset_vanished',
              status: 'unavailable',
              label: '这份内容',
              unavailableLabel: '这份内容暂时无法打开。',
            },
          ],
        },
      ],
      hasMore: false,
    });

    const day = await render(wrap(<LookbackDayScreen />));
    await waitFor(() => {
      expect(day.getByText('门口的风')).toBeTruthy();
    });
    expect(day.getByText('当时的感受 · 平静')).toBeTruthy();
    expect(day.getByText('08:15')).toBeTruthy();
    expect(day.getByText('2026年1月2日')).toBeTruthy();
    expect(day.getByLabelText('照片 1/3')).toBeTruthy();
    expect(day.queryByLabelText('移除这张照片，照片 1/3')).toBeNull();
    expect(day.getByText('这张照片暂时找不到了，但这条记录还在。')).toBeTruthy();
    expect(day.getByText('这张照片打不开了，但这条记录还在。')).toBeTruthy();
    expect(day.getByText('这段声音暂时找不到了，其他内容仍然保留。')).toBeTruthy();
    expect(day.getByText('这份内容暂时无法打开。')).toBeTruthy();
    expect(day.queryByText('这条记录现在无法找到')).toBeNull();
    fireEvent.press(day.getByTestId('lookback-moment-m_exact'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/moment/[id]', params: { id: 'm_exact' } });
    expect(day.getByText('2026年1月2日')).toBeTruthy();
    expect(readLookbackScroll('/lookback/2026/01/02')).toBe(240);
  });

  it('keeps failed media on the unconfirmed shelf and returns to the same place', async () => {
    rememberLookbackScroll('/lookback/unconfirmed', 120);
    mockGetHistoryUnknown.mockResolvedValue({
      title: '时间未确认',
      explanation: '这些记录还没有确认发生的日子。',
      items: [
        {
          id: 'm_unknown',
          note: '未确认的一句',
          precision: 'unknown',
          timeLabel: '记录于 9月24日',
          usedRecordedAtFallback: true,
          feeling: { value: '喜悦', label: '喜悦', known: false },
          images: [
            {
              id: 'asset_unknown_ok',
              status: 'available',
              uri: 'memory://assets/asset_unknown_ok.jpg',
              width: 800,
              height: 600,
              label: '照片 1/1',
            },
          ],
          audio: {
            id: 'asset_unknown_voice',
            status: 'unavailable',
            durationMs: 2200,
            durationLabel: '3秒',
            label: '当时的声音',
            unavailableLabel: '这段声音暂时无法播放，其他内容仍然保留。',
            reason: 'unplayable',
          },
          unknownMedia: [
            {
              id: 'asset_unknown_vanished',
              status: 'unavailable',
              label: '这份内容',
              unavailableLabel: '这份内容暂时无法打开。',
            },
          ],
        },
      ],
      hasMore: false,
    });

    const shelf = await render(wrap(<LookbackUnconfirmedScreen />));
    await waitFor(() => {
      expect(mockGetHistoryUnknown).toHaveBeenCalled();
      expect(shelf.getByText('未确认的一句')).toBeTruthy();
    });
    expect(shelf.getByText('当时的感受 · 喜悦')).toBeTruthy();
    expect(shelf.getByText('时间未确认')).toBeTruthy();
    expect(shelf.getByLabelText('照片 1/1')).toBeTruthy();
    expect(shelf.queryByLabelText('移除这张照片，照片 1/1')).toBeNull();
    expect(shelf.getByText('这段声音暂时无法播放，其他内容仍然保留。')).toBeTruthy();
    expect(shelf.getByText('这份内容暂时无法打开。')).toBeTruthy();
    expect(shelf.queryByText('这条记录现在无法找到')).toBeNull();
    fireEvent.press(shelf.getByTestId('lookback-moment-m_unknown'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/moment/[id]', params: { id: 'm_unknown' } });
    expect(shelf.getByText('时间未确认')).toBeTruthy();
    expect(readLookbackScroll('/lookback/unconfirmed')).toBe(120);
  });

  it('keeps a long day page scrollable and restores the previous offset', async () => {
    rememberLookbackScroll('/lookback/2026/01/02', 180);
    const longNote =
      '同一天的第二条，文字很长，用来确认三张照片和声音提示都在标题下面，并且能滚到末尾。'.repeat(8);
    mockGetHistoryDay.mockResolvedValue({
      year: 2026,
      month: 1,
      day: 2,
      title: '2026年1月2日',
      isEmpty: false,
      items: [
        {
          id: 'm_first',
          note: '先留下的一句',
          precision: 'day',
          timeLabel: '2026年1月2日',
          usedRecordedAtFallback: false,
          feeling: { value: '高兴', label: '高兴', known: true },
          images: [
            {
              id: 'asset_a',
              status: 'available',
              uri: 'memory://assets/asset_a.jpg',
              width: 1200,
              height: 1600,
              label: '照片 1/3',
            },
            {
              id: 'asset_b',
              status: 'available',
              uri: 'memory://assets/asset_b.jpg',
              width: 1200,
              height: 1600,
              label: '照片 2/3',
            },
            {
              id: 'asset_c',
              status: 'unavailable',
              label: '照片 3/3',
              unavailableLabel: '这张照片暂时找不到了，但这条记录还在。',
            },
          ],
          audio: null,
          unknownMedia: [],
        },
        {
          id: 'm_second',
          note: longNote,
          precision: 'day',
          timeLabel: '2026年1月2日',
          usedRecordedAtFallback: false,
          feeling: null,
          images: [],
          audio: {
            id: 'asset_voice_long',
            status: 'unavailable',
            durationMs: 4000,
            durationLabel: '4秒',
            label: '当时的声音',
            unavailableLabel: '这段声音暂时找不到了，其他内容仍然保留。',
            reason: 'missing',
          },
          unknownMedia: [],
        },
      ],
      hasMore: true,
    });
    const day = await render(wrap(<LookbackDayScreen />));
    await waitFor(() => {
      expect(day.getByText('先留下的一句')).toBeTruthy();
    });
    expect(day.getByTestId('lookback-scroll')).toBeTruthy();
    expect(day.getByLabelText('返回原来的位置')).toBeTruthy();
    expect(day.getAllByText('2026年1月2日').length).toBeGreaterThan(0);
    expect(day.getByLabelText('照片 1/3')).toBeTruthy();
    expect(day.getByLabelText('照片 3/3。这张照片暂时找不到了，但这条记录还在。')).toBeTruthy();
    expect(day.getByText(longNote)).toBeTruthy();
    expect(day.getByText('这段声音暂时找不到了，其他内容仍然保留。')).toBeTruthy();
    expect(day.getByLabelText('继续往下看')).toBeTruthy();
    expect(readLookbackScroll('/lookback/2026/01/02')).toBe(180);
    fireEvent.press(day.getByTestId('lookback-moment-m_second'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/moment/[id]', params: { id: 'm_second' } });
    expect(day.getByLabelText('返回原来的位置')).toBeTruthy();
  });

  it('keeps an empty day neutral and does not invent a moment', async () => {
    mockGetHistoryDay.mockResolvedValue({
      year: 2026,
      month: 4,
      day: 3,
      title: '2026年4月3日',
      isEmpty: true,
      items: [],
      hasMore: false,
    });
    const day = await render(wrap(<LookbackDayScreen />));
    await waitFor(() => {
      expect(day.getByText('这一天还没有留下什么。')).toBeTruthy();
    });
    expect(day.queryByTestId(/lookback-moment-/)).toBeNull();
  });

  it('shows a clock only on the exact item when the same day also has date precision', async () => {
    mockGetHistoryDay.mockResolvedValue({
      year: 2026,
      month: 9,
      day: 24,
      title: '2026年9月24日',
      isEmpty: false,
      items: [
        {
          id: 'm_exact',
          note: '门口的风',
          precision: 'exact',
          timeLabel: '2026年9月24日 08:15',
          usedRecordedAtFallback: false,
          feeling: null,
          images: [],
          audio: null,
          unknownMedia: [],
        },
        {
          id: 'm_day',
          note: '后来又写了一句',
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
    const day = await render(wrap(<LookbackDayScreen />));
    await waitFor(() => {
      expect(day.getByText('门口的风')).toBeTruthy();
    });
    expect(day.getByText('08:15')).toBeTruthy();
    expect(day.getByText('后来又写了一句')).toBeTruthy();
    expect(day.getAllByText('08:15')).toHaveLength(1);
    fireEvent.press(day.getByTestId('lookback-moment-m_day'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/moment/[id]', params: { id: 'm_day' } });
  });

  it('hides feeling on lookback day when none was chosen', async () => {
    mockGetHistoryDay.mockResolvedValue({
      year: 2026,
      month: 1,
      day: 2,
      title: '2026年1月2日',
      isEmpty: false,
      items: [
        {
          id: 'm_plain',
          note: '只写字',
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
      expect(day.getByText('只写字')).toBeTruthy();
    });
    expect(day.queryByText(/当时的感受/)).toBeNull();
  });
});
