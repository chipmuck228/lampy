import type { ReactElement } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LookbackMonthScreen from '../app/lookback/[year]/[month]/index';
import { lookbackMonthPage } from '../application/lookback-month';
import { resetLookbackSessionForTests } from '../application/lookback-session';
import { projectHistoryMonthFromCounts } from '../projections/history-projection';
import { LookbackMonthCalendar } from './lookback-month';

const mockPush = jest.fn();
const mockGetHistoryMonth = jest.fn();

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(effect, [effect]);
    },
    useLocalSearchParams: () => ({ year: '2026', month: '09' }),
  };
});

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    getHistoryMonth: mockGetHistoryMonth,
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

function september(filled: Record<number, number>, unconfirmed = 0) {
  const counts = Array.from({ length: 30 }, (_, index) => filled[index + 1] ?? 0);
  return projectHistoryMonthFromCounts(2026, 9, counts, unconfirmed);
}

describe('lookback month page', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockGetHistoryMonth.mockReset();
    resetLookbackSessionForTests();
  });

  it('opens a filled day from the readable list and does not invent a day button for quiet dates', async () => {
    mockGetHistoryMonth.mockResolvedValue(september({ 24: 2 }));
    const view = await render(wrap(<LookbackMonthScreen />));
    await waitFor(() => {
      expect(view.getByTestId('lookback-month-entries')).toBeTruthy();
    });
    expect(view.getByText('9月24日 · 有2条记录')).toBeTruthy();
    expect(view.queryByTestId('lookback-day-2026-09-01')).toBeNull();
    fireEvent.press(view.getByTestId('lookback-month-entry-2026-09-24'));
    expect(mockPush).toHaveBeenCalledWith('/lookback/2026/09/24');
    expect(view.getByTestId('lookback-scroll')).toBeTruthy();
  });

  it('shows an empty month without a filled-day list', async () => {
    mockGetHistoryMonth.mockResolvedValue(september({}));
    const view = await render(wrap(<LookbackMonthScreen />));
    await waitFor(() => {
      expect(view.getByText('这个月还没有留下什么。')).toBeTruthy();
    });
    expect(view.queryByTestId('lookback-month-entries')).toBeNull();
  });

  it('keeps month-precision records off any day entry', async () => {
    mockGetHistoryMonth.mockResolvedValue(september({ 3: 1 }, 2));
    const view = await render(wrap(<LookbackMonthScreen />));
    await waitFor(() => {
      expect(view.getByLabelText('这个月，日子未确认，有2条记录')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('lookback-month-unconfirmed-2026-09'));
    expect(mockPush).toHaveBeenCalledWith('/lookback/2026/09/unconfirmed');
    expect(view.getByTestId('lookback-month-entry-2026-09-03')).toBeTruthy();
    expect(view.queryByTestId('lookback-month-entry-2026-09-04')).toBeNull();
  });
});

describe('lookback month calendar cells', () => {
  it('keeps quiet days as text and filled days as the original day route', async () => {
    const onOpenDay = jest.fn();
    const page = lookbackMonthPage(september({ 24: 2 }));
    const view = await render(
      <LookbackMonthCalendar page={page} year={2026} month={9} onOpenDay={onOpenDay} />,
    );
    expect(view.getByTestId('lookback-month-calendar')).toBeTruthy();
    expect(view.getByLabelText('2026年9月1日，安静')).toBeTruthy();
    expect(view.queryByTestId('lookback-day-2026-09-01')).toBeNull();
    fireEvent.press(view.getByTestId('lookback-day-2026-09-24'));
    expect(onOpenDay).toHaveBeenCalledWith(24);
  });
});
