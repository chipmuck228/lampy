import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput, type } from './life-text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';

import {
  accountRefreshFailureMessage,
  deriveAccountSnapshot,
  familyAuthServiceReady,
  snapshotAfterLocalSignOut,
  snapshotAfterSignedIn,
  type AccountSnapshot,
} from '../application/account-status';
import { getFamilyUseCases } from '../application/container';
import { isApplicationError } from '../application/errors';
import { createExpoAppleIdentityTokenSource } from '../infrastructure/expo-apple-auth';
import { createSecureFamilySessionStore } from '../infrastructure/secure-family-session';
import { isPersonalSettingsDiagnosticsOpen } from '../application/personal-settings-visibility';
import { DeviceLockSettings } from './device-lock-context';
import { createFamilyRefreshGate } from './family-refresh';
import { ink, inkSoft, paper, sage } from './life-page';

type Busy = 'idle' | 'signing-in' | 'signing-out' | 'test-login';

function accountMessage(error: unknown) {
  if (isApplicationError(error)) {
    if (error.code === 'APPLE_SIGN_IN_CANCELLED') return '这次没有登录。';
    if (error.code === 'APPLE_UNAVAILABLE') return '这台设备现在不能用 Apple 登录。';
    if (error.code === 'SERVER_UNREACHABLE' || error.code === 'NETWORK') {
      return '现在连不上授权服务，家庭登录没有完成。个人记录还在这台设备上。';
    }
    if (error.code === 'UNAUTHENTICATED') {
      return '这次会话已经失效，需要重新登录。';
    }
    if (error.code === 'APPLE_TOKEN_INVALID') {
      return '这次 Apple 登录没有完成。个人记录还在这台设备上。';
    }
    if (error.code === 'AUTH_FAILED') {
      return '登录名或密码不对。';
    }
    if (error.code === 'RATE_LIMITED') {
      return '请稍后再试。';
    }
    if (error.code === 'TEST_ACCOUNT_LOGIN_CLOSED') {
      return '受控测试账号登录目前关闭。这不是正式邮箱注册。';
    }
  }
  return '这件事没有做成。个人记录还在这台设备上。';
}

function kindCopy(snapshot: AccountSnapshot) {
  if (snapshot.kind === 'service-unavailable') {
    return '现在没有可连接的授权服务，不能完成家庭登录。';
  }
  if (snapshot.kind === 'needs-reauth') {
    return '这次会话已经失效，需要重新登录。登录成功还不等于已经在一个家里。';
  }
  if (snapshot.kind === 'local-out-revoke-pending') {
    return '这台设备已经退出。远端会话还没确认撤销，连上之后会再试。';
  }
  if (snapshot.kind === 'signed-in') {
    return snapshot.sessionUnreachable
      ? '已登录，但现在连不上授权服务，家庭内容不会显示。个人记录还在这台设备上。'
      : '已登录。登录成功还不等于已经在一个家里。';
  }
  return '还没有家庭身份。登录成功还不等于已经在一个家里。';
}

function testLoginFlags(snapshot: AccountSnapshot | null) {
  return {
    enabled: snapshot?.testAccountLoginEnabled === true,
    reason: snapshot?.testAccountLoginReason ?? 'disabled',
  };
}

