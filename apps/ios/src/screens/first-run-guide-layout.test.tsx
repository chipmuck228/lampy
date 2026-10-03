import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, cleanup, fireEvent, render, waitFor, type RenderResult } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { firstRunCopyColumnWidth } from '../application/first-run';
import { FirstRunGuide } from './first-run-guide';
import { firstRunPhotoBox } from './first-run-scene';
import { pageGutter } from './life-page';

function wrap(
  ui: ReactElement,
  metrics: {
    frame: { x: number; y: number; width: number; height: number };
    insets: { top: number; left: number; right: number; bottom: number };
  },
) {
  return <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;
}

async function measureFrame(view: RenderResult, width: number, height: number) {
  await act(async () => {
    fireEvent(view.getByTestId('first-run-pager', { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width, height } },
    });
  });
}

function progressLabel(view: RenderResult) {
  return String(view.getByTestId('first-run-progress').props.accessibilityLabel ?? '');
}

const portrait = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const landscape = {
  frame: { x: 0, y: 0, width: 852, height: 390 },
  insets: { top: 0, left: 47, right: 47, bottom: 21 },
};

describe('first-run guide layout', () => {
  afterEach(() => {
    cleanup();
  });

  it('pages from the measured safe-area frame when left and right insets are not zero', async () => {
    const view = await render(wrap(<FirstRunGuide onFinished={jest.fn()} />, landscape));
    await measureFrame(view, 758, 280);
    const page = StyleSheet.flatten(view.getByTestId('first-run-leave').props.style);
    expect(page.width).toBe(758);
    expect(page.width).toBeLessThan(landscape.frame.width);
    expect(page.height).toBe(280);
    const photo = StyleSheet.flatten(view.getByTestId('first-run-scene-leave').props.style);
    const expected = firstRunPhotoBox(758, 280);
    expect(photo.width).toBe(expected.width);
    expect(expected.width).toBeLessThanOrEqual(758 - pageGutter(758, 280) * 2);
    const copy = StyleSheet.flatten(view.getByTestId('first-run-copy-block-leave').props.style);
    expect(copy.width).toBe(firstRunCopyColumnWidth(expected.width, 758, 280));
    expect(copy.width).toBeLessThan(expected.width);
  });

  it('keeps a short landscape page inside the measured frame', async () => {
    const view = await render(wrap(<FirstRunGuide onFinished={jest.fn()} />, landscape));
    await measureFrame(view, 758, 220);
    const page = StyleSheet.flatten(view.getByTestId('first-run-leave').props.style);
    expect(page.width).toBe(758);
    expect(page.height).toBe(220);
    expect(firstRunPhotoBox(758, 220).height).toBeLessThan(firstRunPhotoBox(390, 844).height);
  });

  it('stays on the second page and realigns after a rotation', async () => {
    const view = await render(wrap(<FirstRunGuide onFinished={jest.fn()} />, portrait));
    await measureFrame(view, 390, 600);
    fireEvent.press(view.getByTestId('first-run-continue'));
    await waitFor(() => {
      expect(view.getByLabelText('轻轻扫过，也能看见日子的样子。')).toBeTruthy();
    });
    expect(progressLabel(view)).toBe('第 2 屏，共 3 屏');
    await measureFrame(view, 758, 280);
    expect(view.getByLabelText('轻轻扫过，也能看见日子的样子。')).toBeTruthy();
    expect(progressLabel(view)).toBe('第 2 屏，共 3 屏');
    expect(StyleSheet.flatten(view.getByTestId('first-run-lookback').props.style)).toMatchObject({
      width: 758,
      height: 280,
    });
    expect(view.queryByLabelText('留下瞬间')).toBeNull();
  });
});
