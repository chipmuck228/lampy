import type { ReactElement } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
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

function setWindow(width: number, fontScale = 1) {
  Dimensions.set({
    window: { width, height: 844, scale: 2, fontScale },
    screen: { width, height: 844, scale: 2, fontScale },
  });
}

function wrap(
  ui: ReactElement,
  width = 390,
  insets: { top: number; left: number; right: number; bottom: number } = {
    top: 47,
    left: 0,
    right: 0,
    bottom: 34,
  },
) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width, height: 844 },
        insets,
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
    setWindow(390);
  });

  it('shows only the readable list on a 320pt-wide page', async () => {
    setWindow(320);
    mockGetHistoryMonth.mockResolvedValue(september({ 24: 1 }, 1));
    const view = await render(wrap(<LookbackMonthScreen />, 320));
    await waitFor(() => {
      expect(view.getByTestId('lookback-month-entries')).toBeTruthy();
    });
    expect(view.queryByTestId('lookback-month-calendar')).toBeNull();
    expect(view.queryByTestId('lookback-day-2026-09-01')).toBeNull();
    expect(view.getByLabelText('这个月，日子未确认，有1条记录')).toBeTruthy();
    fireEvent.press(view.getByTestId('lookback-month-entry-2026-09-24'));
    expect(mockPush).toHaveBeenCalledWith('/lookback/2026/09/24');
  });

  it('shows the seven-column grid when the content width can hold 44pt cells', async () => {
    setWindow(390);
    mockGetHistoryMonth.mockResolvedValue(september({ 24: 1 }));
    const view = await render(wrap(<LookbackMonthScreen />, 390));
    await waitFor(() => {
      expect(view.getByTestId('lookback-month-calendar')).toBeTruthy();
    });
    expect(view.getByTestId('lookback-month-entries')).toBeTruthy();
    expect(view.queryByTestId('lookback-day-2026-09-01')).toBeNull();
    fireEvent.press(view.getByTestId('lookback-day-2026-09-24'));
    expect(mockPush).toHaveBeenCalledWith('/lookback/2026/09/24');
  });

  it('hides the grid when safe-area insets make 44pt cells impossible', async () => {
    setWindow(390);
    mockGetHistoryMonth.mockResolvedValue(september({ 24: 1 }));
    const view = await render(
      wrap(<LookbackMonthScreen />, 390, { top: 0, left: 40, right: 40, bottom: 21 }),
    );
    await waitFor(() => {
      expect(view.getByTestId('lookback-month-entries')).toBeTruthy();
    });
    expect(view.queryByTestId('lookback-month-calendar')).toBeNull();
  });

  it('keeps the list at large type even when the window is wide enough for a grid', async () => {
    setWindow(768, 1.3);
    mockGetHistoryMonth.mockResolvedValue(september({ 24: 1 }));
    const view = await render(wrap(<LookbackMonthScreen />, 768));
    await waitFor(() => {
      expect(view.getByTestId('lookback-month-entries')).toBeTruthy();
    });
    expect(view.queryByTestId('lookback-month-calendar')).toBeNull();
  });

  it('opens a filled day from the readable list and does not invent a day button for quiet dates', async () => {
    setWindow(390);
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
    setWindow(390);
    mockGetHistoryMonth.mockResolvedValue(september({}));
    const view = await render(wrap(<LookbackMonthScreen />));
    await waitFor(() => {
      expect(view.getByText('这个月还没有留下什么。')).toBeTruthy();
    });
    expect(view.queryByTestId('lookback-month-entries')).toBeNull();
  });

  it('keeps month-precision records off any day entry', async () => {
    setWindow(390);
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
