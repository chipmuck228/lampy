import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';

import { DEVICE_LOCK_SECURE_KEY } from '../infrastructure/device-lock-store';
import { DeviceLockProvider, DeviceLockSettings, useDeviceLock } from './device-lock-context';

function Toggle() {
  const lock = useDeviceLock();
  if (!lock) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="toggle-lock" onPress={() => void lock.toggle()}>
      <Text>toggle</Text>
    </Pressable>
  );
}

function wrap(
  store: { isEnabled: () => Promise<boolean>; setEnabled: (enabled: boolean) => Promise<void> },
  authenticator: {
    authenticate: () => Promise<{ ok: true } | { ok: false; reason: 'cancel' | 'fail' | 'unavailable' | 'no-passcode' }>;
  },
) {
  return (
    <DeviceLockProvider store={store} authenticator={authenticator}>
      <Text>private</Text>
      <Toggle />
      <DeviceLockSettings />
    </DeviceLockProvider>
  );
}

describe('device lock cover', () => {
  beforeEach(async () => {
    await SecureStore.deleteItemAsync(DEVICE_LOCK_SECURE_KEY);
  });

  it('does not cover content or prompt when protection is off', async () => {
    const authenticate = jest.fn(async () => ({ ok: true as const }));
    const view = await render(
      wrap({ isEnabled: async () => false, setEnabled: async () => undefined }, { authenticate }),
    );
    await waitFor(() => {
      expect(view.queryByTestId('device-lock-cover')).toBeNull();
    });
    expect(view.getByText('private')).toBeTruthy();
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('covers content until unlock succeeds and ignores a cancelled challenge', async () => {
    let result: { ok: true } | { ok: false; reason: 'cancel' } = { ok: false, reason: 'cancel' };
    const view = await render(
      wrap(
        { isEnabled: async () => true, setEnabled: async () => undefined },
        { authenticate: async () => result },
      ),
    );
    await waitFor(() => {
      expect(view.getByTestId('device-lock-cover')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText('再试一次'));
    });
    expect(view.getByTestId('device-lock-cover')).toBeTruthy();
    result = { ok: true };
    await act(async () => {
      fireEvent.press(view.getByLabelText('再试一次'));
    });
    await waitFor(() => {
      expect(view.queryByTestId('device-lock-cover')).toBeNull();
    });
  });

  it('does not persist enable when the challenge is cancelled', async () => {
    const setEnabled = jest.fn(async () => undefined);
    const view = await render(
      wrap(
        { isEnabled: async () => false, setEnabled },
        { authenticate: async () => ({ ok: false, reason: 'cancel' }) },
      ),
    );
    await waitFor(() => {
      expect(view.getByText('private')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText('toggle-lock'));
    });
    expect(setEnabled).not.toHaveBeenCalled();
    expect(view.queryByTestId('device-lock-cover')).toBeNull();
  });

  it('persists enable and disable only after a successful challenge', async () => {
    const setEnabled = jest.fn(async () => undefined);
    const authenticate = jest.fn(async () => ({ ok: true as const }));
    const view = await render(wrap({ isEnabled: async () => false, setEnabled }, { authenticate }));
    await waitFor(() => {
      expect(view.getByText('private')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText('toggle-lock'));
    });
    expect(setEnabled).toHaveBeenCalledWith(true);
    await act(async () => {
      fireEvent.press(view.getByLabelText('toggle-lock'));
    });
    expect(setEnabled).toHaveBeenCalledWith(false);
  });

  it('keeps the route tree mounted under the cover so deep links share the same lock', async () => {
    const view = await render(
      wrap(
        { isEnabled: async () => true, setEnabled: async () => undefined },
        { authenticate: async () => ({ ok: false, reason: 'cancel' }) },
      ),
    );
    await waitFor(() => {
      expect(view.getByTestId('device-lock-cover')).toBeTruthy();
    });
    expect(view.getByText('private', { includeHiddenElements: true })).toBeTruthy();
  });

  it('keeps an unlocked session when the default store is used across rerenders', async () => {
    await SecureStore.setItemAsync(DEVICE_LOCK_SECURE_KEY, '1');
    const authenticate = jest.fn(async () => ({ ok: true as const }));
    function Harness() {
      const [, bump] = useState(0);
      return (
        <DeviceLockProvider authenticator={{ authenticate }}>
          <Text>private</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="rerender" onPress={() => bump((n) => n + 1)}>
            <Text>rerender</Text>
          </Pressable>
        </DeviceLockProvider>
      );
    }
    const view = await render(<Harness />);
    await waitFor(() => {
      expect(view.queryByTestId('device-lock-cover')).toBeNull();
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText('rerender'));
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText('rerender'));
    });
    expect(view.queryByTestId('device-lock-cover')).toBeNull();
    expect(view.getByText('private')).toBeTruthy();
  });

  it('rolls back enable and stays retryable when the setting cannot be written', async () => {
    const setEnabled = jest.fn(async () => {
      throw new Error('keychain');
    });
    const view = await render(
      wrap({ isEnabled: async () => false, setEnabled }, { authenticate: async () => ({ ok: true }) }),
    );
    await waitFor(() => {
      expect(view.getByText('private')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText('toggle-lock'));
    });
    expect(setEnabled).toHaveBeenCalledWith(true);
    expect(view.getByText('这次没有保存本机保护设置。记录还在，可以再试一次。')).toBeTruthy();
    expect(view.queryByTestId('device-lock-cover')).toBeNull();
    await act(async () => {
      fireEvent.press(view.getByLabelText('toggle-lock'));
    });
    expect(setEnabled).toHaveBeenCalledTimes(2);
  });

  it('rolls back disable and stays retryable when the setting cannot be written', async () => {
    const setEnabled = jest.fn(async () => {
      throw new Error('keychain');
    });
    const view = await render(
      wrap({ isEnabled: async () => true, setEnabled }, { authenticate: async () => ({ ok: true }) }),
    );
    await waitFor(() => {
      expect(view.queryByTestId('device-lock-cover')).toBeNull();
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText('toggle-lock'));
    });
    expect(setEnabled).toHaveBeenCalledWith(false);
    expect(view.getByText('这次没有保存本机保护设置。记录还在，可以再试一次。')).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByLabelText('toggle-lock'));
    });
    expect(setEnabled).toHaveBeenCalledTimes(2);
  });
});
