import type { ReactElement } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
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
  it('does not finish until the last screen action', async () => {
    const finished = jest.fn();
    const view = await render(wrap(<FirstRunGuide onFinished={finished} />));
    expect(view.getByText('这里，留下自己的生活。')).toBeTruthy();
    fireEvent.press(view.getByTestId('first-run-continue'));
    expect(finished).not.toHaveBeenCalled();
    fireEvent.press(view.getByTestId('first-run-continue'));
    expect(finished).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(view.getByLabelText('留下瞬间')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('first-run-continue'));
    expect(finished).toHaveBeenCalledTimes(1);
  });
});
