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
const mockGetLookbackBook = jest.fn();
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
      addListener: () => () => undefined,
    }),
  };
});

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    getLookbackBook: mockGetLookbackBook,
    getHistoryYears: mockGetHistoryYears,
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

describe('lookback origin on the root screen', () => {
  const previousUrl = process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL;
  const previousEntry = process.env.EXPO_PUBLIC_FAMILY_ENTRY_OPEN;

  beforeEach(() => {
    mockPush.mockReset();
    mockBack.mockReset();
    mockDismissTo.mockReset();
    mockGetLookbackBook.mockReset();
    mockGetHistoryYears.mockReset();
    mockGetState.mockReset();
    Object.keys(mockSearchParams).forEach((key) => {
      delete mockSearchParams[key];
    });
    resetLookbackOriginsForTests();
    delete process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL;
    delete process.env.EXPO_PUBLIC_FAMILY_ENTRY_OPEN;
    Dimensions.set({
      window: { width: 390, height: 844, scale: 2, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 2, fontScale: 1 },
    });
  });

  afterEach(() => {
    if (previousUrl === undefined) delete process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL;
    else process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL = previousUrl;
    if (previousEntry === undefined) delete process.env.EXPO_PUBLIC_FAMILY_ENTRY_OPEN;
    else process.env.EXPO_PUBLIC_FAMILY_ENTRY_OPEN = previousEntry;
  });

  it('does not treat lampy://lookback?from=recent or ?o=invalid as a Recent push', async () => {
    process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL = 'https://family.example.com';
    mockGetLookbackBook.mockResolvedValue({
      unknownCount: 0,
      isEmpty: false,
      years: [
        {
          year: 2026,
          momentCount: 2,
          title: '2026年',
          yearUnconfirmedCount: 0,
          yearUnconfirmedLabel: '这一年，月份未确认',
          months: [],
        },
      ],
    });
    mockSearchParams.from = 'recent';
    mockSearchParams.o = 'invalid';
    mockGetState.mockReturnValue({
      index: 1,
      routes: [{ name: 'index' }, { name: 'lookback/index' }],
    });
    const view = await render(wrap(<LookbackIndexScreen />));
    await waitFor(() => {
      expect(view.getByTestId('lookback-catalog-toggle')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('lookback-go-recent'));
    expect(mockDismissTo).toHaveBeenCalledWith('/');
    expect(mockBack).not.toHaveBeenCalled();
    expect(view.queryByTestId('lookback-leave')).toBeNull();
    expect(view.queryByTestId('home-family')).toBeNull();
    await view.unmount();
  });
});
