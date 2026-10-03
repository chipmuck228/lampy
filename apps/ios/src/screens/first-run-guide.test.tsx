import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FirstRunGuide } from './first-run-guide';

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

describe('first-run guide', () => {
  afterEach(() => {
    cleanup();
  });

  it('does not finish until the last screen action and can return to the previous screen', async () => {
    const finished = jest.fn();
    const view = await render(wrap(<FirstRunGuide onFinished={finished} />));
    expect(view.getByLabelText('日子，不必特别才值得留下。')).toBeTruthy();
    expect(view.getByTestId('first-run-scene-leave')).toBeTruthy();
    expect(view.getByTestId('first-run-mark-row')).toBeTruthy();
    expect(view.getByText('一杯咖啡，一段午后。')).toBeTruthy();
    expect(view.queryByText('一段咖啡，一段午后。')).toBeNull();
    expect(view.queryByText('1 / 3')).toBeNull();
    expect(view.getByLabelText('第 1 屏，共 3 屏')).toBeTruthy();
    expect(view.queryByTestId('first-run-back')).toBeNull();
    expect(view.queryByText('示意，不是你的记录')).toBeNull();
    expect(view.queryByText('不必翻找')).toBeNull();
    expect(view.queryByText('进入 Lampy')).toBeNull();
    expect(StyleSheet.flatten(view.getByTestId('first-run-continue').props.style).minHeight).toBe(48);
    fireEvent.press(view.getByTestId('first-run-continue'));
    expect(finished).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(view.getByLabelText('轻轻扫过，也能看见日子的样子。')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('first-run-back'));
    await waitFor(() => {
      expect(view.getByLabelText('日子，不必特别才值得留下。')).toBeTruthy();
    });
    expect(finished).not.toHaveBeenCalled();
    fireEvent.press(view.getByTestId('first-run-continue'));
    fireEvent.press(view.getByTestId('first-run-continue'));
    expect(finished).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(view.getByLabelText('留下瞬间')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('first-run-continue'));
    expect(finished).toHaveBeenCalledTimes(1);
  });
});
