import type { ReactElement } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LookbackIndexScreen from '../app/lookback/index';
import { resetLookbackOriginsForTests } from './lookback-origin';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockDismissTo = jest.fn();
const mockGetState = jest.fn();
const mockGetHistoryYears = jest.fn();
const mockSearchParams: Record<string, string> = {};

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

describe('lookback origin on the root screen', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockBack.mockReset();
    mockDismissTo.mockReset();
    mockGetHistoryYears.mockReset();
    mockGetState.mockReset();
    Object.keys(mockSearchParams).forEach((key) => {
      delete mockSearchParams[key];
    });
    resetLookbackOriginsForTests();
    Dimensions.set({
      window: { width: 390, height: 844, scale: 2, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 2, fontScale: 1 },
    });
  });

  it('does not treat lampy://lookback?from=recent as a Recent push', async () => {
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
      unknownCount: 0,
      isEmpty: false,
    });
    mockSearchParams.from = 'recent';
    mockGetState.mockReturnValue({
      index: 1,
      routes: [{ name: 'index' }, { name: 'lookback/index' }],
    });
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByTestId('lookback-year-2026')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('lookback-go-recent'));
    expect(mockDismissTo).toHaveBeenCalledWith('/');
    expect(mockBack).not.toHaveBeenCalled();
    fireEvent.press(view.getByTestId('lookback-leave'));
    expect(mockPush).toHaveBeenCalledWith('/leave?from=lookback');
    await view.unmount();
  });
});
