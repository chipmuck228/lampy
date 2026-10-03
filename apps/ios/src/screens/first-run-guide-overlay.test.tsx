import type { ReactElement } from 'react';
import { AccessibilityInfo, AppState, StyleSheet, type AppStateStatus } from 'react-native';
import { act, cleanup, render, waitFor, type RenderResult } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { resetFirstRunEnterTimeoutsForTests } from '../application/first-run';
import {
  resetStartupOverlayForTests,
  setStartupOverlayHideForTests,
  setStartupOverlayPaintForTests,
  startupOverlayState,
} from '../application/startup-overlay';
import { FirstRunGuide } from './first-run-guide';

const hidden = { includeHiddenElements: true } as const;

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

function numericOpacity(style: unknown) {
  const flat = StyleSheet.flatten(style) as { opacity?: number | { _value?: number } };
  const value = flat?.opacity;
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && typeof value._value === 'number') return value._value;
  return undefined;
}

function fadeOpacity(view: RenderResult, kind: 'copy-block' | 'photo-fade', id: string) {
  return numericOpacity(view.getByTestId(`first-run-${kind}-${id}`, hidden).props.style);
}

function setAppState(state: AppStateStatus) {
  Object.defineProperty(AppState, 'currentState', {
    configurable: true,
    get: () => state,
  });
}

async function openGuide() {
  const view = await render(wrap(<FirstRunGuide onFinished={jest.fn()} />));
  await waitFor(() => {
    expect(view.getByLabelText('Lampy 引导')).toBeTruthy();
  });
  const pager = view.getByTestId('first-run-pager', hidden);
  await act(async () => {
    pager.props.onLayout?.({
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 600 } },
    });
  });
  return view;
}

async function loadPhoto(view: RenderResult, id: string) {
  await act(async () => {
    view.getByTestId(`first-run-photo-${id}`, hidden).props.onLoad?.();
  });
}

async function waitFontsReady(view: RenderResult) {
  await waitFor(() => {
    expect(StyleSheet.flatten(view.getByText('日子，不必').props.style).fontFamily).toBe('LampyNotoSerifSC');
  });
}

describe('first-run guide startup overlay handoff', () => {
  beforeEach(() => {
    setAppState('active');
  });

  afterEach(() => {
    cleanup();
    resetFirstRunEnterTimeoutsForTests();
    resetStartupOverlayForTests();
    jest.restoreAllMocks();
    setAppState('active');
  });

  it('does not start the first-screen fade while the startup overlay still covers, and ignores a late exit after unmount', async () => {
    let finishHide: () => void = () => undefined;
    setStartupOverlayHideForTests(
      () =>
        new Promise((resolve) => {
          finishHide = resolve;
        }),
    );
    setStartupOverlayPaintForTests((cb) => cb());
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const view = await openGuide();
    await waitFontsReady(view);
    await loadPhoto(view, 'leave');
    await waitFor(() => {
      expect(startupOverlayState()).toBe('exiting');
    });
    expect(fadeOpacity(view, 'copy-block', 'leave')).toBe(0);
    expect(fadeOpacity(view, 'photo-fade', 'leave')).toBe(0);
    view.unmount();
    await act(async () => {
      finishHide();
      await Promise.resolve();
      await Promise.resolve();
    });
  });
});
