import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';

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
import { createFamilyRefreshGate } from './family-refresh';
import { ink, inkSoft, paper, sage } from './life-page';

type Busy = 'idle' | 'signing-in' | 'signing-out' | 'email' | 'deleting';

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
      return '邮箱或密码不对，或还没有完成验证。';
    }
    if (error.code === 'TOKEN_INVALID') {
      return '这个链接不能用了，可以重新发送。';
    }
    if (error.code === 'RATE_LIMITED') {
      return '请稍后再试。';
    }
    if (error.code === 'EMAIL_REGISTER_CLOSED') {
      return '邮箱注册目前关闭。家庭创建者、未撤回分享和媒体归属还不能安全删除，所以还不能开放邮箱注册。';
    }
    if (error.code === 'EMAIL_MAILER_UNAVAILABLE') {
      return '邮件发送还没配置，不能做真实邮箱注册验收。';
    }
    if (error.code === 'ACCOUNT_DELETE_BLOCKED') {
      return error.message.includes('creates')
        ? '这个账号还是家庭创建者。先解散或移交家庭，才能删除账号。'
        : error.message.includes('belongs')
          ? '这个账号还在一个家里。先退出家庭，才能删除账号。'
          : '这个账号还有未处理的家庭分享或媒体，不能安全删除。';
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

export default function AccountScreen() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>('idle');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailToken, setEmailToken] = useState('');
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
      let emailFlags = { enabled: false, reason: 'account-delete-incomplete' };
      try {
        const emailHealth = await family.getEmailAuthStatus();
        emailFlags = {
          enabled: emailHealth.emailRegister,
          reason: emailHealth.emailRegisterReason,
        };
      } catch {
        /* keep email closed if health cannot be read */
      }
      if (!refreshGate.isCurrent(gen)) return 'stale' as const;
      if (applyLocalFirst) {
        if (pendingRevoke && !hasSession) {
          setSnapshot(snapshotAfterLocalSignOut(appleAvailable, true, emailFlags));
        } else if (hasSession) {
          setSnapshot(snapshotAfterSignedIn(appleAvailable, emailFlags));
        } else {
          setSnapshot(
            deriveAccountSnapshot({
              serviceReady: true,
              appleAvailable,
              hasSession: false,
              pendingRevoke: false,
              membership: { kind: 'unauthenticated' },
              emailRegisterEnabled: emailFlags.enabled,
              emailRegisterReason: emailFlags.reason,
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
            emailRegisterEnabled: emailFlags.enabled,
            emailRegisterReason: emailFlags.reason,
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
      };
    }, [load, refreshGate]),
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
      setSnapshot(
        snapshotAfterSignedIn(appleAvailable, {
          enabled: snapshot.emailRegisterEnabled,
          reason: snapshot.emailRegisterReason,
        }),
      );
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
        setSnapshot(
          snapshotAfterLocalSignOut(appleAvailable, true, {
            enabled: snapshot.emailRegisterEnabled,
            reason: snapshot.emailRegisterReason,
          }),
        );
        setMessage('这台设备已经退出。远端会话还没确认撤销，连上之后会再试。');
      } else {
        committed = 'out';
        setSnapshot(
          snapshotAfterLocalSignOut(appleAvailable, false, {
            enabled: snapshot.emailRegisterEnabled,
            reason: snapshot.emailRegisterReason,
          }),
        );
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

  async function runEmail(
    work: (family: Awaited<ReturnType<typeof getFamilyUseCases>>) => Promise<unknown>,
    done?: string,
  ) {
    if (busy !== 'idle') return;
    const generation = refreshGate.begin();
    setBusy('email');
    setMessage(null);
    try {
      const family = await getFamilyUseCases();
      await work(family);
      if (!refreshGate.isCurrent(generation)) return;
      if (done) setMessage(done);
    } catch (error) {
      if (refreshGate.isCurrent(generation)) setMessage(accountMessage(error));
    } finally {
      setBusy('idle');
    }
  }

  async function signInWithEmail() {
    if (busy !== 'idle' || !snapshot?.canSignInEmail) return;
    const generation = refreshGate.begin();
    const appleAvailable = snapshot.appleAvailable;
    setBusy('email');
    setMessage(null);
    try {
      const family = await getFamilyUseCases();
      await family.signInWithEmail(email, password);
      if (!refreshGate.isCurrent(generation)) return;
      setSnapshot(
        snapshotAfterSignedIn(appleAvailable, {
          enabled: snapshot.emailRegisterEnabled,
          reason: snapshot.emailRegisterReason,
        }),
      );
      setPassword('');
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

  async function deleteAccount() {
    if (busy !== 'idle' || !snapshot?.canSignOut) return;
    const generation = refreshGate.begin();
    setBusy('deleting');
    setMessage(null);
    try {
      const family = await getFamilyUseCases();
      await family.deleteAccount();
      if (!refreshGate.isCurrent(generation)) return;
      setSnapshot(
        snapshotAfterLocalSignOut(snapshot.appleAvailable, false, {
          enabled: snapshot.emailRegisterEnabled,
          reason: snapshot.emailRegisterReason,
        }),
      );
      setMessage('这个家庭账号已删除。这台设备上的个人记录还在，没有被删掉。');
    } catch (error) {
      if (refreshGate.isCurrent(generation)) setMessage(accountMessage(error));
      return;
    } finally {
      setBusy('idle');
    }
    try {
      await load(generation, { applyLocalFirst: false });
    } catch {
      /* keep the delete result copy */
    }
  }

  const showAppleButton = snapshot?.canSignIn === true && snapshot.appleAvailable && busy === 'idle';
  const showEmailForm = Boolean(snapshot && snapshot.kind !== 'service-unavailable' && snapshot.kind !== 'signed-in');

  return (
    <SafeAreaView style={styles.safe} accessibilityLabel="本机与账户">
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
          本机与账户
        </Text>
        <Text style={styles.body} testID="account-personal">
          个人记录保存在这台设备。目前没有跨设备同步或云备份。
        </Text>
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
          <Text style={styles.body} testID="account-email-unavailable">
            没有授权服务地址时，通过 Apple 登录和使用邮箱登录／注册都不能用。
          </Text>
        ) : null}
        {showEmailForm ? (
          <View testID="account-email">
            <Text style={styles.body} testID="account-email-split">
              分别用 Apple 和邮箱注册可能产生两个 Lampy 账号。本版本不能绑定或合并，也不会把 Apple 私密转发邮箱当成同一个人。
            </Text>
            {snapshot?.emailRegisterEnabled ? (
              <>
                <TextInput
                  testID="account-email-input"
                  accessibilityLabel="邮箱"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholder="邮箱"
                  value={email}
                  onChangeText={setEmail}
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
                <TextInput
                  testID="account-token-input"
                  accessibilityLabel="邮件里的一次性代码"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="邮件里的一次性代码"
                  value={emailToken}
                  onChangeText={setEmailToken}
                  style={styles.field}
                  editable={busy === 'idle'}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="使用邮箱登录"
                  testID="account-email-login"
                  disabled={busy !== 'idle'}
                  onPress={() => void signInWithEmail()}
                  style={styles.hit}
                >
                  <Text style={styles.action}>使用邮箱登录</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="使用邮箱注册"
                  testID="account-email-register"
                  disabled={busy !== 'idle'}
                  onPress={() =>
                    void runEmail(
                      (family) => family.registerWithEmail(email, password),
                      '如果这个邮箱可以继续，我们会发一封验证邮件。分别注册可能产生两个账号。',
                    )
                  }
                  style={styles.hit}
                >
                  <Text style={styles.action}>使用邮箱注册</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="重新发送验证邮件"
                  testID="account-email-resend"
                  disabled={busy !== 'idle'}
                  onPress={() =>
                    void runEmail((family) => family.resendVerification(email), '如果这个邮箱可以继续，我们会再发一封邮件。')
                  }
                  style={styles.hit}
                >
                  <Text style={styles.action}>重新发送验证邮件</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="验证邮箱"
                  testID="account-email-verify"
                  disabled={busy !== 'idle'}
                  onPress={() =>
                    void runEmail((family) => family.verifyEmail(emailToken), '邮箱已验证，现在可以用密码登录。')
                  }
                  style={styles.hit}
                >
                  <Text style={styles.action}>验证邮箱</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="忘记密码"
                  testID="account-email-forgot"
                  disabled={busy !== 'idle'}
                  onPress={() =>
                    void runEmail((family) => family.requestPasswordReset(email), '如果这个邮箱可以继续，我们会发一封重设邮件。')
                  }
                  style={styles.hit}
                >
                  <Text style={styles.action}>忘记密码</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="重设密码"
                  testID="account-email-reset"
                  disabled={busy !== 'idle'}
                  onPress={() =>
                    void runEmail((family) => family.resetPassword(emailToken, password), '密码已重设。请重新登录。')
                  }
                  style={styles.hit}
                >
                  <Text style={styles.action}>重设密码</Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.body} testID="account-email-closed">
                使用邮箱登录／注册目前关闭。家庭创建者、未撤回分享和媒体归属还不能安全删除账号，所以本切片不开放邮箱注册。不会用假删除代替。
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
        {snapshot?.canSignOut && busy === 'idle' ? (
          <View testID="account-delete">
            <Text style={styles.body} testID="account-delete-copy">
              删除账户会撤销这个家庭账号的会话和邮箱凭据。不会删除这台设备上的个人 Moment、照片、录音或回看。若仍是家庭创建者、家里还有你写的分享，或媒体还被家庭引用，删除会被拒绝。
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="删除账户"
              testID="account-delete-button"
              onPress={() => void deleteAccount()}
              style={styles.hit}
            >
              <Text style={styles.action}>删除账户</Text>
            </Pressable>
          </View>
        ) : null}
        {message ? (
          <Text style={styles.body} testID="account-message">
            {message}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: paper },
  column: { padding: 24, gap: 16 },
  title: { fontSize: 28, lineHeight: 36, color: ink },
  body: { fontSize: 17, lineHeight: 26, color: inkSoft },
  back: { fontSize: 17, lineHeight: 24, color: sage },
  action: { fontSize: 17, lineHeight: 24, color: sage },
  hit: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  apple: { width: 240, height: 44 },
  field: {
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: inkSoft,
    fontSize: 17,
    color: ink,
    paddingVertical: 8,
  },
});
