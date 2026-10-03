import type { ReactElement } from 'react';
import { AccessibilityInfo, AppState, type AppStateStatus } from 'react-native';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FirstRunGuide } from './first-run-guide';

function mockAppState() {
  const handlers: ((state: AppStateStatus) => void)[] = [];
  const add = jest.spyOn(AppState, 'addEventListener').mockImplementation((type, handler) => {
    if (type === 'change') handlers.push(handler);
    return { remove: jest.fn() };
  });
  return {
    async set(next: AppStateStatus) {
      await act(async () => {
        handlers.forEach((handler) => handler(next));
      });
    },
    restore() {
      add.mockRestore();
    },
  };
}

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

describe('first-run guide motion', () => {
  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
  });

  it('keeps the current scene visible after leaving mid-animation', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const app = mockAppState();
    const finished = jest.fn();
    const view = await render(wrap(<FirstRunGuide onFinished={finished} />));
    await waitFor(() => {
      expect(view.getByLabelText('Lampy 引导')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('first-run-continue'));
    await waitFor(() => {
      expect(view.getByLabelText('继续')).toBeTruthy();
    });
    await app.set('background');
    await app.set('active');
    expect(view.getByLabelText('Lampy 引导')).toBeTruthy();
    expect(view.getByLabelText('轻轻扫过，也能看见日子的样子。')).toBeTruthy();
    expect(view.getByLabelText('继续')).toBeTruthy();
    expect(finished).not.toHaveBeenCalled();
    app.restore();
  });

  it('keeps pages visible and does not shift when Reduce Motion stays on', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const app = mockAppState();
    const finished = jest.fn();
    const view = await render(wrap(<FirstRunGuide onFinished={finished} />));
    await waitFor(() => {
      expect(view.getByLabelText('日子，不必特别才值得留下。')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('first-run-continue'));
    await waitFor(() => {
      expect(view.getByLabelText('轻轻扫过，也能看见日子的样子。')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('first-run-continue'));
    await waitFor(() => {
      expect(view.getByLabelText('留下瞬间')).toBeTruthy();
    });
    expect(view.getByLabelText('从一个日子，继续读起。')).toBeTruthy();
    expect(view.getByTestId('first-run-scene-keep')).toBeTruthy();
    expect(finished).not.toHaveBeenCalled();
    app.restore();
  });

  it('cancels the previous page motion when the user pages quickly and does not finish', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const finished = jest.fn();
    const view = await render(wrap(<FirstRunGuide onFinished={finished} />));
    fireEvent.press(view.getByTestId('first-run-continue'));
    fireEvent.press(view.getByTestId('first-run-continue'));
    await waitFor(() => {
      expect(view.getByLabelText('留下瞬间')).toBeTruthy();
    });
    expect(view.getByLabelText('从一个日子，继续读起。')).toBeTruthy();
    expect(finished).not.toHaveBeenCalled();
    view.unmount();
  });
});

