import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { getFamilyUseCases } from '../application/container';
import type { FamilyInboxView, FamilyMembershipView, FamilyUseCases } from '../application/family-use-cases';
import { isApplicationError } from '../application/errors';
import type { InvitationView } from '../family-api/types';
import { createExpoAppleIdentityTokenSource } from '../infrastructure/expo-apple-auth';
import { isFamilyApiConfigured } from '../infrastructure/family-config';
import {
  armFamilyTestCacheDeleteFailure,
  armFamilyTestNextRequestFailure,
  familyTestIdentityToken,
  familyTestInviteCode,
  familyTestInviteSource,
  familyTestLastRequest,
  formatFamilyTestCacheCleanup,
  formatFamilyTestLastRequest,
  isFamilyTestDriverEnabled,
  recordFamilyTestLastRequest,
  storeFamilyTestInviteCode,
} from '../infrastructure/family-test-driver';
import { createFamilyRefreshGate } from './family-refresh';

function errorText(error: unknown) {
  if (isApplicationError(error)) {
    if (error.code === 'APPLE_SIGN_IN_CANCELLED') return '这次没有登录。';
    if (error.code === 'APPLE_UNAVAILABLE') return '这台设备现在不能用 Apple 登录。';
    if (error.code === 'SERVER_UNREACHABLE' || error.code === 'NETWORK') {
      return '现在连不上家庭服务，不能确认家里有谁。';
    }
    if (error.code === 'ALREADY_IN_FAMILY') return '这个账号已经在一个家里。';
    if (error.code === 'INVITE_NOT_FOUND' || error.code === 'INVITE_EXPIRED' || error.code === 'INVITE_REVOKED') {
      return '这个邀请现在不能用。';
    }
    if (error.code === 'INVITE_ALREADY_USED') return '这个邀请已经被用过了。';
    if (error.code === 'FORBIDDEN') return '这件事只有创建者能做。';
  }
  if (error instanceof Error && error.message === 'revoke-retry') {
    return '撤回还没完成，可以再试。';
  }
  if (error instanceof Error && error.message === 'test-invite-missing') {
    return '还没有记下邀请码。创建者先邀请，再让加入的人按用测试邀请码加入。';
  }
  if (error instanceof Error && error.message === 'test-refresh-failed') {
    return '刷新没有做成，还没有动收下或撤回。';
  }
  return '家庭这件事没有做成。个人记录还在这台设备上。';
}

function roleLabel(role: 'creator' | 'member') {
  return role === 'creator' ? '创建者' : '成员';
}

function needsAppleSignIn(membership: FamilyMembershipView | null) {
  return (
    membership?.kind === 'unauthenticated' ||
    (membership?.kind === 'unconfirmed' && membership.reason === 'unauthenticated')
  );
}

function refreshMessage(result: 'ok' | 'invites-failed' | 'revoke-unconfirmed') {
  if (result === 'invites-failed') return '邀请列表暂时读不出来，家里的成员已经确认。';
  if (result === 'revoke-unconfirmed') {
    return '这台设备已经退出。远端会话还没确认撤销，连上之后会再试。';
  }
  return null;
}

