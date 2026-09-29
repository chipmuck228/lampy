import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

type Busy = 'idle' | 'signing-in' | 'signing-out';

function accountMessage(error: unknown) {
  if (isApplicationError(error)) {
    if (error.code === 'APPLE_SIGN_IN_CANCELLED') return '这次没有登录。';
    if (error.code === 'APPLE_UNAVAILABLE') return '这台设备现在不能用 Apple 登录。';
    if (error.code === 'SERVER_UNREACHABLE' || error.code === 'NETWORK') {
      return '现在连不上授权服务，家庭登录没有完成。个人记录还在这台设备上。';
    }
    if (error.code === 'UNAUTHENTICATED' || error.code === 'APPLE_TOKEN_INVALID') {
      return '这次会话已经失效，需要重新用 Apple 登录。';
    }
  }
  return '这件事没有做成。个人记录还在这台设备上。';
}

function kindCopy(snapshot: AccountSnapshot) {
  if (snapshot.kind === 'service-unavailable') {
    return '现在没有可连接的授权服务，不能完成家庭登录。';
  }
  if (snapshot.kind === 'needs-reauth') {
    return '这次会话已经失效，需要重新用 Apple 登录。登录成功还不等于已经在一个家里。';
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
  const refreshGate = useState(() => createFamilyRefreshGate())[0];

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
      if (applyLocalFirst) {
        setSnapshot(
          deriveAccountSnapshot({
            serviceReady: true,
            appleAvailable,
            hasSession,
            pendingRevoke,
            membership: hasSession
              ? { kind: 'unconfirmed', reason: 'unreachable' }
              : { kind: 'unauthenticated' },
          }),
        );
      }
      const family = await getFamilyUseCases();
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
        }),
      );
      return 'ok' as const;
    },
    [refreshGate],
  );

  useFocusEffect(
    useCallback(() => {
      const generation = refreshGate.begin();
      load(generation)
        .then((result) => {
          if (!refreshGate.isCurrent(generation) || result === 'stale') return;
          setMessage(null);
        })
        .catch((error) => {
          if (!refreshGate.isCurrent(generation)) return;
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
      setSnapshot(snapshotAfterSignedIn(appleAvailable));
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
        setSnapshot(snapshotAfterLocalSignOut(appleAvailable, true));
        setMessage('这台设备已经退出。远端会话还没确认撤销，连上之后会再试。');
      } else {
        committed = 'out';
        setSnapshot(snapshotAfterLocalSignOut(appleAvailable, false));
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

  const showAppleButton = snapshot?.canSignIn === true && snapshot.appleAvailable && busy === 'idle';

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
});
