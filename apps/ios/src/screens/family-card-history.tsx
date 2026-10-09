import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getFamilyUseCases } from '../application/container';
import { tr } from '../i18n';
import { Text, type } from './life-text';
import { inkSoft, paperDeep, sage } from './life-page';
import { useFamilyPrivateRequest } from './use-family-private-request';
import { familyHistoryError } from './family-history-copy';

export function FamilyCardHistory({ familyId }: { familyId: string }) {
  const router = useRouter();
  const { allowed, begin, enter, leave } = useFamilyPrivateRequest();
  const [policy, setPolicy] = useState<'legacy' | 'family-history-v2' | null>(null);
  const [creator, setCreator] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const owner = useRef<(() => boolean) | null>(null);
  const eligibility = useRef<() => boolean>(() => false);
  const load = useCallback(async () => {
    const current = begin(); eligibility.current = current;
    setPolicy(null); setMessage(null);
    try {
      const family = await getFamilyUseCases(); if (!current()) return;
      const result = await family.history.getPolicy(familyId, current); if (!current()) return;
      setPolicy(result.policy); setCreator(result.family.role === 'creator');
    } catch (error) { if (current()) setMessage(familyHistoryError(error)); }
  }, [begin, familyId]);
  useFocusEffect(useCallback(() => {
    enter(); if (allowed) void load();
    return () => { leave(); eligibility.current = () => false; owner.current = null; setBusy(false); setPolicy(null); setMessage(null); };
  }, [allowed, enter, leave, load]));
  async function enable(current: () => boolean) {
    if (!allowed || !current() || owner.current || policy !== 'legacy' || !creator) return;
    owner.current = current; setBusy(true); setMessage(null);
    try {
      const family = await getFamilyUseCases(); if (!current()) return;
      await family.history.confirmPolicy(familyId, current); if (current()) await load();
    } catch (error) { if (current()) setMessage(familyHistoryError(error)); }
    finally { if (owner.current === current) { owner.current = null; setBusy(false); } }
  }
  if (!allowed) return null;
  return <View>
    {policy === 'family-history-v2' ? <>
      <Text style={styles.meta}>{tr('家人可以一起回看')}</Text>
      <Pressable style={styles.hit} accessibilityRole="button" testID={`family-records-${familyId}`}
        onPress={() => router.push({ pathname: '/family-records', params: { familyId } })}><Text style={styles.action}>{tr('家庭记录')}</Text></Pressable>
    </> : policy === 'legacy' ? creator ? <Pressable style={styles.hit} accessibilityRole="button" disabled={busy}
      accessibilityState={{disabled:busy}} testID={`family-history-enable-${familyId}`} onPress={() => {
        const current = eligibility.current; if (!current()) return;
        Alert.alert(tr('开启家庭分享？'), tr('后来加入的家人也能阅读仍有效的分享。旧的未使用邀请会结束，需要重新邀请。'), [
          {text:tr('取消'),style:'cancel'}, {text:tr('确认开启'),onPress:() => void enable(current)},
        ]);
      }}><Text style={styles.action}>{tr(busy ? '正在开启。' : '开启家庭分享')}</Text></Pressable>
      : <Text style={styles.meta}>{tr('等创建者开启，一起留下家里的片段。')}</Text>
      : !message ? <Text style={styles.meta}>{tr('正在读取家庭。')}</Text> : null}
    {message ? <><Text style={styles.meta}>{message}</Text><Pressable style={styles.hit} accessibilityRole="button" disabled={busy} onPress={() => void load()}><Text style={styles.action}>{tr('再试一次')}</Text></Pressable></> : null}
  </View>;
}
const styles = StyleSheet.create({
  hit:{minHeight:48,justifyContent:'center',alignItems:'center',paddingHorizontal:8,borderRadius:24,backgroundColor:paperDeep,marginTop:8},
  action:{...type.action,color:sage},meta:{...type.meta,color:inkSoft,marginTop:8},
});
