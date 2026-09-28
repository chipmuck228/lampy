import type { ReactElement } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LookbackMonthScreen from '../app/lookback/[year]/[month]/index';
import { lookbackMonthPage } from '../application/lookback-month';
import { readLookbackExpandedMonth, resetLookbackSessionForTests } from '../application/lookback-session';
import { projectHistoryMonthFromCounts } from '../projections/history-projection';
import { LookbackMonthCalendar } from './lookback-month';

const mockReplace = jest.fn();

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    useRouter: () => ({
      push: jest.fn(),
      back: jest.fn(),
      replace: mockReplace,
      dismissTo: jest.fn(),
    }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(effect, [effect]);
    },
    useLocalSearchParams: () => ({ year: '2026', month: '09' }),
  };
});

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

describe('lookback month deep link', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    resetLookbackSessionForTests();
  });

  it('replaces onto the year page and leaves that month expanded', async () => {
    const view = await render(wrap(<LookbackMonthScreen />));
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/lookback/2026');
    });
    expect(readLookbackExpandedMonth(2026)).toBe(9);
    expect(view.queryByTestId('lookback-month-calendar')).toBeNull();
    expect(view.queryByTestId('lookback-month-entries')).toBeNull();
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
