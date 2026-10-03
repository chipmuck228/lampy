import type { ReactElement } from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { act, cleanup, fireEvent, render, waitFor, type RenderResult } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { resetFirstRunEnterTimeoutsForTests } from '../application/first-run';
import { resetStartupOverlayForTests } from '../application/startup-overlay';
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

function pagerOffset(view: RenderResult, y: number, height = 600, end = false) {
  const pager = view.getByTestId('first-run-pager', hidden);
  const event = {
    nativeEvent: {
      contentOffset: { y },
      layoutMeasurement: { height },
      contentSize: { height: height * 3 },
    },
  };
  pager.props.onScroll?.(event);
  if (end) pager.props.onMomentumScrollEnd?.(event);
}

async function waitFontsReady(view: RenderResult) {
  await waitFor(() => {
    expect(StyleSheet.flatten(view.getByText('日子，不必').props.style).fontFamily).toBe('LampyNotoSerifSC');
  });
}

describe('first-run guide enter eligibility', () => {
  afterEach(() => {
    cleanup();
    resetFirstRunEnterTimeoutsForTests();
    resetStartupOverlayForTests();
    jest.restoreAllMocks();
  });

  it('does not show the first screen complete and then reset while Reduce Motion is still pending', async () => {
    let finishPref: (value: boolean) => void = () => undefined;
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(
      () =>
        new Promise((resolve) => {
          finishPref = resolve;
        }),
    );
    const view = await openGuide();
    await waitFontsReady(view);
    await loadPhoto(view, 'leave');
    expect(fadeOpacity(view, 'copy-block', 'leave')).toBe(0);
    expect(fadeOpacity(view, 'photo-fade', 'leave')).toBe(0);
    await act(async () => {
      await Promise.resolve();
    });
    expect(fadeOpacity(view, 'copy-block', 'leave')).toBe(0);
    expect(fadeOpacity(view, 'photo-fade', 'leave')).toBe(0);
    await act(async () => {
      finishPref(false);
    });
    expect(fadeOpacity(view, 'copy-block', 'leave')).toBe(0);
    expect(fadeOpacity(view, 'photo-fade', 'leave')).toBe(0);
    expect(view.getByTestId('first-run-continue').props.accessibilityState?.disabled).not.toBe(true);
    view.unmount();
  });

  it('does not consume the enter fade while the target photo is loaded and the pager is still scrolling', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const view = await openGuide();
    await waitFontsReady(view);
    await loadPhoto(view, 'leave');
    await loadPhoto(view, 'lookback');
    fireEvent.press(view.getByTestId('first-run-continue'));
    await waitFor(() => {
      expect(view.getByLabelText('轻轻扫过，也能看见日子的样子。')).toBeTruthy();
    });
    expect(fadeOpacity(view, 'copy-block', 'lookback')).toBe(0);
    expect(fadeOpacity(view, 'photo-fade', 'lookback')).toBe(0);
    await act(async () => {
      pagerOffset(view, 240);
    });
    expect(fadeOpacity(view, 'copy-block', 'lookback')).toBe(0);
    expect(fadeOpacity(view, 'photo-fade', 'lookback')).toBe(0);
    await act(async () => {
      pagerOffset(view, 600, 600, true);
    });
    expect(fadeOpacity(view, 'copy-block', 'lookback')).toBe(0);
    expect(fadeOpacity(view, 'photo-fade', 'lookback')).toBe(0);
    view.unmount();
  });

  it('ignores a stale pager callback after a fast page change', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const view = await openGuide();
    await waitFontsReady(view);
    await loadPhoto(view, 'leave');
    await loadPhoto(view, 'lookback');
    await loadPhoto(view, 'keep');
    fireEvent.press(view.getByTestId('first-run-continue'));
    fireEvent.press(view.getByTestId('first-run-continue'));
    await waitFor(() => {
      expect(view.getByLabelText('留下瞬间')).toBeTruthy();
    });
    await act(async () => {
      pagerOffset(view, 600, 600, true);
    });
    expect(view.getByLabelText('留下瞬间')).toBeTruthy();
    expect(view.getByLabelText('从一个日子，继续读起。')).toBeTruthy();
    expect(view.getByLabelText('第 3 屏，共 3 屏')).toBeTruthy();
    expect(fadeOpacity(view, 'copy-block', 'keep')).toBe(0);
    view.unmount();
  });
});
