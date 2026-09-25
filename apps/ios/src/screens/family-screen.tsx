import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { getFamilyUseCases } from '../application/container';
import type { FamilyInboxView, FamilyMembershipView, FamilyUseCases } from '../application/family-use-cases';
import { isApplicationError } from '../application/errors';
import type { InvitationView } from '../family-api/types';
import { createExpoAppleIdentityTokenSource } from '../infrastructure/expo-apple-auth';
import { isFamilyApiConfigured } from '../infrastructure/family-config';
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
  const { width } = useWindowDimensions();
  const readingWidth = Math.min(width, 720);
  const configured = isFamilyApiConfigured();
  const [appleAvailable, setAppleAvailable] = useState<boolean | null>(null);
  const [membership, setMembership] = useState<FamilyMembershipView | null>(null);
  const [invites, setInvites] = useState<InvitationView[]>([]);
  const [inviteCode, setInviteCode] = useState('');
  const [inbox, setInbox] = useState<FamilyInboxView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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
      if (next.kind === 'ready' && next.role === 'creator') {
        try {
          const listed = await family.listPendingInvitations(next.familyId);
          if (!refreshGate.isCurrent(generation)) return 'stale';
          setInvites(listed);
        } catch {
          if (!refreshGate.isCurrent(generation)) return 'stale';
          setInvites([]);
          return 'invites-failed';
        }
      } else {
        setInvites([]);
      }
      if (next.kind === 'ready') {
        try {
          const nextInbox = await family.refreshFamilyInbox();
          if (!refreshGate.isCurrent(generation)) return 'stale';
          setInbox(nextInbox);
        } catch {
          if (!refreshGate.isCurrent(generation)) return 'stale';
          setInbox({ kind: 'hidden', reason: 'unreachable' });
        }
      } else {
        setInbox(null);
      }
      if (needsAppleSignIn(next) && (await family.hasUnconfirmedSessionRevoke())) {
        if (!refreshGate.isCurrent(generation)) return 'stale';
        return 'revoke-unconfirmed';
      }
      return 'ok';
    } catch (error) {
      if (!refreshGate.isCurrent(generation)) return 'stale';
      hideFamilyContent();
      throw error;
    }
  }, [configured, refreshGate]);

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
      setMessage(errorText(error));
    } finally {
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

        {configured && appleAvailable === false ? (
          <Text style={styles.body}>这台设备现在不能用 Apple 登录。个人记录还在这台设备上。</Text>
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
                      await family.inviteMember(membership.familyId);
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
                onPress={() => run(async (family) => { await family.leaveFamily(); })}
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