export default function FamilyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ td?: string | string[]; n?: string | string[] }>();
  const { width } = useWindowDimensions();
  const readingWidth = Math.min(width, 720);
  const configured = isFamilyApiConfigured();
  const testDriver = isFamilyTestDriverEnabled();
  const [appleAvailable, setAppleAvailable] = useState<boolean | null>(null);
  const [membership, setMembership] = useState<FamilyMembershipView | null>(null);
  const [invites, setInvites] = useState<InvitationView[]>([]);
  const [inviteCode, setInviteCode] = useState('');
  const [inbox, setInbox] = useState<FamilyInboxView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [testDiag, setTestDiag] = useState<string | null>(null);
  const [cacheStatus, setCacheStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refreshGate = useRef(createFamilyRefreshGate()).current;

  function hideFamilyContent() {
    setMembership(null);
    setInvites([]);
    setInbox(null);
  }

  const refresh = useCallback(async (
    mode: 'revalidate' | 'follow-up' = 'follow-up',
  ): Promise<'ok' | 'invites-failed' | 'stale' | 'revoke-unconfirmed'> => {
    const generation = refreshGate.begin();
    if (mode === 'revalidate') {
      hideFamilyContent();
    }
    if (!configured) {
      return 'ok';
    }
    try {
      const apple = createExpoAppleIdentityTokenSource();
      const available = await apple.isAvailable();
      const family = await getFamilyUseCases();
      const next = await family.getMembership();
      if (!refreshGate.isCurrent(generation)) return 'stale';
      setAppleAvailable(available);
      setMembership(next);
      let invitesFailed = false;
      if (next.kind === 'ready' && next.role === 'creator') {
        try {
          const listed = await family.listPendingInvitations(next.familyId);
          if (!refreshGate.isCurrent(generation)) return 'stale';
          setInvites(listed);
          if (testDriver && listed[0]?.code) {
            storeFamilyTestInviteCode(listed[0].code);
          }
        } catch {
          if (!refreshGate.isCurrent(generation)) return 'stale';
          setInvites([]);
          invitesFailed = true;
        }
      } else {
        setInvites([]);
      }
      if (next.kind === 'ready') {
        try {
          const nextInbox = await family.refreshFamilyInbox();
          if (!refreshGate.isCurrent(generation)) return 'stale';
          setInbox(nextInbox.kind === 'ready' ? nextInbox : { kind: 'hidden', reason: nextInbox.reason });
        } catch {
          if (!refreshGate.isCurrent(generation)) return 'stale';
          setInbox({ kind: 'hidden', reason: 'unreachable' });
        }
      } else {
        setInbox(null);
      }
      if (testDriver) {
        if (mode === 'revalidate') {
          await family.recoverFamilyCache();
        }
        const inspect = await family.inspectFamilyReceiveCache();
        if (!refreshGate.isCurrent(generation)) return 'stale';
        setCacheStatus(formatFamilyTestCacheCleanup({
          hidden: next.kind !== 'ready',
          diskCleared: next.kind === 'ready'
            ? inspect.pendingCount === 0
            : inspect.pendingCount === 0 && inspect.fileCount === 0,
          pendingCount: inspect.pendingCount,
          fileCount: inspect.fileCount,
        }));
      }
      if (needsAppleSignIn(next) && (await family.hasUnconfirmedSessionRevoke())) {
        if (!refreshGate.isCurrent(generation)) return 'stale';
        return 'revoke-unconfirmed';
      }
      return invitesFailed ? 'invites-failed' : 'ok';
    } catch (error) {
      if (!refreshGate.isCurrent(generation)) return 'stale';
      hideFamilyContent();
      throw error;
    }
  }, [configured, refreshGate, testDriver]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      hideFamilyContent();
      refresh('revalidate')
        .then((result) => {
          if (cancelled || result === 'stale') return;
          setMessage(refreshMessage(result));
        })
        .catch((error) => {
          if (!cancelled) {
            setMembership(null);
            setInvites([]);
            setMessage(errorText(error));
          }
        });
      return () => {
        cancelled = true;
      };
    }, [refresh]),
  );

  async function reportLeaveCleanup(
    family: FamilyUseCases,
    result: { cleanup?: { diskCleared?: boolean } },
  ) {
    const inspect = await family.inspectFamilyReceiveCache();
    setCacheStatus(formatFamilyTestCacheCleanup({
      hidden: true,
      diskCleared: result.cleanup?.diskCleared === true,
      pendingCount: inspect.pendingCount,
      fileCount: inspect.fileCount,
    }));
  }

  async function reportRecoverCleanup(
    family: FamilyUseCases,
    cleanup: { diskCleared: boolean },
    visible: boolean,
  ) {
    const inspect = await family.inspectFamilyReceiveCache();
    setCacheStatus(formatFamilyTestCacheCleanup({
      hidden: !visible,
      diskCleared: cleanup.diskCleared,
      pendingCount: inspect.pendingCount,
      fileCount: inspect.fileCount,
    }));
  }

  async function run(work: (family: FamilyUseCases) => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      const family = await getFamilyUseCases();
      await work(family);
      const result = await refresh('follow-up');
      if (result === 'stale') return;
      setMessage(refreshMessage(result));
    } catch (error) {
      if (testDriver && isApplicationError(error)) {
        recordFamilyTestLastRequest({
          action: familyTestLastRequest()?.action || 'unknown',
          errorCode: error.code,
        });
      }
      setMessage(errorText(error));
    } finally {
      if (testDriver) setTestDiag(formatFamilyTestLastRequest());
      setBusy(false);
    }
  }

  async function signOutNow() {
    if (busy) return;
    hideFamilyContent();
    setBusy(true);
    try {
      const family = await getFamilyUseCases();
      const signed = await family.signOut();
      const result = await refresh('follow-up');
      if (result === 'stale') return;
      if (signed.local === 'still-signed-in') {
        setMessage('这次退出没做成。这台设备还登着，远端会话也还没确认撤销。');
        return;
      }
      setMessage(
        signed.server === 'unconfirmed' || result === 'revoke-unconfirmed'
          ? '这台设备已经退出。远端会话还没确认撤销，连上之后会再试。'
          : '已经退出登录。',
      );
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  function runTestDriverAction(action: string) {
    if (!testDriver) return;
    if (action === 'alice') {
      void run(async (family) => {
        await family.signInWithApple(familyTestIdentityToken('alice'));
      });
      return;
    }
    if (action === 'bob') {
      void run(async (family) => {
        await family.signInWithApple(familyTestIdentityToken('bob'));
      });
      return;
    }
    if (action === 'create') {
      void run(async (family) => {
        await family.createFamily();
      });
      return;
    }
    if (action === 'invite') {
      void run(async (family) => {
        const next = await family.getMembership();
        if (next.kind !== 'ready' || next.role !== 'creator') {
          throw new Error('test-invite-missing');
        }
        const invited = await family.inviteMember(next.familyId);
        if (invited.code) storeFamilyTestInviteCode(invited.code);
      });
      return;
    }
    if (action === 'accept') {
      void run(async (family) => {
        const source = familyTestInviteSource();
        const code = familyTestInviteCode();
        const before = await family.getMembership();
        recordFamilyTestLastRequest({
          action: 'accept',
          sent: false,
          inviteSource: source,
          membershipBefore: before.kind,
        });
        if (!code) {
          throw new Error('test-invite-missing');
        }
        await family.acceptInvitation(code);
      });
      return;
    }
    if (action === 'signout') {
      void signOutNow();
      return;
    }
    if (action === 'fail-next' || action === 'fail-revoke') {
      armFamilyTestNextRequestFailure('revoke');
      setMessage('下一笔撤回请求会失败。刷新不会用掉这次失败。');
      return;
    }
    if (action === 'fail-receive') {
      armFamilyTestNextRequestFailure('receive');
      setMessage('下一笔收下请求会失败。刷新不会用掉这次失败。');
      return;
    }
    if (action === 'fail-receive-media') {
      armFamilyTestNextRequestFailure('receive-media');
      setMessage('下一笔收下媒体会失败。刷新不会用掉这次失败。');
      return;
    }
    if (action === 'fail-refresh') {
      armFamilyTestNextRequestFailure('refresh');
      setMessage('下一笔刷新会失败。收下和撤回还没动。');
      return;
    }
    if (action === 'fail-cache-isolate') {
      armFamilyTestCacheDeleteFailure('isolate');
      setMessage('下一次离开清理的家庭缓存删除会失败。个人媒体不会动。');
      return;
    }
    if (action === 'fail-cache-recover') {
      armFamilyTestCacheDeleteFailure('recover');
      setMessage('下一次恢复清理的家庭缓存删除会失败。个人媒体不会动。');
      return;
    }
    if (action === 'refresh') {
      void (async () => {
        if (busy) return;
        setBusy(true);
        try {
          const result = await refresh('revalidate');
          if (result === 'stale') return;
          setMessage(refreshMessage(result));
        } catch (error) {
          setMessage(errorText(error));
        } finally {
          setBusy(false);
        }
      })();
      return;
    }
    if (action === 'recover') {
      void run(async (family) => {
        const cleanup = await family.recoverFamilyCache();
        const next = await family.getMembership();
        await reportRecoverCleanup(family, cleanup, next.kind === 'ready');
      });
      return;
    }
    if (action === 'leave') {
      void run(async (family) => {
        await reportLeaveCleanup(family, await family.leaveFamily());
      });
      return;
    }
    if (action === 'revoke') {
      void run(async (family) => {
        const nextInbox = await family.refreshFamilyInbox();
        if (nextInbox.kind !== 'ready') {
          throw new Error('test-refresh-failed');
        }
        const item = nextInbox.items.find((row) => row.canRevoke);
        if (!item) throw new Error('revoke-retry');
        const next = await family.revokeShare(item.shareId);
        if (next.status === 'failed') throw new Error('revoke-retry');
      });
      return;
    }
    if (action === 'receive') {
      void run(async (family) => {
        const nextInbox = await family.refreshFamilyInbox();
        if (nextInbox.kind !== 'ready') {
          throw new Error('test-refresh-failed');
        }
        const item = nextInbox.items.find((row) => row.receiveStatus !== 'received') ?? nextInbox.items[0];
        if (!item) throw new Error('test-invite-missing');
        await family.receiveShare(item.shareId);
      });
    }
  }

  const testAction = Array.isArray(params.td) ? params.td[0] : params.td;
  const testNonce = Array.isArray(params.n) ? params.n[0] : params.n;
  const ranTestAction = useRef('');
  useEffect(() => {
    if (!testDriver || !testAction || membership === null) return;
    const key = `${testAction}:${testNonce || ''}`;
    if (ranTestAction.current === key) return;
    ranTestAction.current = key;
    const timer = setTimeout(() => {
      runTestDriverAction(testAction);
    }, 200);
    return () => {
      clearTimeout(timer);
    };
  }, [testAction, testDriver, membership]);

  return (
    <SafeAreaView style={styles.safe} accessibilityLabel="家庭">
      <ScrollView contentContainerStyle={[styles.column, { maxWidth: readingWidth }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          testID="family-back"
          onPress={() => router.back()}
          style={styles.backHit}
        >
          <Text style={styles.back}>返回</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          家庭
        </Text>

        {!configured ? (
          <Text style={styles.body}>还没有接到能用的家庭服务。个人记录还在这台设备上。</Text>
        ) : null}

        {configured && appleAvailable === false && !testDriver ? (
          <Text style={styles.body}>这台设备现在不能用 Apple 登录。个人记录还在这台设备上。</Text>
        ) : null}

        {configured && testDriver ? (
          <>
            <Text style={styles.body}>
              仅测试环境。这些是本机测试账号，不是真实 Apple，也不是公网家庭服务。
            </Text>
            <Text style={styles.body} testID="family-test-account-state">
              当前账号 {membership?.kind || '未知'}
              {membership?.kind === 'ready' ? ` ${membership.role}` : ''}
            </Text>
            <Text style={styles.body} testID="family-test-invite-source">
              {familyTestInviteSource() === 'stored'
                ? '本轮已记下邀请'
                : familyTestInviteSource() === 'env'
                  ? '环境里有旧邀请码，不会用来加入'
                  : '还没有本轮邀请'}
            </Text>
            {testDiag ? (
              <Text style={styles.body} testID="family-test-last-error">
                {testDiag}
              </Text>
            ) : null}
            {message ? (
              <Text style={styles.message} testID="family-test-message">
                {message}
              </Text>
            ) : null}
            {inbox?.kind === 'ready' ? (
              <Text style={styles.body} testID="family-test-inbox-status">
                {inbox.items.length === 0
                  ? '核权后可见列表没有分享'
                  : inbox.items
                    .map((item) => `核权后 ${item.receiveStatus}${item.canRevoke ? ' 可撤回' : ''}`)
                    .join(' · ')}
              </Text>
            ) : null}
            {cacheStatus ? (
              <Text style={styles.body} testID="family-test-cache-status">
                {cacheStatus}
              </Text>
            ) : null}
            <View style={styles.testRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="测试登录 alice"
                testID="family-test-sign-in-alice"
                disabled={busy}
                onPress={() =>
                  run(async (family) => {
                    await family.signInWithApple(familyTestIdentityToken('alice'));
                  })
                }
                style={styles.testHit}
              >
                <Text style={styles.action}>测试登录 alice</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="测试登录 bob"
                testID="family-test-sign-in-bob"
                disabled={busy}
                onPress={() =>
                  run(async (family) => {
                    await family.signInWithApple(familyTestIdentityToken('bob'));
                  })
                }
                style={styles.testHit}
              >
                <Text style={styles.action}>测试登录 bob</Text>
              </Pressable>
            </View>
            <View style={styles.testRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="让下一笔家庭请求失败"
                testID="family-test-fail-next"
                disabled={busy}
                onPress={() => {
                  armFamilyTestNextRequestFailure('revoke');
                  setMessage('下一笔撤回请求会失败。刷新不会用掉这次失败。');
                }}
                style={styles.testHit}
              >
                <Text style={styles.action}>让下一笔家庭请求失败</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="用测试邀请码加入"
                testID="family-test-accept-invite"
                disabled={busy}
                onPress={() =>
                  run(async (family) => {
                    const source = familyTestInviteSource();
                    const code = familyTestInviteCode();
                    recordFamilyTestLastRequest({
                      action: 'accept',
                      sent: false,
                      inviteSource: source,
                      membershipBefore: membership?.kind || 'unknown',
                    });
                    if (!code) {
                      throw new Error('test-invite-missing');
                    }
                    await family.acceptInvitation(code);
                  })
                }
                style={styles.testHit}
              >
                <Text style={styles.action}>用测试邀请码加入</Text>
              </Pressable>
            </View>
            <View style={styles.testRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="建立测试家庭"
                testID="family-test-create"
                disabled={busy}
                onPress={() => run(async (family) => { await family.createFamily(); })}
                style={styles.testHit}
              >
                <Text style={styles.action}>建立测试家庭</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="发出测试邀请"
                testID="family-test-invite"
                disabled={busy}
                onPress={() =>
                  run(async (family) => {
                    const next = await family.getMembership();
                    if (next.kind !== 'ready' || next.role !== 'creator') {
                      throw new Error('test-invite-missing');
                    }
                    const invited = await family.inviteMember(next.familyId);
                    if (invited.code) storeFamilyTestInviteCode(invited.code);
                  })
                }
                style={styles.testHit}
              >
                <Text style={styles.action}>发出测试邀请</Text>
              </Pressable>
            </View>
            <View style={styles.testRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="让离开缓存删除失败"
                testID="family-test-fail-cache-isolate"
                disabled={busy}
                onPress={() => {
                  armFamilyTestCacheDeleteFailure('isolate');
                  setMessage('下一次离开清理的家庭缓存删除会失败。个人媒体不会动。');
                }}
                style={styles.testHit}
              >
                <Text style={styles.action}>让离开缓存删除失败</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="恢复家庭缓存清理"
                testID="family-test-recover-cache"
                disabled={busy}
                onPress={() =>
                  run(async (family) => {
                    const cleanup = await family.recoverFamilyCache();
                    const next = await family.getMembership();
                    await reportRecoverCleanup(family, cleanup, next.kind === 'ready');
                  })
                }
                style={styles.testHit}
              >
                <Text style={styles.action}>恢复家庭缓存清理</Text>
              </Pressable>
            </View>
            <View style={styles.testRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="离开测试家庭"
                testID="family-test-leave"
                disabled={busy}
                onPress={() =>
                  run(async (family) => {
                    await reportLeaveCleanup(family, await family.leaveFamily());
                  })
                }
                style={styles.testHit}
              >
                <Text style={styles.action}>离开测试家庭</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {configured && membership?.kind === 'unconfirmed' && membership.reason === 'unreachable' ? (
          <Text style={styles.body}>现在连不上家庭服务，不能确认家里有谁。</Text>
        ) : null}

        {configured && needsAppleSignIn(membership) && appleAvailable ? (
          <>
            <Text style={styles.body}>
              {membership?.kind === 'unconfirmed'
                ? '这次登录已经失效，需要重新用 Apple 登录。登录成功还不等于已经在一个家里。'
                : '登录之后才能建立或加入家庭。登录成功还不等于已经在一个家里。'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="用 Apple 登录"
              testID="family-apple-sign-in"
              disabled={busy}
              onPress={() =>
                run(async (family) => {
                  const token = await createExpoAppleIdentityTokenSource().requestIdentityToken();
                  await family.signInWithApple(token);
                })
              }
              style={styles.hit}
            >
              <Text style={styles.action}>用 Apple 登录</Text>
            </Pressable>
          </>
        ) : null}

        {configured && membership?.kind === 'none' ? (
          <>
            <Text style={styles.body}>现在还没有家庭。可以建立一个，或输入邀请加入。</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="建立家庭"
              testID="family-create"
              disabled={busy}
              onPress={() => run(async (family) => { await family.createFamily(); })}
              style={styles.hit}
            >
              <Text style={styles.action}>建立家庭</Text>
            </Pressable>
            <TextInput
              accessibilityLabel="邀请"
              testID="family-invite-code"
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder="邀请"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="接受邀请"
              testID="family-accept"
              disabled={busy || !inviteCode.trim()}
              onPress={() =>
                run(async (family) => {
                  await family.acceptInvitation(inviteCode.trim());
                  setInviteCode('');
                })
              }
              style={styles.hit}
            >
              <Text style={styles.action}>接受邀请</Text>
            </Pressable>
          </>
        ) : null}

        {membership?.kind === 'ready' ? (
          <>
            <Text style={styles.body}>家里现在有这些人。</Text>
            {membership.members.map((member) => (
              <View key={member.userId} style={styles.member}>
                <Text style={styles.memberName}>{member.userId}</Text>
                <Text style={styles.meta}>{roleLabel(member.role)}</Text>
                {membership.role === 'creator' && member.role !== 'creator' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`移出 ${member.userId}`}
                    testID={`family-remove-${member.userId}`}
                    disabled={busy}
                    onPress={() =>
                      run(async (family) => {
                        await family.removeMember(membership.familyId, member.userId);
                      })
                    }
                    style={styles.hit}
                  >
                    <Text style={styles.action}>移出</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}

            {inbox?.kind === 'ready'
              ? inbox.items.map((item) => (
                  <View key={item.shareId} style={styles.member}>
                    <Text style={styles.memberName}>
                      {item.receiveStatus === 'received' && item.note
                        ? `文字：${item.note}`
                        : '家里有这条分享'}
                    </Text>
                    {item.receiveStatus !== 'received' ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="收下这条分享"
                        testID={`family-receive-share-${item.shareId}`}
                        disabled={busy}
                        onPress={() =>
                          run(async (family) => {
                            await family.receiveShare(item.shareId);
                          })
                        }
                        style={styles.hit}
                      >
                        <Text style={styles.action}>收下这条分享</Text>
                      </Pressable>
                    ) : null}
                    {item.canRevoke ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="撤回这条分享"
                        testID={`family-revoke-share-${item.shareId}`}
                        disabled={busy}
                        onPress={() =>
                          run(async (family) => {
                            const revoked = await family.revokeShare(item.shareId);
                            if (revoked.status === 'failed') {
                              throw new Error('revoke-retry');
                            }
                          })
                        }
                        style={styles.hit}
                      >
                        <Text style={styles.action}>撤回这条分享</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))
              : null}

            {membership.role === 'creator' ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="邀请"
                  testID="family-invite"
                  disabled={busy}
                  onPress={() =>
                    run(async (family) => {
                      const invited = await family.inviteMember(membership.familyId);
                      if (testDriver && invited.code) {
                        storeFamilyTestInviteCode(invited.code);
                      }
                    })
                  }
                  style={styles.hit}
                >
                  <Text style={styles.action}>邀请</Text>
                </Pressable>
                {invites.map((invite) => (
                  <View key={invite.invitationId} style={styles.member}>
                    <Text style={styles.memberName}>{invite.code}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`撤销邀请 ${invite.code}`}
                      testID={`family-revoke-${invite.invitationId}`}
                      disabled={busy}
                      onPress={() =>
                        run(async (family) => {
                          await family.revokeInvitation(invite.invitationId);
                        })
                      }
                      style={styles.hit}
                    >
                      <Text style={styles.action}>撤销邀请</Text>
                    </Pressable>
                  </View>
                ))}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="解散这个家"
                  testID="family-dissolve"
                  disabled={busy}
                  onPress={() =>
                    run(async (family) => {
                      await family.dissolveFamily(membership.familyId);
                    })
                  }
                  style={styles.hit}
                >
                  <Text style={styles.action}>解散这个家</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="离开这个家"
                testID="family-leave"
                disabled={busy}
                onPress={() =>
                  run(async (family) => {
                    const result = await family.leaveFamily();
                    if (testDriver) await reportLeaveCleanup(family, result);
                  })
                }
                style={styles.hit}
              >
                <Text style={styles.action}>离开这个家</Text>
              </Pressable>
            )}
          </>
        ) : null}

        {configured && membership && !needsAppleSignIn(membership) ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="退出登录"
            testID="family-sign-out"
            disabled={busy}
            onPress={() => {
              void signOutNow();
            }}
            style={styles.hit}
          >
            <Text style={styles.action}>退出登录</Text>
          </Pressable>
        ) : null}

        {message ? <Text style={styles.message}>{message}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F0E9' },
  column: {
    flexGrow: 1,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 16,
  },
  backHit: { minHeight: 44, justifyContent: 'center' },
  back: { fontSize: 16, lineHeight: 22, color: '#53604F' },
  title: { fontSize: 28, lineHeight: 34, color: '#25231F' },
  body: { fontSize: 16, lineHeight: 24, color: '#5C5851' },
  hit: { minHeight: 44, justifyContent: 'center' },
  testRow: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  testHit: { flex: 1, minHeight: 44, justifyContent: 'center' },
  action: { fontSize: 18, lineHeight: 24, color: '#53604F' },
  input: {
    minHeight: 44,
    fontSize: 18,
    lineHeight: 24,
    color: '#25231F',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C8C2B6',
  },
  member: { gap: 4 },
  memberName: { fontSize: 18, lineHeight: 24, color: '#25231F' },
  meta: { fontSize: 14, lineHeight: 20, color: '#53604F' },
  message: { fontSize: 16, lineHeight: 24, color: '#87513D' },
});
