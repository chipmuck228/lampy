import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getFamilyUseCases } from '../application/container';
import type { FamilyRoster, FamilyTransfer } from '../family-api/types';
import { pauseForegroundAudio } from '../application/foreground-audio';
import { tr } from '../i18n';
import { Text, type } from './life-text';
import { hairline, inkSoft, sage } from './life-page';
import { useFamilyPrivateRequest } from './use-family-private-request';
import { familyHistoryError } from './family-history-copy';
type Roster = FamilyRoster & { userId: string };
function memberLabel(roster: Roster, member: Roster['members'][number]) {
  if (member.userId === roster.userId) return tr('你');
  if (member.role === 'creator') return tr('创建者');
  return tr('成员 {0}', [roster.members.filter(m => m.role === 'member').findIndex(m => m.membershipId === member.membershipId) + 1]);
}
// Called only after the user confirms; this is an idempotency key, not a credential.
function newTransferRequestId() { return `transfer-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
export function FamilyCardMembers({ familyId, onChanged }: { familyId: string; onChanged: (message?: string) => void }) {
  const { allowed, begin, enter, leave } = useFamilyPrivateRequest();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [roster, setRoster] = useState<Roster | null>(null), [message, setMessage] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<FamilyTransfer | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const transferIntent = useRef<{ target: string; requestId: string } | null>(null);
  const currentRef = useRef<() => boolean>(() => false), owner = useRef<(() => boolean) | null>(null);
  useFocusEffect(useCallback(() => {
    enter();
    if (!allowed) { setOpen(false); setRoster(null); setSelectedMemberId(null); setTransfer(null); setMessage(null); }
    return () => { leave(); currentRef.current = () => false; owner.current = null; setBusy(false); setOpen(false); setRoster(null); setSelectedMemberId(null); setTransfer(null); setMessage(null); };
  }, [allowed, enter, leave]));
  async function load() {
    if (!allowed || owner.current) return;
    pauseForegroundAudio(); setOpen(true); setRoster(null); setSelectedMemberId(null); setTransfer(null); setMessage(null);
    const current = begin(); currentRef.current = current; owner.current = current; setBusy(true);
    try {
      const family = await getFamilyUseCases(); if (!current()) return;
      const result = await family.history.getMembers(familyId, current); if (!current()) return;
      const pending = await family.history.getCreatorTransfer(result, current);
      if (current()) { setRoster(result); setTransfer(pending); }
    } catch (error) {
      if (current()) {
        if (error && typeof error === 'object' && 'code' in error && ['NOT_IN_FAMILY', 'FAMILY_DISSOLVED'].includes(String(error.code))) { setOpen(false); onChanged(); }
        else setMessage(familyHistoryError(error));
      }
    }
    finally { if (owner.current === current) { owner.current = null; setBusy(false); } }
  }
  async function change(expected: Roster, target: Roster['members'][number] | null, current: () => boolean) {
    if (!allowed || !current() || owner.current || expected !== roster) return;
    owner.current = current; setBusy(true); setMessage(null); pauseForegroundAudio();
    try {
      const family = await getFamilyUseCases(); if (!current()) return;
      if (target) await family.history.removeMember(expected, target.membershipId, current);
      else await family.history.leaveFamily(expected, current);
      if (current()) { setRoster(null); setSelectedMemberId(null); setOpen(false); onChanged(); }
    } catch (error) {
      if (current()) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
        setMessage(tr(code === 'CONFLICT' ? '成员状态已变化，请重新查看。' : '操作尚未确认，请重新查看后再试。')); setRoster(null); setSelectedMemberId(null);
      }
    } finally { if (owner.current === current) { owner.current = null; setBusy(false); } }
  }
  async function transferChange(expected: Roster, current: () => boolean, target?: string, action?: 'accept' | 'cancel', pending?: FamilyTransfer) {
    if (!allowed || !current() || owner.current || expected !== roster) return;
    owner.current = current; setBusy(true); setMessage(null); pauseForegroundAudio();
    try {
      const family = await getFamilyUseCases(); if (!current()) return;
      if (target) {
        if (transferIntent.current?.target !== target) transferIntent.current = { target, requestId: newTransferRequestId() };
        const result = await family.history.createCreatorTransfer(expected, target, transferIntent.current.requestId, current);
        if (current()) { setTransfer(result.status === 'pending' ? result : null); transferIntent.current = null; }
      } else if (pending && action) {
        await family.history.respondCreatorTransfer(expected, pending, action, current);
        if (current()) { setOpen(false); setRoster(null); setSelectedMemberId(null); setTransfer(null); onChanged(); }
      }
    } catch {
      if (current()) { setMessage(tr('操作尚未确认，请重新查看后再试。')); setRoster(null); setSelectedMemberId(null); setTransfer(null); }
    } finally { if (owner.current === current) { owner.current = null; setBusy(false); } }
  }
  async function dissolve(expected: Roster, current: () => boolean) {
    if (!allowed || !current() || owner.current || expected !== roster || expected.role !== 'creator') return;
    owner.current = current; setBusy(true); setMessage(null); pauseForegroundAudio();
    try {
      const family = await getFamilyUseCases(); if (!current()) return;
      await family.history.dissolveFamily(expected, current);
      if (current()) {
        setOpen(false); setRoster(null); setTransfer(null); setSelectedMemberId(null);
        onChanged(tr('这个家庭已解散，个人记录还在。'));
      }
    } catch {
      if (current()) { setMessage(tr('操作尚未确认，请重新查看后再试。')); setRoster(null); setTransfer(null); setSelectedMemberId(null); }
    } finally { if (owner.current === current) { owner.current = null; setBusy(false); } }
  }
  function confirmDissolve() {
    const expected = roster, current = currentRef.current;
    if (!expected || expected.role !== 'creator' || !current() || owner.current) return;
    Alert.alert(tr('解散这个家庭？'), tr('家人将不能再看这里的分享，邀请和待接受的移交也会结束。家庭分享副本将在30天后清理，个人记录和生活册不受影响。解散后无法恢复。'),
      [{ text: tr('取消'), style: 'cancel' }, { text: tr('确认解散'), style: 'destructive', onPress: () => void dissolve(expected, current) }]);
  }
  function confirmTransfer(target?: Roster['members'][number], action?: 'accept' | 'cancel') {
    const expected = roster, current = currentRef.current, pending = transfer;
    if (!expected || !current() || owner.current) return;
    if (target ? expected.role !== 'creator' || !!pending || target.role !== 'member' || target.userId === expected.userId
      : !pending || (action === 'accept' ? pending.toUserId !== expected.userId : pending.fromUserId !== expected.userId)) return;
    const title = target ? tr('向 {0} 转交创建者？', [memberLabel(expected, target)]) : action === 'accept' ? tr('接任家庭创建者？') : tr('撤销这次转交？');
    Alert.alert(title, tr('对方主动接受后才会转交。原创建者将成为成员，家庭记录保留；订阅和收费责任不会随此操作转移。'),
      [{ text: tr('取消'), style: 'cancel' }, { text: tr('确认'), onPress: () => void transferChange(expected, current, target?.membershipId, action, pending ?? undefined) }]);
  }
  function confirm(target: Roster['members'][number] | null, label: string) {
    const expected = roster, current = currentRef.current;
    if (!expected || !current() || owner.current) return;
    if (target ? expected.role !== 'creator' || target.userId === expected.userId || target.role === 'creator' : expected.role === 'creator') return;
    Alert.alert(target ? tr('移除 {0}？', [label]) : tr('离开这个家庭？'),
      tr('离开后将不能阅读这里的家庭记录。已经分享的片段会保留，个人记录不受影响。再次加入需要新的邀请。'),
      [{ text: tr('取消'), style: 'cancel' }, { text: tr(target ? '确认移除' : '确认离开'), style: 'destructive', onPress: () => void change(expected, target, current) }]);
  }
  if (!allowed) return null;
  return <View>
    <Pressable style={styles.hit} accessibilityRole="button" accessibilityState={{ expanded: open, disabled: busy }} disabled={busy}
      testID={`family-members-${familyId}`} onPress={() => { if (open) { begin(); currentRef.current = () => false; setOpen(false); setRoster(null); setSelectedMemberId(null); setTransfer(null); setMessage(null); } else void load(); }}><Text style={styles.action}>{tr('家庭成员')}</Text></Pressable>
    {open ? <View style={styles.panel}>
      {busy ? <Text style={styles.meta}>{tr('正在读取家庭。')}</Text> : null}
      {roster ? <>
        {roster.members.map(member => {
          const label = memberLabel(roster, member);
          const canManage = roster.role === 'creator' && member.role === 'member' && member.userId !== roster.userId;
          const selected = canManage && selectedMemberId === member.membershipId;
          return <View key={member.membershipId} style={styles.member}>
            {canManage ? <Pressable style={styles.memberHit} disabled={busy} accessibilityRole="button"
              accessibilityLabel={label} accessibilityState={{ expanded: selected, selected, disabled: busy }}
              testID={`family-member-${member.membershipId}`} onPress={() => setSelectedMemberId(selected ? null : member.membershipId)}>
              <Text style={styles.action}>{label}</Text>
            </Pressable> : <View style={styles.memberHit}><Text style={styles.meta}>{label}</Text></View>}
            {selected ? <View style={styles.memberActions} testID={`family-member-actions-${member.membershipId}`}>
              {!transfer ? <Pressable style={styles.memberActionHit} disabled={busy} accessibilityRole="button"
                accessibilityLabel={tr('向 {0} 转交创建者', [label])} accessibilityState={{ disabled: busy }}
                testID={`family-transfer-${member.membershipId}`} onPress={() => confirmTransfer(member)}>
                <Text style={styles.action}>{tr('移交')}</Text>
              </Pressable> : null}
              <Pressable style={styles.memberActionHit} disabled={busy} accessibilityRole="button"
                accessibilityLabel={tr('移除 {0}', [label])} accessibilityState={{ disabled: busy }}
                testID={`family-remove-${member.membershipId}`} onPress={() => confirm(member, label)}>
                <Text style={styles.meta}>{tr('移除')}</Text>
              </Pressable>
            </View> : null}
          </View>;
        })}
        {transfer ? <View style={styles.panel}>
          <Text style={styles.meta}>{tr(transfer.toUserId === roster.userId ? '邀请你接任家庭创建者。' : '正在等待对方确认转交。')}</Text>
          {transfer.toUserId === roster.userId ? <Pressable style={styles.hit} disabled={busy} accessibilityRole="button" accessibilityState={{ disabled: busy }} testID="family-transfer-accept" onPress={() => confirmTransfer(undefined, 'accept')}><Text style={styles.action}>{tr('接受转交')}</Text></Pressable> : null}
          {transfer.fromUserId === roster.userId ? <Pressable style={styles.hit} disabled={busy} accessibilityRole="button" accessibilityState={{ disabled: busy }} testID="family-transfer-cancel" onPress={() => confirmTransfer(undefined, 'cancel')}><Text style={styles.meta}>{tr('撤销转交')}</Text></Pressable> : null}
        </View> : null}
        {roster.role === 'creator' ? <Pressable style={styles.dissolveHit} disabled={busy} accessibilityRole="button"
          accessibilityState={{ disabled: busy }} testID="family-dissolve-selected" onPress={confirmDissolve}>
          <Text style={styles.meta}>{tr('解散家庭')}</Text>
        </Pressable> : null}
        {roster.role === 'member' ? <Pressable style={styles.hit} disabled={busy} accessibilityRole="button" accessibilityState={{ disabled: busy }} testID="family-leave" onPress={() => confirm(null, '')}><Text style={styles.meta}>{tr('离开家庭')}</Text></Pressable> : null}
      </> : null}
      {message ? <><Text style={styles.meta}>{message}</Text><Pressable style={styles.hit} disabled={busy} accessibilityRole="button" onPress={() => void load()}><Text style={styles.action}>{tr('再试一次')}</Text></Pressable></> : null}
    </View> : null}
  </View>;
}
const styles = StyleSheet.create({
  dissolveHit: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: hairline, marginTop: 16 },
  hit: { minHeight: 48, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center' },
  panel: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: hairline, paddingTop: 8 },
  member: { alignSelf: 'stretch', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: hairline },
  memberHit: { minHeight: 48, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'flex-start' },
  memberActions: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 8, paddingBottom: 8 },
  memberActionHit: { minHeight: 48, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  action: { ...type.action, color: sage },
  meta: { ...type.meta, color: inkSoft },
});
