import type { ReactElement } from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApplicationError } from '../application/errors';
import AccountScreen from './account-screen';
import { familyAuthServiceReady } from '../application/account-status';

const mockFamily = {
  getMembership: jest.fn(),
  signInWithApple: jest.fn(),
  signOut: jest.fn(),
  hasUnconfirmedSessionRevoke: jest.fn(async () => false),
};

const mockSession = {
  getSessionToken: jest.fn(async () => null as string | null),
  getPendingRevoke: jest.fn(async () => null),
};

const mockApple = {
  isAvailable: jest.fn(async () => true),
  requestIdentityToken: jest.fn(async () => 'identity-token'),
};

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(effect, [effect]);
    },
  };
});

jest.mock('../application/container', () => ({
  getFamilyUseCases: async () => mockFamily,
}));

jest.mock('../infrastructure/secure-family-session', () => ({
  createSecureFamilySessionStore: () => mockSession,
}));

jest.mock('../infrastructure/expo-apple-auth', () => ({
  createExpoAppleIdentityTokenSource: () => mockApple,
}));

jest.mock('../application/account-status', () => {
  const actual = jest.requireActual('../application/account-status') as typeof import('../application/account-status');
  return actual;
});

jest.mock('expo-apple-authentication', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, Text } = require('react-native');
  return {
    AppleAuthenticationButtonType: { SIGN_IN: 'SIGN_IN' },
    AppleAuthenticationButtonStyle: { BLACK: 'BLACK' },
    AppleAuthenticationButton: ({ onPress }: { onPress: () => void }) => (
      <Pressable accessibilityRole="button" accessibilityLabel="通过 Apple 登录" onPress={onPress}>
        <Text>通过 Apple 登录</Text>
      </Pressable>
    ),
  };
});

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

