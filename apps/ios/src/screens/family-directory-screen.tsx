import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getFamilyUseCases } from '../application/container';
import { createFamilyDirectory } from '../application/family-directory';
import { isFamilyProductEntryOpen } from '../infrastructure/family-config';
import { tr } from '../i18n';
import { useDeviceLock } from './device-lock-context';
import { SettingsPage } from './settings-chrome';
import { Text, TextInput } from './life-text';
import { hairline, ink, sage } from './life-page';

export default function FamilyDirectoryScreen() {
  const router = useRouter();
  const lock = useDeviceLock();
  const allowed = isFamilyProductEntryOpen() && !lock?.snapshot.locked;
  const [directory] = useState(createFamilyDirectory);
  const [state, setState] = useState(directory.snapshot);
  const [retrying, setRetrying] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sequence = useRef(0);
  const submitOwner = useRef<number | null>(null);
  const operation = useRef<{ id: string; name: string } | null>(null);
  const accountId = useRef<string | null>(null);
  const refresh = useCallback(async () => {
    const request = sequence.current;
    const work = directory.load(async () => {
      const result = await (await getFamilyUseCases()).getFamilies();
      if (request !== sequence.current) throw new Error('stale');
      if (accountId.current && accountId.current !== result.userId) {
        operation.current = null;
        setRetrying(false);
        setName('');
      }
      accountId.current = result.userId;
      return result;
    });
    setState(directory.snapshot());
    await work;
    setState(directory.snapshot());
  }, [directory]);
  useFocusEffect(useCallback(() => {
    const request = ++sequence.current;
    if (allowed) void refresh();
    return () => {
      if (request === sequence.current) sequence.current++;
      submitOwner.current = null;
      directory.invalidate();
      setState(directory.snapshot());
      setBusy(false);
      setMessage(null);
    };
  }, [allowed, directory, refresh]));

  async function create() {
    if (!allowed || submitOwner.current !== null || !name.trim()) return;
    const request = sequence.current;
    submitOwner.current = request;
    setBusy(true);
    setMessage(null);
    // Retain this intent across uncertain failures; retries do not make a second family.
    operation.current ??= { id: `family-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: name.trim() };
    const intent = operation.current;
    setRetrying(true);
    try {
      const family = await getFamilyUseCases();
      if (request !== sequence.current) return;
      await family.createNamedFamily(intent.name, intent.id, () => request === sequence.current);
      if (request !== sequence.current) return;
      operation.current = null;
      setRetrying(false);
      setName('');
      await refresh();
    } catch (error) {
      if (request !== sequence.current) return;
      const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
      if (code !== 'NETWORK' && code !== 'SERVER_UNREACHABLE') { operation.current = null; setRetrying(false); }
      setMessage(tr(code === 'FAMILY_LIMIT_REACHED' ? '最多可以加入或创建10个家庭。' : code === 'NETWORK' || code === 'SERVER_UNREACHABLE' ? '创建还未确认。可以用同一个名称再试一次。' : '未能创建家庭。请检查名称后再试。'));
    } finally {
      if (submitOwner.current === request) {
        submitOwner.current = null;
        setBusy(false);
      }
    }
  }
  const chosen = state.status === 'ready' ? state.families.find(f => f.familyId === state.selectedId) : null;
  return <SettingsPage title={tr('家庭')} backLabel={tr('最近')} accessibilityLabel={tr('家庭')} onBack={() => router.dismissTo('/')}>
    {!isFamilyProductEntryOpen() ? <Text>{tr('敬请期待。')}</Text> : allowed ? <>
      <Text>{tr('和家人分享你愿意留下的片段。')}</Text>
      {state.status === 'loading' ? <Text>{tr('正在读取家庭。')}</Text> : null}
      {state.status === 'failed' ? <>
        <Text>{tr('暂时读不到家庭。请确认登录后再试。')}</Text>
        <Pressable style={styles.hit} onPress={() => router.push('/account')} accessibilityRole="button"><Text>{tr('本机与账户')}</Text></Pressable>
        <Pressable style={styles.hit} onPress={() => void refresh()} accessibilityRole="button"><Text>{tr('再试一次')}</Text></Pressable>
      </> : null}
      {state.status === 'ready' ? <>
        {state.families.length === 0 ? <Text>{tr('现在还没有家庭。')}</Text> : null}
        {state.families.map(f => <Pressable key={f.familyId} testID={`family-select-${f.familyId}`} style={styles.hit}
          disabled={busy} accessibilityRole="button" accessibilityState={{ selected: f.familyId === state.selectedId, disabled: busy }}
          onPress={() => { directory.select(f.familyId); setState(directory.snapshot()); }}>
          <Text style={styles.name}>{f.name || tr('未命名家庭')}</Text>
          <Text>{tr(f.role === 'creator' ? '创建者' : '成员')} · {tr('家庭成员：{0}人', [f.memberCount])}</Text>
        </Pressable>)}
        {chosen ? <Text testID="family-selected">{tr('当前家庭：{0}', [chosen.name || tr('未命名家庭')])}</Text> : null}
        <TextInput accessibilityLabel={tr('家庭名称')} placeholder={tr('家庭名称')} value={name} editable={!busy && !retrying}
          onChangeText={setName} maxLength={80} style={styles.input} />
        <Pressable style={styles.hit} accessibilityRole="button" disabled={busy || !name.trim() || (state.families.length >= 10 && !retrying)}
          onPress={() => void create()}><Text>{tr(busy ? '正在创建家庭。' : retrying ? '再试创建' : '创建家庭')}</Text></Pressable>
      </> : null}
      {message ? <Text>{message}</Text> : null}
    </> : null}
  </SettingsPage>;
}
const styles = StyleSheet.create({
  hit: { minHeight: 48, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: hairline },
  name: { fontSize: 20, color: sage },
  input: { minHeight: 48, color: ink, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: hairline },
});
