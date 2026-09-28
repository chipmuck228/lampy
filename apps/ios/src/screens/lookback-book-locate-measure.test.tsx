import { useState, type ReactElement } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions, ScrollView, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { rememberLookbackScroll, resetLookbackSessionForTests } from '../application/lookback-session';
import { LookbackLocateAnchor, LookbackScaffold } from './lookback-chrome';

const mockScrollTo = jest.fn();
const pendingMeasures: Array<() => void> = [];

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

function Probe() {
  const [locateKey, setLocateKey] = useState<string | null>('day-2026-09-28');
  return (
    <LookbackScaffold title="回看" path="/lookback" locateKey={locateKey} onLocated={() => setLocateKey(null)}>
      <View>
        <View>
          <LookbackLocateAnchor id="day-2026-09-28" />
        </View>
      </View>
    </LookbackScaffold>
  );
}

function flushMeasures() {
  let guard = 0;
  while (pendingMeasures.length > 0 && guard < 16) {
    const batch = pendingMeasures.splice(0, pendingMeasures.length);
    batch.forEach((run) => run());
    guard += 1;
  }
}

describe('lookback book locate measure', () => {
  beforeEach(() => {
    cleanup();
    mockScrollTo.mockReset();
    pendingMeasures.length = 0;
    jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(mockScrollTo);
    jest.spyOn(View.prototype, 'measureInWindow').mockImplementation(function (this: object, callback) {
      const isScroll = this instanceof ScrollView;
      pendingMeasures.push(() => {
        if (isScroll) callback(0, 120, 390, 844);
        else callback(0, 1960, 390, 48);
      });
    });
    resetLookbackSessionForTests();
    rememberLookbackScroll('/lookback', 40);
    Dimensions.set({
      window: { width: 390, height: 844, scale: 2, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 2, fontScale: 1 },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('scrolls once to the late window measure, not the nested onLayout y', async () => {
    const view = await render(wrap(<Probe />));
    await waitFor(() => {
      expect(view.getByTestId('lookback-book-locating')).toBeTruthy();
    });
    await act(async () => {
      fireEvent(view.getByTestId('lookback-book-locate-day-2026-09-28'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 12, width: 390, height: 8 } },
      });
    });
    expect(mockScrollTo).not.toHaveBeenCalled();
    expect(view.getByTestId('lookback-book-locating')).toBeTruthy();
    await act(async () => {
      flushMeasures();
    });
    await waitFor(() => {
      expect(view.queryByTestId('lookback-book-locating')).toBeNull();
    });
    expect(mockScrollTo).toHaveBeenCalledTimes(1);
    expect(mockScrollTo).toHaveBeenCalledWith({ y: 1880, animated: false });
    expect(mockScrollTo).not.toHaveBeenCalledWith({ y: 12, animated: false });
    fireEvent(view.getByTestId('lookback-book-locate-day-2026-09-28'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 12, width: 390, height: 8 } },
    });
    flushMeasures();
    expect(mockScrollTo).toHaveBeenCalledTimes(1);
  });
});
