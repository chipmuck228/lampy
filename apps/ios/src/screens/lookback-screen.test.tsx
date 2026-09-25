import type { ReactElement } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
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
const mockGetHistoryYears = jest.fn();
const mockGetHistoryYear = jest.fn();
const mockGetHistoryDay = jest.fn();
const mockGetHistoryUnknown = jest.fn();

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(effect, [effect]);
    },
    useLocalSearchParams: () => ({ year: '2026', month: '01', day: '02', id: 'm_exact' }),
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
    resetLookbackSessionForTests();
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
      expect(view.getByLabelText('2026年1月，有2条记录')).toBeTruthy();
    });
    expect(view.getByLabelText('2026年4月，安静')).toBeTruthy();
    fireEvent.press(view.getByTestId('lookback-month-2026-01'));
    expect(mockPush).toHaveBeenCalledWith('/lookback/2026/01');
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
    expect(day.getByText('2026年1月2日')).toBeTruthy();
    expect(day.getByLabelText('照片 1/3')).toBeTruthy();
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
    expect(shelf.getByText('时间未确认')).toBeTruthy();
    expect(shelf.getByLabelText('照片 1/1')).toBeTruthy();
    expect(shelf.getByText('这段声音暂时无法播放，其他内容仍然保留。')).toBeTruthy();
    expect(shelf.getByText('这份内容暂时无法打开。')).toBeTruthy();
    expect(shelf.queryByText('这条记录现在无法找到')).toBeNull();
    fireEvent.press(shelf.getByTestId('lookback-moment-m_unknown'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/moment/[id]', params: { id: 'm_unknown' } });
    expect(shelf.getByText('时间未确认')).toBeTruthy();
    expect(readLookbackScroll('/lookback/unconfirmed')).toBe(120);
  });

});
