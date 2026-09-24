import type { ReactElement } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LookbackIndexScreen from '../app/lookback/index';
import LookbackYearScreen from '../app/lookback/[year]/index';
import LookbackDayScreen from '../app/lookback/[year]/[month]/[day]';
import MomentDetailScreen from '../app/moment/[id]';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockGetHistoryYears = jest.fn();
const mockGetHistoryYear = jest.fn();
const mockGetHistoryDay = jest.fn();
const mockGetMomentDetail = jest.fn();

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
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
    getMomentDetail: mockGetMomentDetail,
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
    mockBack.mockReset();
    mockGetHistoryYears.mockReset();
    mockGetHistoryYear.mockReset();
    mockGetHistoryDay.mockReset();
    mockGetMomentDetail.mockReset();
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

  it('opens the exact moment id and returns to the same day', async () => {
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
          images: [],
          audio: {
            id: 'asset_voice_lookback',
            status: 'available',
            uri: 'memory://assets/asset_voice_lookback.m4a',
            durationMs: 1800,
            durationLabel: '2秒',
            label: '一段声音',
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
    mockGetMomentDetail.mockResolvedValue({
      kind: 'ready',
      id: 'm_exact',
      note: '门口的风',
      dateLabel: '2026年1月2日 08:15',
      precision: 'exact',
      usedRecordedAtFallback: false,
      sourceLabel: '你留下的记录',
      images: [],
      audio: {
        id: 'asset_voice_lookback',
        status: 'available',
        uri: 'memory://assets/asset_voice_lookback.m4a',
        durationMs: 1800,
        durationLabel: '2秒',
        label: '一段声音',
      },
      unknownMedia: [
        {
          id: 'asset_vanished',
          status: 'unavailable',
          label: '这份内容',
          unavailableLabel: '这份内容暂时无法打开。',
        },
      ],
    });

    const day = await render(wrap(<LookbackDayScreen />));
    await waitFor(() => {
      expect(day.getByText('门口的风')).toBeTruthy();
    });
    expect(day.getByText('一段声音 · 2秒')).toBeTruthy();
    expect(day.getByText('这份内容暂时无法打开。')).toBeTruthy();
    expect(day.queryByText('这条记录现在无法找到')).toBeNull();
    fireEvent.press(day.getByTestId('lookback-moment-m_exact'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/moment/[id]', params: { id: 'm_exact' } });

    const detail = await render(wrap(<MomentDetailScreen />));
    await waitFor(() => {
      expect(detail.getByText('门口的风')).toBeTruthy();
    });
    expect(detail.getByText('一段声音 · 2秒')).toBeTruthy();
    expect(detail.getByText('这份内容暂时无法打开。')).toBeTruthy();
    fireEvent.press(detail.getByLabelText('返回原来的位置'));
    expect(mockBack).toHaveBeenCalled();
  });

});
