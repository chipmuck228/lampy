import { Pressable, Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { DeviceLockProvider, useDeviceLock } from './device-lock-context';

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
    </DeviceLockProvider>
  );
}

describe('device lock cover', () => {
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
});
