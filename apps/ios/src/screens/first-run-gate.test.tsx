import type { ReactElement } from 'react';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';

import { FIRST_RUN_SECURE_KEY } from '../infrastructure/first-run-store';

import { FIRST_RUN_FINISH_ERROR, FirstRunGate, finishFirstRunGuide } from './first-run-gate';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

function wrap(ui: ReactElement) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      {ui}
    </SafeAreaProvider>
  );
}

describe('first-run gate errors', () => {
  beforeEach(async () => {
    mockPush.mockReset();
    await SecureStore.deleteItemAsync(FIRST_RUN_SECURE_KEY);
  });

  afterEach(() => {
    cleanup();
  });

  it('skips the blank pending page when the store or library cannot be read', async () => {
    const view = await render(
      wrap(
        <FirstRunGate
          store={{
            isCompleted: async () => {
              throw new Error('keychain');
            },
            markCompleted: async () => undefined,
          }}
          readLibrary={async () => {
            throw new Error('disk');
          }}
        >
          <Text>app</Text>
        </FirstRunGate>,
      ),
    );
    await waitFor(() => {
      expect(view.getByTestId('first-run-ready')).toBeTruthy();
    });
    expect(view.getByText('app')).toBeTruthy();
    expect(view.queryByTestId('first-run-pending')).toBeNull();
  });

  it('does not mark the guide complete when the store cannot write', async () => {
    const markCompleted = jest.fn(async () => {
      throw new Error('keychain');
    });
    await expect(finishFirstRunGuide({ isCompleted: async () => false, markCompleted })).resolves.toEqual({
      ok: false,
      message: FIRST_RUN_FINISH_ERROR,
    });
    expect(markCompleted).toHaveBeenCalled();
  });

  it('keeps the default store across rerenders and still leaves the pending cover', async () => {
    function Harness() {
      const [, bump] = useState(0);
      return (
        <FirstRunGate readLibrary={async () => ({ hasPersonalRecords: true, recordsUnknown: false })}>
          <Text>app</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="rerender" onPress={() => bump((n) => n + 1)}>
            <Text>rerender</Text>
          </Pressable>
        </FirstRunGate>
      );
    }
    const view = await render(wrap(<Harness />));
    await waitFor(() => {
      expect(view.getByTestId('first-run-ready')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText('rerender'));
    });
    expect(view.getByText('app')).toBeTruthy();
    expect(view.queryByTestId('first-run-pending')).toBeNull();
  });

  it('does not mark the guide complete before the last screen', async () => {
    const markCompleted = jest.fn(async () => undefined);
    const view = await render(
      wrap(
        <FirstRunGate
          store={{ isCompleted: async () => false, markCompleted }}
          readLibrary={async () => ({ hasPersonalRecords: false, recordsUnknown: false })}
        >
          <Text>app</Text>
        </FirstRunGate>,
      ),
    );
    await waitFor(() => {
      expect(view.getByTestId('first-run-continue')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('first-run-continue'));
    expect(markCompleted).not.toHaveBeenCalled();
    fireEvent.press(view.getByTestId('first-run-continue'));
    await waitFor(() => {
      expect(view.getByLabelText('留下瞬间')).toBeTruthy();
    });
    expect(markCompleted).not.toHaveBeenCalled();
    expect(view.queryByText('app')).toBeNull();
  });
});