describe('account screen', () => {
  const previous = process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL;

  afterEach(() => {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL;
    else process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL = previous;
  });

  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL;
    mockFamily.getMembership.mockReset();
    mockFamily.signInWithApple.mockReset();
    mockFamily.signOut.mockReset();
    mockFamily.hasUnconfirmedSessionRevoke.mockReset().mockResolvedValue(false);
    mockSession.getSessionToken.mockReset().mockResolvedValue(null);
    mockSession.getPendingRevoke.mockReset().mockResolvedValue(null);
    mockApple.isAvailable.mockReset().mockResolvedValue(true);
    mockApple.requestIdentityToken.mockReset().mockResolvedValue('identity-token');
  });

  it('does not pretend family login works when no auth service is configured', async () => {
    expect(familyAuthServiceReady()).toBe(false);
    const view = await render(wrap(<AccountScreen />));
    await waitFor(() => {
      expect(view.getByTestId('account-kind-service-unavailable')).toBeTruthy();
    });
    expect(view.getByTestId('account-personal')).toBeTruthy();
    expect(view.getByText(/没有跨设备同步或云备份/)).toBeTruthy();
    expect(view.queryByLabelText('通过 Apple 登录')).toBeNull();
    expect(view.queryByText(/家庭成员|头像|邮箱/)).toBeNull();
    expect(mockFamily.getMembership).not.toHaveBeenCalled();
  });

  it('shows the system Apple control when the auth service is ready and the user is unsigned', async () => {
    process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL = 'https://family.example.com';
    mockFamily.getMembership.mockResolvedValue({ kind: 'unauthenticated' });
    const view = await render(wrap(<AccountScreen />));
    await waitFor(() => {
      expect(view.getByTestId('account-kind-unsigned')).toBeTruthy();
    });
    expect(view.getByLabelText('通过 Apple 登录')).toBeTruthy();
  });

  it('keeps cancelled Apple authorization as unsigned and retryable', async () => {
    process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL = 'https://family.example.com';
    mockFamily.getMembership.mockResolvedValue({ kind: 'unauthenticated' });
    mockApple.requestIdentityToken.mockRejectedValue(
      new ApplicationError('APPLE_SIGN_IN_CANCELLED', 'Sign in with Apple was cancelled.'),
    );
    const view = await render(wrap(<AccountScreen />));
    await waitFor(() => {
      expect(view.getByLabelText('通过 Apple 登录')).toBeTruthy();
    });
    fireEvent.press(view.getByLabelText('通过 Apple 登录'));
    await waitFor(() => {
      expect(view.getByText('这次没有登录。')).toBeTruthy();
    });
    expect(mockFamily.signInWithApple).not.toHaveBeenCalled();
    expect(view.getByLabelText('通过 Apple 登录')).toBeTruthy();
  });

  it('asks for a new Apple sign-in after a 401 session', async () => {
    process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL = 'https://family.example.com';
    mockFamily.getMembership.mockResolvedValue({ kind: 'unconfirmed', reason: 'unauthenticated' });
    const view = await render(wrap(<AccountScreen />));
    await waitFor(() => {
      expect(view.getByTestId('account-kind-needs-reauth')).toBeTruthy();
    });
    expect(view.getByLabelText('通过 Apple 登录')).toBeTruthy();
  });

  it('keeps a network login failure retryable and does not treat it as signed in', async () => {
    process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL = 'https://family.example.com';
    mockFamily.getMembership.mockResolvedValue({ kind: 'unauthenticated' });
    mockFamily.signInWithApple.mockRejectedValue(
      new ApplicationError('SERVER_UNREACHABLE', 'Family server is unreachable.'),
    );
    const view = await render(wrap(<AccountScreen />));
    await waitFor(() => {
      expect(view.getByLabelText('通过 Apple 登录')).toBeTruthy();
    });
    fireEvent.press(view.getByLabelText('通过 Apple 登录'));
    await waitFor(() => {
      expect(view.getByText(/连不上授权服务/)).toBeTruthy();
    });
    expect(view.getByTestId('account-kind-unsigned')).toBeTruthy();
    expect(view.getByLabelText('通过 Apple 登录')).toBeTruthy();
  });

  it('shows local-out pending revoke without inventing a family', async () => {
    process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL = 'https://family.example.com';
    mockFamily.getMembership.mockResolvedValue({ kind: 'unauthenticated' });
    mockFamily.hasUnconfirmedSessionRevoke.mockResolvedValue(true);
    mockSession.getSessionToken.mockResolvedValue(null);
    const view = await render(wrap(<AccountScreen />));
    await waitFor(() => {
      expect(view.getByTestId('account-kind-local-out-revoke-pending')).toBeTruthy();
    });
    expect(view.queryByText(/家里现在有/)).toBeNull();
  });

  it('does not claim local sign-out when pending revoke cannot be saved', async () => {
    process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL = 'https://family.example.com';
    mockFamily.getMembership.mockResolvedValue({ kind: 'none' });
    mockSession.getSessionToken.mockResolvedValue('ses_1');
    mockFamily.signOut.mockResolvedValue({ local: 'still-signed-in', server: 'unconfirmed' });
    const view = await render(wrap(<AccountScreen />));
    await waitFor(() => {
      expect(view.getByTestId('account-sign-out')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('account-sign-out'));
    await waitFor(() => {
      expect(view.getByText(/还没有退出/)).toBeTruthy();
    });
  });

  it('keeps a committed sign-in when the following membership refresh fails', async () => {
    process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL = 'https://family.example.com';
    mockFamily.getMembership
      .mockResolvedValueOnce({ kind: 'unauthenticated' })
      .mockRejectedValueOnce(new ApplicationError('SERVER_UNREACHABLE', 'Family server is unreachable.'));
    mockFamily.signInWithApple.mockResolvedValue({ sessionToken: 'ses_1' });
    const view = await render(wrap(<AccountScreen />));
    await waitFor(() => {
      expect(view.getByLabelText('通过 Apple 登录')).toBeTruthy();
    });
    fireEvent.press(view.getByLabelText('通过 Apple 登录'));
    await waitFor(() => {
      expect(view.getByTestId('account-kind-signed-in')).toBeTruthy();
      expect(view.getByText('已登录。现在读不到最新账户状态，可以再试。')).toBeTruthy();
    });
    expect(view.queryByLabelText('通过 Apple 登录')).toBeNull();
    expect(view.getByLabelText('退出登录')).toBeTruthy();
  });

  it('keeps a committed local sign-out when the following refresh fails', async () => {
    process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL = 'https://family.example.com';
    mockFamily.getMembership
      .mockResolvedValueOnce({ kind: 'none' })
      .mockRejectedValueOnce(new ApplicationError('SERVER_UNREACHABLE', 'Family server is unreachable.'));
    mockSession.getSessionToken.mockResolvedValue('ses_1');
    mockFamily.signOut.mockResolvedValue({ local: 'signed-out', server: 'revoked' });
    const view = await render(wrap(<AccountScreen />));
    await waitFor(() => {
      expect(view.getByTestId('account-sign-out')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('account-sign-out'));
    await waitFor(() => {
      expect(view.getByTestId('account-kind-unsigned')).toBeTruthy();
      expect(view.getByText('这台设备已经退出。现在读不到最新账户状态，可以再试。')).toBeTruthy();
    });
    expect(view.getByLabelText('通过 Apple 登录')).toBeTruthy();
    expect(view.queryByLabelText('退出登录')).toBeNull();
  });

  it('does not let a stale focus failure overwrite a later sign-in', async () => {
    process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL = 'https://family.example.com';
    let rejectFocus: (error: unknown) => void = () => {};
    mockFamily.getMembership
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectFocus = reject;
          }),
      )
      .mockImplementation(() => new Promise(() => {}));
    mockFamily.signInWithApple.mockResolvedValue({ sessionToken: 'ses_1' });
    const view = await render(wrap(<AccountScreen />));
    await waitFor(() => {
      expect(view.getByLabelText('通过 Apple 登录')).toBeTruthy();
    });
    fireEvent.press(view.getByLabelText('通过 Apple 登录'));
    await waitFor(() => {
      expect(view.getByTestId('account-kind-signed-in')).toBeTruthy();
    });
    await act(async () => {
      rejectFocus(new ApplicationError('SERVER_UNREACHABLE', 'Family server is unreachable.'));
    });
    expect(view.getByTestId('account-kind-signed-in')).toBeTruthy();
    expect(view.queryByText('这件事没有做成。个人记录还在这台设备上。')).toBeNull();
    expect(view.queryByText(/连不上授权服务，家庭登录没有完成/)).toBeNull();
    expect(view.queryByLabelText('通过 Apple 登录')).toBeNull();
  });
});
