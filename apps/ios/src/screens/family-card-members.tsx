import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getFamilyUseCases } from '../application/container';
import type { FamilyRoster } from '../family-api/types';
import { pauseForegroundAudio } from '../application/foreground-audio';
import { dateLabel, tr } from '../i18n';
import { Text, type } from './life-text';
import { hairline, inkSoft, sage } from './life-page';
import { useFamilyPrivateRequest } from './use-family-private-request';
import { familyHistoryError } from './family-history-copy';
type Roster = FamilyRoster & { userId: string };
export function FamilyCardMembers({ familyId, onChanged }: { familyId: string; onChanged: () => void }) {
  const { allowed, begin, enter, leave } = useFamilyPrivateRequest();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [roster, setRoster] = useState<Roster | null>(null), [message, setMessage] = useState<string | null>(null);
  const currentRef = useRef<() => boolean>(() => false), owner = useRef<(() => boolean) | null>(null);
  useFocusEffect(useCallback(() => {
    enter();
    if (!allowed) { setOpen(false); setRoster(null); setMessage(null); }
    return () => { leave(); currentRef.current = () => false; owner.current = null; setBusy(false); setOpen(false); setRoster(null); setMessage(null); };
  }, [allowed, enter, leave]));
  async function load() {
    if (!allowed || owner.current) return;
    pauseForegroundAudio(); setOpen(true); setRoster(null); setMessage(null);
    const current = begin(); currentRef.current = current; owner.current = current; setBusy(true);
    try {
      const family = await getFamilyUseCases(); if (!current()) return;
      const result = await family.history.getMembers(familyId, current); if (current()) setRoster(result);
    } catch (error) {
      if (current()) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'NOT_IN_FAMILY') { setOpen(false); onChanged(); }
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
      if (current()) { setRoster(null); setOpen(false); onChanged(); }
    } catch (error) {
      if (current()) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
        setMessage(tr(code === 'CONFLICT' ? '成员状态已变化，请重新查看。' : '操作尚未确认，请重新查看后再试。')); setRoster(null);
      }
    } finally { if (owner.current === current) { owner.current = null; setBusy(false); } }
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
      testID={`family-members-${familyId}`} onPress={() => { if (open) { begin(); currentRef.current = () => false; setOpen(false); setRoster(null); setMessage(null); } else void load(); }}><Text style={styles.action}>{tr('家庭成员')}</Text></Pressable>
    {open ? <View style={styles.panel}>
      {busy ? <Text style={styles.meta}>{tr('正在读取家庭。')}</Text> : null}
      {roster ? <>
        <Text style={styles.meta}>{tr('成员暂未设置称呼，按加入顺序显示。')}</Text>
        {roster.members.map((member, index) => {
          const label = member.userId === roster.userId ? tr('你') : member.role === 'creator' ? tr('创建者') : tr('成员 {0}', [index + 1]);
          const parts = member.joinedAt.slice(0, 10).split('-').map(Number);
          const joined = parts.length === 3 && parts.every(Number.isFinite) ? dateLabel(parts[0], parts[1], parts[2]) : '';
          return <View key={member.membershipId} style={styles.row}>
            <View style={styles.description}><Text style={styles.action}>{label}</Text>{joined ? <Text style={styles.meta}>{tr('加入于 {0}', [joined])}</Text> : null}</View>
            {roster.role === 'creator' && member.role === 'member' && member.userId !== roster.userId ? <Pressable style={styles.hit} disabled={busy} accessibilityRole="button" accessibilityLabel={tr('移除 {0}', [label])} accessibilityState={{ disabled: busy }} testID={`family-remove-${member.membershipId}`} onPress={() => confirm(member, label)}><Text style={styles.meta}>{tr('移除')}</Text></Pressable> : null}
          </View>;
        })}
        {roster.role === 'member' ? <Pressable style={styles.hit} disabled={busy} accessibilityRole="button" accessibilityState={{ disabled: busy }} testID="family-leave" onPress={() => confirm(null, '')}><Text style={styles.meta}>{tr('离开家庭')}</Text></Pressable> : <Text style={styles.meta}>{tr('创建者暂不能离开，转交和解散将在后续提供。')}</Text>}
      </> : null}
      {message ? <><Text style={styles.meta}>{message}</Text><Pressable style={styles.hit} disabled={busy} accessibilityRole="button" onPress={() => void load()}><Text style={styles.action}>{tr('再试一次')}</Text></Pressable></> : null}
    </View> : null}
  </View>;
}
const styles = StyleSheet.create({ hit: { minHeight: 48, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center' }, panel: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: hairline, paddingTop: 8 }, row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, description: { flexGrow: 1, flexShrink: 1 }, action: { ...type.action, color: sage }, meta: { ...type.meta, color: inkSoft } });
