import type { ReactElement } from 'react';
import { act, cleanup, fireEvent, render, waitFor, type RenderResult } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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

async function measureFrame(view: RenderResult, width: number, height: number) {
  const pager = view.getByTestId('first-run-pager', hidden);
  await act(async () => {
    fireEvent(pager, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width, height } },
    });
  });
}

async function measureCopy(view: RenderResult, id: string, viewH: number, contentH: number) {
  const copy = view.getByTestId(`first-run-copy-${id}`, hidden);
  await act(async () => {
    fireEvent(copy, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 342, height: viewH } },
    });
    copy.props.onContentSizeChange?.(342, contentH);
  });
}

function swipeCopy(view: RenderResult, id: string, offsetY: number, viewH: number, contentH: number) {
  fireEvent(view.getByTestId(`first-run-copy-${id}`, hidden), 'scrollEndDrag', {
    nativeEvent: {
      contentOffset: { y: offsetY },
      layoutMeasurement: { height: viewH },
      contentSize: { height: contentH },
      velocity: { y: 0.8 },
    },
  });
}

function progressLabel(view: RenderResult) {
  return String(view.getByTestId('first-run-progress').props.accessibilityLabel ?? '');
}

describe('first-run guide scroll measure', () => {
  afterEach(() => {
    cleanup();
  });

  it('keeps the first screen scrollable after a round trip without a new measure event', async () => {
    const finished = jest.fn();
    const view = await render(wrap(<FirstRunGuide onFinished={finished} />));
    await measureFrame(view, 390, 320);
    await measureCopy(view, 'leave', 200, 480);
    await measureCopy(view, 'lookback', 200, 360);
    expect(view.getByTestId('first-run-copy-leave', hidden).props.scrollEnabled).toBe(true);
    expect(view.getByTestId('first-run-pager', hidden).props.scrollEnabled).toBe(false);

    fireEvent.press(view.getByTestId('first-run-continue'));
    await waitFor(() => {
      expect(view.getByLabelText('轻轻扫过，也能看见日子的样子。')).toBeTruthy();
    });
    expect(view.getByTestId('first-run-copy-lookback', hidden).props.scrollEnabled).toBe(true);
    swipeCopy(view, 'lookback', 20, 200, 360);
    expect(view.getByLabelText('轻轻扫过，也能看见日子的样子。')).toBeTruthy();
    expect(progressLabel(view)).toBe('第 2 屏，共 3 屏');

    fireEvent.press(view.getByTestId('first-run-back'));
    await waitFor(() => {
      expect(view.getByLabelText('日子，不必特别才值得留下。')).toBeTruthy();
    });
    expect(view.getByTestId('first-run-copy-leave', hidden).props.scrollEnabled).toBe(true);
    expect(view.getByTestId('first-run-pager', hidden).props.scrollEnabled).toBe(false);
    swipeCopy(view, 'leave', 40, 200, 480);
    expect(view.getByLabelText('日子，不必特别才值得留下。')).toBeTruthy();
    expect(progressLabel(view)).toBe('第 1 屏，共 3 屏');

    swipeCopy(view, 'leave', 280, 200, 480);
    await waitFor(() => {
      expect(view.getByLabelText('轻轻扫过，也能看见日子的样子。')).toBeTruthy();
    });
    expect(view.getByTestId('first-run-copy-lookback', hidden).props.scrollEnabled).toBe(true);
    swipeCopy(view, 'lookback', 20, 200, 360);
    expect(progressLabel(view)).toBe('第 2 屏，共 3 屏');
    expect(finished).not.toHaveBeenCalled();
  });
});
