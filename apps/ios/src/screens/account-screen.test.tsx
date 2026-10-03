import type { ReactElement } from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApplicationError } from '../application/errors';
import AccountDiagnosticsRoute from '../app/account-diagnostics';
import AccountScreen from './account-screen';
import { DeviceLockProvider } from './device-lock-context';
import { familyAuthServiceReady } from '../application/account-status';
import { isPersonalSettingsDiagnosticsOpen } from '../application/personal-settings-visibility';

jest.mock('../application/personal-settings-visibility', () => ({
  isPersonalSettingsDiagnosticsOpen: jest.fn(() => true),
}));

const mockFamily = {
  getMembership: jest.fn(),
  signInWithApple: jest.fn(),
  signOut: jest.fn(),
  hasUnconfirmedSessionRevoke: jest.fn(async () => false),
  getAuthHealth: jest.fn(async () => ({
    ok: true,
    slice: 'identity-membership',
    media: true,
    shares: true,
    inbox: true,
    testAccountLogin: false,
    testAccountLoginReason: 'disabled',
    argon2id: { t: 2, m: 19_456, p: 1, dkLen: 32 },
  })),
  signInWithTestAccount: jest.fn(),
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
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() }),
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
    mockFamily.getAuthHealth.mockReset().mockResolvedValue({
      ok: true,
      slice: 'identity-membership',
      media: true,
      shares: true,
      inbox: true,
      testAccountLogin: false,
      testAccountLoginReason: 'disabled',
      argon2id: { t: 2, m: 19_456, p: 1, dkLen: 32 },
    });
    mockFamily.signInWithTestAccount.mockReset();
    mockSession.getSessionToken.mockReset().mockResolvedValue(null);
    mockSession.getPendingRevoke.mockReset().mockResolvedValue(null);
    mockApple.isAvailable.mockReset().mockResolvedValue(true);
    mockApple.requestIdentityToken.mockReset().mockResolvedValue('identity-token');
    jest.mocked(isPersonalSettingsDiagnosticsOpen).mockReturnValue(true);
  });

  it('does not pretend family login works when no auth service is configured', async () => {
    expect(familyAuthServiceReady()).toBe(false);
    const view = await render(wrap(<AccountScreen variant="diagnostics" />));
    await waitFor(() => {
      expect(view.getByTestId('account-kind-service-unavailable')).toBeTruthy();
    });
    expect(view.queryByLabelText('通过 Apple 登录')).toBeNull();
    expect(view.getByTestId('account-test-login-unavailable')).toBeTruthy();
    expect(view.queryByLabelText('测试账号登录')).toBeNull();
    expect(view.queryByText(/家庭成员|头像/)).toBeNull();
    expect(view.getByTestId('account-family-preview')).toBeTruthy();
    expect(view.getByText('私密家庭空间正在准备中。敬请期待。')).toBeTruthy();
    expect(view.queryByLabelText('邀请')).toBeNull();
    expect(view.queryByLabelText('分享')).toBeNull();
    expect(mockFamily.getMembership).not.toHaveBeenCalled();
  });

  it('shows the system Apple control when the auth service is ready and the user is unsigned', async () => {
    process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL = 'https://family.example.com';
    mockFamily.getMembership.mockResolvedValue({ kind: 'unauthenticated' });
    const view = await render(wrap(<AccountScreen variant="diagnostics" />));
    await waitFor(() => {
      expect(view.getByTestId('account-kind-unsigned')).toBeTruthy();
    });
    expect(view.getByLabelText('通过 Apple 登录')).toBeTruthy();
    expect(view.getByTestId('account-test-login-closed')).toBeTruthy();
    expect(view.queryByLabelText('测试账号登录')).toBeNull();
    expect(view.queryByLabelText('使用邮箱注册')).toBeNull();
    expect(view.queryByLabelText('验证邮箱')).toBeNull();
    expect(view.queryByLabelText('忘记密码')).toBeNull();
    expect(view.queryByLabelText('删除账户')).toBeNull();
  });

  it('keeps cancelled Apple authorization as unsigned and retryable', async () => {
    process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL = 'https://family.example.com';
    mockFamily.getMembership.mockResolvedValue({ kind: 'unauthenticated' });
    mockApple.requestIdentityToken.mockRejectedValue(
      new ApplicationError('APPLE_SIGN_IN_CANCELLED', 'Sign in with Apple was cancelled.'),
    );
    const view = await render(wrap(<AccountScreen variant="diagnostics" />));
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
    const view = await render(wrap(<AccountScreen variant="diagnostics" />));
    await waitFor(() => {
      expect(view.getByTestId('account-kind-needs-reauth')).toBeTruthy();
    });
    expect(view.getByLabelText('通过 Apple 登录')).toBeTruthy();
  });

  it('treats an invalid Apple token as a failed login, not an expired session', async () => {
    process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL = 'https://family.example.com';
    mockFamily.getMembership.mockResolvedValue({ kind: 'unauthenticated' });
    mockFamily.signInWithApple.mockRejectedValue(
      new ApplicationError('APPLE_TOKEN_INVALID', 'Apple identity token is invalid.'),
    );
    const view = await render(wrap(<AccountScreen variant="diagnostics" />));
    await waitFor(() => {
      expect(view.getByLabelText('通过 Apple 登录')).toBeTruthy();
    });
    fireEvent.press(view.getByLabelText('通过 Apple 登录'));
    await waitFor(() => {
      expect(view.getByText('这次 Apple 登录没有完成。个人记录还在这台设备上。')).toBeTruthy();
    });
    expect(view.queryByText(/这次会话已经失效/)).toBeNull();
    expect(view.getByTestId('account-kind-unsigned')).toBeTruthy();
    expect(view.getByLabelText('通过 Apple 登录')).toBeTruthy();
  });

  it('paints a trusted local session before a delayed health response', async () => {
    process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL = 'https://family.example.com';
    mockSession.getSessionToken.mockResolvedValue('ses_1');
    mockFamily.getAuthHealth.mockImplementation(() => new Promise(() => {}));
    mockFamily.getMembership.mockImplementation(() => new Promise(() => {}));
    const view = await render(wrap(<AccountScreen variant="diagnostics" />));
    await waitFor(() => {
      expect(view.getByTestId('account-kind-signed-in')).toBeTruthy();
    });
    expect(mockFamily.getAuthHealth).toHaveBeenCalled();
    expect(mockFamily.getMembership).not.toHaveBeenCalled();
    expect(view.queryByText(/现在读不到最新账户状态/)).toBeNull();
    expect(view.queryByLabelText('通过 Apple 登录')).toBeNull();
    expect(view.getByLabelText('退出登录')).toBeTruthy();
  });

  it('paints unsigned first then updates test-login capability after health arrives', async () => {
    process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL = 'https://family.example.com';
    let resolveHealth: (value: {
      ok: true;
      slice: 'identity-membership';
      media: true;
      shares: true;
      inbox: true;
      testAccountLogin: boolean;
      testAccountLoginReason: string;
      argon2id: { t: number; m: number; p: number; dkLen: number };
    }) => void = () => {};
    mockFamily.getMembership.mockResolvedValue({ kind: 'unauthenticated' });
    mockFamily.getAuthHealth.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveHealth = resolve;
        }),
    );
    const view = await render(wrap(<AccountScreen variant="diagnostics" />));
    await waitFor(() => {
      expect(view.getByTestId('account-kind-unsigned')).toBeTruthy();
      expect(view.getByTestId('account-test-login-closed')).toBeTruthy();
    });
    expect(view.queryByLabelText('测试账号登录')).toBeNull();
    await act(async () => {
      resolveHealth({
        ok: true,
        slice: 'identity-membership',
        media: true,
        shares: true,
        inbox: true,
        testAccountLogin: true,
        testAccountLoginReason: 'enabled',
        argon2id: { t: 2, m: 19_456, p: 1, dkLen: 32 },
      });
    });
    await waitFor(() => {
      expect(view.getByLabelText('测试账号登录')).toBeTruthy();
    });
  });

  it('paints a trusted local session before membership refresh, not as unreachable', async () => {
    process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL = 'https://family.example.com';
    mockSession.getSessionToken.mockResolvedValue('ses_1');
    mockFamily.getMembership.mockImplementation(() => new Promise(() => {}));
    const view = await render(wrap(<AccountScreen variant="diagnostics" />));
    await waitFor(() => {
      expect(view.getByTestId('account-kind-signed-in')).toBeTruthy();
    });
    expect(view.queryByText(/现在读不到最新账户状态/)).toBeNull();
    expect(view.queryByLabelText('通过 Apple 登录')).toBeNull();
    expect(view.getByLabelText('退出登录')).toBeTruthy();
  });

  it('keeps a trusted local session when the focus refresh fails', async () => {
    process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL = 'https://family.example.com';
    mockSession.getSessionToken.mockResolvedValue('ses_1');
    mockFamily.getMembership.mockRejectedValue(
      new ApplicationError('SERVER_UNREACHABLE', 'Family server is unreachable.'),
    );
    const view = await render(wrap(<AccountScreen variant="diagnostics" />));
    await waitFor(() => {
      expect(view.getByTestId('account-kind-signed-in')).toBeTruthy();
      expect(view.getByText('已登录。现在读不到最新账户状态，可以再试。')).toBeTruthy();
    });
    expect(view.queryByText(/家庭登录没有完成/)).toBeNull();
    expect(view.queryByLabelText('通过 Apple 登录')).toBeNull();
    expect(view.getByLabelText('退出登录')).toBeTruthy();
  });

  it('keeps a network login failure retryable and does not treat it as signed in', async () => {
    process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL = 'https://family.example.com';
    mockFamily.getMembership.mockResolvedValue({ kind: 'unauthenticated' });
    mockFamily.signInWithApple.mockRejectedValue(
      new ApplicationError('SERVER_UNREACHABLE', 'Family server is unreachable.'),
    );
    const view = await render(wrap(<AccountScreen variant="diagnostics" />));
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
    const view = await render(wrap(<AccountScreen variant="diagnostics" />));
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
    const view = await render(wrap(<AccountScreen variant="diagnostics" />));
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
    const view = await render(wrap(<AccountScreen variant="diagnostics" />));
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
    const view = await render(wrap(<AccountScreen variant="diagnostics" />));
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
    const view = await render(wrap(<AccountScreen variant="diagnostics" />));
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

  it('shows controlled test login only when the server says it is enabled', async () => {
    process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL = 'https://family.example.com';
    mockFamily.getMembership.mockResolvedValue({ kind: 'unauthenticated' });
    mockFamily.getAuthHealth.mockResolvedValue({
      ok: true,
      slice: 'identity-membership',
      media: true,
      shares: true,
      inbox: true,
      testAccountLogin: true,
      testAccountLoginReason: 'enabled',
      argon2id: { t: 2, m: 19_456, p: 1, dkLen: 32 },
    });
    mockFamily.signInWithTestAccount.mockRejectedValue(new ApplicationError('AUTH_FAILED', 'Login name or password is wrong.'));
    const view = await render(wrap(<AccountScreen variant="diagnostics" />));
    await waitFor(() => {
      expect(view.getByLabelText('测试账号登录')).toBeTruthy();
    });
    expect(view.queryByText(/正式邮箱注册/)).toBeTruthy();
    expect(view.queryByLabelText('使用邮箱注册')).toBeNull();
    await act(async () => {
      fireEvent.changeText(view.getByTestId('account-test-login-input'), 'a@example.com');
      fireEvent.changeText(view.getByTestId('account-password-input'), 'correct-horse');
    });
    expect(view.getByDisplayValue('a@example.com')).toBeTruthy();
    expect(view.getByDisplayValue('correct-horse')).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByTestId('account-test-login-submit'));
    });
    await waitFor(() => {
      expect(mockFamily.signInWithTestAccount).toHaveBeenCalledWith('a@example.com', 'correct-horse');
      expect(view.getByText('登录名或密码不对。')).toBeTruthy();
    });
    expect(view.getByTestId('account-password-input').props.value).toBe('');
    expect(view.getByTestId('account-test-login-submit')).toBeTruthy();
  });

  it('lets the user turn Face ID protection on only after a successful device challenge', async () => {
    const setEnabled = jest.fn(async () => undefined);
    const authenticate = jest.fn(async () => ({ ok: true as const }));
    const view = await render(
      wrap(
        <DeviceLockProvider
          store={{ isEnabled: async () => false, setEnabled }}
          authenticator={{ authenticate }}
        >
          <AccountScreen />
        </DeviceLockProvider>,
      ),
    );
    await waitFor(() => {
      expect(view.getByText('本机保护')).toBeTruthy();
      expect(view.getByText('未开启')).toBeTruthy();
    });
    expect(view.getByText('进入 Lampy 时使用 Face ID 或设备密码。')).toBeTruthy();
    await act(async () => {
      fireEvent(view.getByTestId('account-device-lock-toggle'), 'valueChange', true);
    });
    expect(authenticate).toHaveBeenCalled();
    expect(setEnabled).toHaveBeenCalledWith(true);
  });

  it('keeps 本机设置 to protection and the grouped reading entries', async () => {
    const view = await render(
      wrap(
        <DeviceLockProvider
          store={{ isEnabled: async () => false, setEnabled: async () => undefined }}
          authenticator={{ authenticate: async () => ({ ok: true as const }) }}
        >
          <AccountScreen />
        </DeviceLockProvider>,
      ),
    );
    await waitFor(() => {
      expect(view.getByLabelText('本机设置')).toBeTruthy();
      expect(view.getByText('本机设置')).toBeTruthy();
    });
    expect(view.getByText('最近')).toBeTruthy();
    expect(view.getByTestId('account-settings-intro')).toBeTruthy();
    expect(view.getByText('把生活，留给自己。')).toBeTruthy();
    expect(view.getByText('本机')).toBeTruthy();
    expect(view.getByText('关于')).toBeTruthy();
    expect(view.getByLabelText('本机保护')).toBeTruthy();
    expect(view.getByLabelText('记录与存储')).toBeTruthy();
    expect(view.getByLabelText('我的生活册')).toBeTruthy();
    expect(view.getByLabelText('订阅与付费')).toBeTruthy();
    expect(view.getByText('目前没有付费项目')).toBeTruthy();
    expect(view.getByLabelText('使用帮助')).toBeTruthy();
    expect(view.getByLabelText('关于 Lampy')).toBeTruthy();
    expect(view.getByLabelText('使用条款')).toBeTruthy();
    expect(view.getByLabelText('隐私政策')).toBeTruthy();
    expect(view.queryByLabelText('意见与反馈')).toBeNull();
    expect(view.queryByText(/购买/)).toBeNull();
    expect(view.queryByTestId('account-personal')).toBeNull();
    expect(view.queryByTestId('account-version')).toBeNull();
    expect(view.getByLabelText('开发诊断')).toBeTruthy();
    expect(view.queryByTestId('account-diagnostics')).toBeNull();
    expect(view.queryByTestId('account-family-preview')).toBeNull();
    expect(view.queryByTestId('account-kind-service-unavailable')).toBeNull();
    expect(view.queryByLabelText('通过 Apple 登录')).toBeNull();
    expect(view.queryByLabelText('测试账号登录')).toBeNull();
    expect(view.queryByText('私密家庭空间正在准备中。敬请期待。')).toBeNull();
  });

  it('does not show diagnostics or fetch them when the route is opened with the gate closed', async () => {
    jest.mocked(isPersonalSettingsDiagnosticsOpen).mockReturnValue(false);
    const view = await render(wrap(<AccountDiagnosticsRoute />));
    await waitFor(() => {
      expect(view.getByTestId('account-diagnostics-closed')).toBeTruthy();
    });
    expect(StyleSheet.flatten(view.getByTestId('account-diagnostics-closed').props.style).flex).toBe(1);
    expect(view.getByText('这里没有开发诊断。')).toBeTruthy();
    expect(view.getByLabelText('返回')).toBeTruthy();
    expect(view.queryByTestId('account-diagnostics')).toBeNull();
    expect(view.queryByTestId('account-family-preview')).toBeNull();
    expect(view.queryByLabelText('通过 Apple 登录')).toBeNull();
    expect(view.queryByLabelText('测试账号登录')).toBeNull();
    expect(mockApple.isAvailable).not.toHaveBeenCalled();
    expect(mockFamily.getMembership).not.toHaveBeenCalled();
    expect(mockFamily.getAuthHealth).not.toHaveBeenCalled();
  });

  it('hides the developer entry when the diagnostics gate is closed', async () => {
    jest.mocked(isPersonalSettingsDiagnosticsOpen).mockReturnValue(false);
    const view = await render(wrap(<AccountScreen />));
    await waitFor(() => {
      expect(view.getByLabelText('本机设置')).toBeTruthy();
    });
    expect(view.getByLabelText('记录与存储')).toBeTruthy();
    expect(view.getByLabelText('关于 Lampy')).toBeTruthy();
    expect(view.queryByTestId('account-personal')).toBeNull();
    expect(view.queryByTestId('account-version')).toBeNull();
    expect(view.queryByLabelText('开发诊断')).toBeNull();
    expect(view.queryByTestId('account-diagnostics')).toBeNull();
  });
});