export function AccountDiagnosticsClosed() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} accessibilityLabel="开发诊断" testID="account-diagnostics-closed">
      <ScrollView contentContainerStyle={styles.column}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          testID="account-back"
          onPress={() => router.back()}
          style={styles.hit}
        >
          <Text style={styles.back}>返回</Text>
        </Pressable>
        <Text style={styles.body}>这里没有开发诊断。</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function AccountScreen({ variant = 'user' }: { variant?: 'user' | 'diagnostics' } = {}) {
  const router = useRouter();
  const diagnostics = variant === 'diagnostics';
  const diagnosticsAllowed = isPersonalSettingsDiagnosticsOpen();
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>('idle');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const refreshGate = useState(() => createFamilyRefreshGate())[0];
  const snapshotRef = useRef<AccountSnapshot | null>(null);
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const load = useCallback(
    async (generation?: number, options?: { applyLocalFirst?: boolean }) => {
      const gen = generation ?? refreshGate.begin();
      const applyLocalFirst = options?.applyLocalFirst !== false;
      const apple = createExpoAppleIdentityTokenSource();
      const appleAvailable = await apple.isAvailable();
      if (!refreshGate.isCurrent(gen)) return 'stale' as const;
      const session = createSecureFamilySessionStore();
      const serviceReady = familyAuthServiceReady();
      const hasSession = Boolean(await session.getSessionToken());
      const pendingRevoke = Boolean(await session.getPendingRevoke());
      if (!refreshGate.isCurrent(gen)) return 'stale' as const;
      if (!serviceReady) {
        setSnapshot(
          deriveAccountSnapshot({
            serviceReady: false,
            appleAvailable,
            hasSession,
            pendingRevoke,
          }),
        );
        return 'ok' as const;
      }
      const family = await getFamilyUseCases();
      const unknownTestFlags = { enabled: false, reason: 'disabled' };
      if (applyLocalFirst) {
        if (pendingRevoke && !hasSession) {
          setSnapshot(snapshotAfterLocalSignOut(appleAvailable, true, unknownTestFlags));
        } else if (hasSession) {
          setSnapshot(snapshotAfterSignedIn(appleAvailable, unknownTestFlags));
        } else {
          setSnapshot(
            deriveAccountSnapshot({
              serviceReady: true,
              appleAvailable,
              hasSession: false,
              pendingRevoke: false,
              membership: { kind: 'unauthenticated' },
              testAccountLoginEnabled: unknownTestFlags.enabled,
              testAccountLoginReason: unknownTestFlags.reason,
            }),
          );
        }
      }
      let testFlags = unknownTestFlags;
      try {
        const health = await family.getAuthHealth();
        testFlags = {
          enabled: health.testAccountLogin,
          reason: health.testAccountLoginReason,
        };
      } catch {
        /* hide test login unless the server explicitly supports it */
      }
      if (!refreshGate.isCurrent(gen)) return 'stale' as const;
      if (applyLocalFirst) {
        if (pendingRevoke && !hasSession) {
          setSnapshot(snapshotAfterLocalSignOut(appleAvailable, true, testFlags));
        } else if (hasSession) {
          setSnapshot(snapshotAfterSignedIn(appleAvailable, testFlags));
        } else {
          setSnapshot(
            deriveAccountSnapshot({
              serviceReady: true,
              appleAvailable,
              hasSession: false,
              pendingRevoke: false,
              membership: { kind: 'unauthenticated' },
              testAccountLoginEnabled: testFlags.enabled,
              testAccountLoginReason: testFlags.reason,
            }),
          );
        }
      }
      try {
        const membership = await family.getMembership();
        const familyPending = await family.hasUnconfirmedSessionRevoke();
        const latestSession = Boolean(await session.getSessionToken());
        if (!refreshGate.isCurrent(gen)) return 'stale' as const;
        setSnapshot(
          deriveAccountSnapshot({
            serviceReady: true,
            appleAvailable,
            hasSession: latestSession,
            pendingRevoke: familyPending,
            membership,
            testAccountLoginEnabled: testFlags.enabled,
            testAccountLoginReason: testFlags.reason,
          }),
        );
        return 'ok' as const;
      } catch (error) {
        if (!refreshGate.isCurrent(gen)) return 'stale' as const;
        if (applyLocalFirst && hasSession) return 'refresh-failed-signed-in' as const;
        if (applyLocalFirst && pendingRevoke && !hasSession) {
          return 'refresh-failed-pending-out' as const;
        }
        throw error;
      }
    },
    [refreshGate],
  );

  useFocusEffect(
    useCallback(() => {
      if (!diagnostics || !diagnosticsAllowed) return undefined;
      const generation = refreshGate.begin();
      load(generation)
        .then((result) => {
          if (!refreshGate.isCurrent(generation) || result === 'stale') return;
          if (result === 'refresh-failed-signed-in') {
            setMessage(accountRefreshFailureMessage('sign-in'));
            return;
          }
          if (result === 'refresh-failed-pending-out') {
            setMessage(accountRefreshFailureMessage('sign-out-pending'));
            return;
          }
          setMessage(null);
        })
        .catch((error) => {
          if (!refreshGate.isCurrent(generation)) return;
          const current = snapshotRef.current;
          if (current?.kind === 'signed-in') {
            setMessage(accountRefreshFailureMessage('sign-in'));
            return;
          }
          if (current?.kind === 'local-out-revoke-pending') {
            setMessage(accountRefreshFailureMessage('sign-out-pending'));
            return;
          }
          setMessage(accountMessage(error));
        });
      return () => {
        refreshGate.begin();
        setPassword('');
      };
    }, [diagnostics, diagnosticsAllowed, load, refreshGate]),
  );

  async function signIn() {
    if (busy !== 'idle' || !snapshot?.canSignIn) return;
    const generation = refreshGate.begin();
    const appleAvailable = snapshot.appleAvailable;
    setBusy('signing-in');
    setMessage(null);
    try {
      const token = await createExpoAppleIdentityTokenSource().requestIdentityToken();
      const family = await getFamilyUseCases();
      await family.signInWithApple(token);
      if (!refreshGate.isCurrent(generation)) return;
      setSnapshot(snapshotAfterSignedIn(appleAvailable, testLoginFlags(snapshot)));
      setMessage(null);
    } catch (error) {
      if (refreshGate.isCurrent(generation)) setMessage(accountMessage(error));
      return;
    } finally {
      setBusy('idle');
    }
    try {
      const result = await load(generation, { applyLocalFirst: false });
      if (!refreshGate.isCurrent(generation) || result === 'stale') return;
      setMessage(null);
    } catch {
      if (!refreshGate.isCurrent(generation)) return;
      setMessage(accountRefreshFailureMessage('sign-in'));
    }
  }

  async function signOut() {
    if (busy !== 'idle' || !snapshot?.canSignOut) return;
    const generation = refreshGate.begin();
    const appleAvailable = snapshot.appleAvailable;
    setBusy('signing-out');
    setMessage(null);
    let committed: 'still-in' | 'out' | 'out-pending' | null = null;
    try {
      const family = await getFamilyUseCases();
      const result = await family.signOut();
      if (!refreshGate.isCurrent(generation)) return;
      if (result.local === 'still-signed-in') {
        committed = 'still-in';
        setMessage('这台设备还没有退出。待撤销凭据没能写进本机保险柜，请再试。');
      } else if (result.server === 'unconfirmed') {
        committed = 'out-pending';
        setSnapshot(snapshotAfterLocalSignOut(appleAvailable, true, testLoginFlags(snapshot)));
        setMessage('这台设备已经退出。远端会话还没确认撤销，连上之后会再试。');
      } else {
        committed = 'out';
        setSnapshot(snapshotAfterLocalSignOut(appleAvailable, false, testLoginFlags(snapshot)));
      }
    } catch (error) {
      if (refreshGate.isCurrent(generation)) setMessage(accountMessage(error));
      return;
    } finally {
      setBusy('idle');
    }
    try {
      const result = await load(generation, { applyLocalFirst: false });
      if (!refreshGate.isCurrent(generation) || result === 'stale') return;
      if (committed === 'still-in') {
        setMessage('这台设备还没有退出。待撤销凭据没能写进本机保险柜，请再试。');
        return;
      }
      if (committed === 'out-pending') {
        setMessage('这台设备已经退出。远端会话还没确认撤销，连上之后会再试。');
        return;
      }
      setMessage(null);
    } catch {
      if (!refreshGate.isCurrent(generation)) return;
      if (committed === 'still-in') {
        setMessage('这台设备还没有退出。待撤销凭据没能写进本机保险柜，请再试。');
        return;
      }
      setMessage(accountRefreshFailureMessage(committed === 'out-pending' ? 'sign-out-pending' : 'sign-out'));
    }
  }

  async function signInWithTestAccount() {
    if (busy !== 'idle' || !snapshot?.canSignInTestAccount) return;
    const generation = refreshGate.begin();
    const appleAvailable = snapshot.appleAvailable;
    const submittedLogin = login;
    const submittedPassword = password;
    setPassword('');
    setBusy('test-login');
    setMessage(null);
    try {
      const family = await getFamilyUseCases();
      await family.signInWithTestAccount(submittedLogin, submittedPassword);
      if (!refreshGate.isCurrent(generation)) return;
      setSnapshot(snapshotAfterSignedIn(appleAvailable, testLoginFlags(snapshot)));
    } catch (error) {
      if (refreshGate.isCurrent(generation)) setMessage(accountMessage(error));
      return;
    } finally {
      setBusy('idle');
    }
    try {
      const result = await load(generation, { applyLocalFirst: false });
      if (!refreshGate.isCurrent(generation) || result === 'stale') return;
      setMessage(null);
    } catch {
      if (refreshGate.isCurrent(generation)) setMessage(accountRefreshFailureMessage('sign-in'));
    }
  }

  const showAppleButton = snapshot?.canSignIn === true && snapshot.appleAvailable && busy === 'idle';
  const showTestLoginPanel = Boolean(snapshot && snapshot.kind !== 'service-unavailable' && snapshot.kind !== 'signed-in');
  const showDiagnosticsEntry = !diagnostics && diagnosticsAllowed;
  const appVersion = Constants.expoConfig?.version ?? '0.1.0';

  if (diagnostics && !diagnosticsAllowed) {
    return <AccountDiagnosticsClosed />;
  }

  return (
    <SafeAreaView style={styles.safe} accessibilityLabel={diagnostics ? '开发诊断' : '本机设置'}>
      <ScrollView contentContainerStyle={styles.column} testID="account-scroll">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          testID="account-back"
          onPress={() => router.back()}
          style={styles.hit}
        >
          <Text style={styles.back}>返回</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          {diagnostics ? '开发诊断' : '本机设置'}
        </Text>
        {diagnostics ? null : (
          <>
            <DeviceLockSettings />
            <Text style={styles.body} testID="account-personal">
              个人记录保存在这台设备。目前没有跨设备同步或云备份。
            </Text>
          </>
        )}
        {diagnostics ? (
        <View testID="account-diagnostics">
        <View testID="account-family-preview">
          <Text style={styles.body} testID="account-family-copy">
            有些生活，只想交给重要的人。
          </Text>
          <Text style={styles.body} testID="account-family-soon">
            私密家庭空间正在准备中。敬请期待。
          </Text>
        </View>
        {snapshot ? (
          <Text style={styles.body} testID={`account-kind-${snapshot.kind}`}>
            {kindCopy(snapshot)}
          </Text>
        ) : null}
        {busy === 'signing-in' ? (
          <Text style={styles.body} testID="account-busy-in">
            正在登录。
          </Text>
        ) : null}
        {busy === 'signing-out' ? (
          <Text style={styles.body} testID="account-busy-out">
            正在退出。
          </Text>
        ) : null}
        {busy === 'test-login' ? (
          <Text style={styles.body} testID="account-busy-test">
            正在登录。
          </Text>
        ) : null}
        {showAppleButton ? (
          <View testID="account-apple-button">
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={4}
              style={styles.apple}
              onPress={() => void signIn()}
            />
          </View>
        ) : null}
        {snapshot?.kind === 'service-unavailable' ? (
          <Text style={styles.body} testID="account-test-login-unavailable">
            没有授权服务地址时，通过 Apple 登录和受控测试账号登录都不能用。
          </Text>
        ) : null}
        {showTestLoginPanel ? (
          <View testID="account-test-login">
            <Text style={styles.body} testID="account-test-login-copy">
              测试账号登录是受控测试能力，不是正式邮箱注册。登录名只是账号标识，不是已验证邮箱，也不会和 Apple 账号自动合并。
            </Text>
            {snapshot?.canSignInTestAccount ? (
              <>
                <TextInput
                  testID="account-test-login-input"
                  accessibilityLabel="测试账号登录名"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholder="测试账号登录名"
                  value={login}
                  onChangeText={setLogin}
                  style={styles.field}
                  editable={busy === 'idle'}
                />
                <TextInput
                  testID="account-password-input"
                  accessibilityLabel="密码"
                  secureTextEntry
                  placeholder="密码"
                  value={password}
                  onChangeText={setPassword}
                  style={styles.field}
                  editable={busy === 'idle'}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="测试账号登录"
                  testID="account-test-login-submit"
                  disabled={busy !== 'idle'}
                  onPress={() => void signInWithTestAccount()}
                  style={styles.hit}
                >
                  <Text style={styles.action}>测试账号登录</Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.body} testID="account-test-login-closed">
                这台授权服务没有开放受控测试账号登录。这不是正式邮箱注册，也没有忘记密码或验证邮箱。
              </Text>
            )}
          </View>
        ) : null}
        {snapshot?.canSignOut && busy === 'idle' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="退出登录"
            testID="account-sign-out"
            onPress={() => void signOut()}
            style={styles.hit}
          >
            <Text style={styles.action}>退出登录</Text>
          </Pressable>
        ) : null}
        {message ? (
          <Text style={styles.body} testID="account-message">
            {message}
          </Text>
        ) : null}
        </View>
        ) : null}
        {diagnostics ? null : (
          <>
            {showDiagnosticsEntry ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="开发诊断"
                testID="account-open-diagnostics"
                onPress={() => router.push('/account-diagnostics')}
                style={styles.hit}
              >
                <Text style={styles.action}>开发诊断</Text>
              </Pressable>
            ) : null}
            <Text style={styles.version} testID="account-version">
              版本 {appVersion}
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: paper },
  column: { padding: 24, gap: 16 },
  title: { ...type.title, color: ink },
  body: { ...type.body, color: inkSoft },
  back: { ...type.action, color: sage },
  action: { ...type.action, color: sage },
  hit: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  version: { ...type.meta, color: inkSoft, marginTop: 8 },
  apple: { width: 240, height: 44 },
  field: {
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: inkSoft,
    ...type.body,
    color: ink,
    paddingVertical: 8,
  },
});
