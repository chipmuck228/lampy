import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getFamilyUseCases } from '../application/container';
import { createFamilyDirectory } from '../application/family-directory';
import { isFamilyProductEntryOpen } from '../infrastructure/family-config';
import { tr } from '../i18n';
import { useDeviceLock } from './device-lock-context';
import { SettingsPage } from './settings-chrome';
import { Text, TextInput, type } from './life-text';
import { hairline, ink, inkSoft, paperDeep, sage } from './life-page';
import { AlbumCoverFace } from './album-cover-tile';
import { LifeIcon } from './life-icons';
import { FamilyCardMembers } from './family-card-members';
import { FamilyCardHistory } from './family-card-history';
import { FamilyInvitePanel } from './family-invite-screen';

export default function FamilyDirectoryScreen() {
  const router = useRouter();
  const lock = useDeviceLock();
  const allowed = isFamilyProductEntryOpen() && !lock?.snapshot.locked;
  const [directory] = useState(createFamilyDirectory);
  const [state, setState] = useState(directory.snapshot);
  const [retrying, setRetrying] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sequence = useRef(0);
  const submitOwner = useRef<number | null>(null);
  const operation = useRef<{ id: string; name: string } | null>(null);
  const accountId = useRef<string | null>(null);
  const refresh = useCallback(async () => {
    const request = sequence.current;
    const work = directory.load(async () => {
      const result = await (await getFamilyUseCases()).getFamilies(() => request === sequence.current);
      if (request !== sequence.current) throw new Error('stale');
      if (accountId.current && accountId.current !== result.userId) {
        operation.current = null;
        setRetrying(false);
        setName('');
        setFormOpen(false);
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
    if (!allowed || state.status !== 'ready' || submitOwner.current !== null || !name.trim() || (state.families.length >= 10 && !retrying)) return;
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
      setFormOpen(false);
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
  const joined = useCallback((feedback?: string) => { if (feedback) setMessage(feedback); void refresh(); }, [refresh]);
  return <SettingsPage title={tr('家庭')} backLabel={tr('最近')} accessibilityLabel={tr('家庭')} onBack={() => router.dismissTo('/')}>
    {!isFamilyProductEntryOpen() ? <Text>{tr('敬请期待。')}</Text> : allowed ? <>
      {state.status !== 'signed-out' ? <Text style={styles.intro}>{tr('给重要的人，留一个位置。')}</Text> : null}
      {state.status === 'loading' ? <Text>{tr('正在读取家庭。')}</Text> : null}
      {state.status === 'signed-out' ? <View style={styles.welcome} testID="family-signed-out">
        <View style={styles.welcomeMark}><LifeIcon name="family" size={44} color={sage} /></View>
        <Text style={styles.welcomeTitle}>{tr('有些日子，想和家人一起留着。')}</Text>
        <Text style={styles.welcomeBody}>{tr('登录后，可以创建自己的家庭。')}</Text>
        <Pressable style={styles.createHit} testID="family-sign-in" accessibilityRole="button"
          onPress={() => router.push('/account-diagnostics')}><Text style={styles.action}>{tr('登录家庭')}</Text></Pressable>
        <Text style={styles.privacyHint}>{tr('自己的记录，仍在这台设备上。')}</Text>
      </View> : null}
      {state.status === 'failed' ? <View style={styles.connection} testID="family-connection-failed">
        <Text style={styles.name}>{tr('暂时连不上，稍后再看看。')}</Text>
        <Text style={styles.meta}>{tr('你的家庭没有因此消失。')}</Text>
        <Pressable style={styles.createHit} onPress={() => void refresh()} accessibilityRole="button"><Text style={styles.action}>{tr('再试一次')}</Text></Pressable>
      </View> : null}
<View style={styles.rootActions}>
        {state.status === 'ready' ? <Pressable style={[styles.createHit, styles.rootAction, (busy || (state.families.length >= 10 && !retrying)) && styles.disabled]}
          testID="family-open-create" accessibilityRole="button" accessibilityLabel={tr('创建家庭')}
          accessibilityState={{ disabled: busy || (state.families.length >= 10 && !retrying), expanded: formOpen }}
          disabled={busy || (state.families.length >= 10 && !retrying)} onPress={() => setFormOpen(true)}>
          <LifeIcon name="plus" color={sage} />
          <Text style={[styles.action,{flexShrink:1,textAlign:'center'}]}>{tr('创建家庭')}</Text>
        </Pressable> : null}

        <Pressable style={[styles.createHit,styles.rootAction,styles.joinHit]} testID="family-open-invite" accessibilityRole="button"
          disabled={inviteBusy} accessibilityState={{expanded:inviteOpen,disabled:inviteBusy}} onPress={() => { if (!inviteBusy) setInviteOpen(v => !v); }}>
          <Text style={styles.joinAction}>{tr('通过邀请加入')}</Text>
        </Pressable>
        </View>
        {inviteOpen ? <View style={styles.inlineJoin}><FamilyInvitePanel onBusyChange={setInviteBusy} returnTo="/family" onJoined={joined} onClose={() => setInviteOpen(false)} /></View> : null}

      {state.status === 'ready' ? <>
        <View style={styles.capacity} testID="family-capacity">
          <View style={styles.capacityRow}><Text style={styles.capacityTitle}>{tr('我的家庭')}</Text>
            <Text style={styles.capacityCount} testID="family-count" accessibilityLabel={tr('已加入 {0} / 10 个家庭', [state.families.length])}>{tr('{0} / 10', [state.families.length])}</Text></View>
          {state.families.length >= 10 ? <Text style={styles.limit} testID="family-limit-hint">{tr('你已在10个家庭中，暂时不能再创建或加入。')}</Text> : <Text style={styles.meta}>{tr('最多可创建或加入10个家庭。')}</Text>}
        </View>
        {formOpen || retrying ? <View style={styles.form} testID="family-create-form">
          <Text style={styles.name}>{tr('给这个家起个名字')}</Text>
          <TextInput accessibilityLabel={tr('家庭名称')} placeholder={tr('家庭名称')} value={name} editable={!busy && !retrying}
            onChangeText={setName} maxLength={80} style={styles.input} />
          <View style={styles.formActions}>
            <Pressable style={styles.createHit} testID="family-create-submit" accessibilityRole="button"
              disabled={busy || !name.trim() || (state.families.length >= 10 && !retrying)}
              onPress={() => void create()}><Text style={styles.action}>{tr(busy ? '正在创建家庭。' : retrying ? '再试创建' : '创建这一家')}</Text></Pressable>
            {!retrying && !busy ? <Pressable style={styles.hit} accessibilityRole="button" onPress={() => setFormOpen(false)}><Text style={styles.meta}>{tr('取消')}</Text></Pressable> : null}
          </View>
        </View> : null}
        {state.families.length === 0 ? <Text style={styles.empty}>{tr('现在还没有家庭。')}</Text> : null}
        <View style={styles.wall} testID="family-cover-wall">
          {state.families.map(f => <View key={f.familyId} testID={`family-tile-${f.familyId}`} style={styles.tile}><Pressable testID={`family-select-${f.familyId}`}
            style={styles.selection} disabled={busy} accessibilityRole="button"
            accessibilityLabel={`${f.name || tr('未命名家庭')}，${tr(f.role === 'creator' ? '创建者' : '成员')}，${tr('家庭成员：{0}人', [f.memberCount])}`}
            accessibilityState={{ selected: f.familyId === state.selectedId, disabled: busy }}
            onPress={() => { directory.select(f.familyId); setState(directory.snapshot()); }}>
            <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
              style={[styles.cover, f.familyId === state.selectedId && styles.selectedCover]}>
              <AlbumCoverFace name="" coverUri={null} width={70} height={88} />
              <View style={styles.coverMark}><LifeIcon name="family" size={36} color={sage} /></View>
            </View>
            <View style={styles.familySummary}><Text style={styles.familyName}>{f.name || tr('未命名家庭')}</Text>
            <Text style={styles.familyMeta}>{tr(f.role === 'creator' ? '创建者' : '成员')} · {tr('家庭成员：{0}人', [f.memberCount])}</Text></View>
          </Pressable>
          {f.familyId === state.selectedId ? <FamilyCardHistory key={f.familyId} familyId={f.familyId} /> : null}
          {f.role === 'creator' && f.familyId === state.selectedId ? <Pressable testID={`family-invite-${f.familyId}`} style={styles.cardInvite}
            disabled={busy} accessibilityRole="button" accessibilityLabel={tr('邀请家人加入 {0}', [f.name || tr('未命名家庭')])}
            onPress={() => router.push({pathname:'/family-invitations', params:{familyId:f.familyId}})}>
            <Text style={styles.action}>{tr('邀请家人')}</Text>
          </Pressable> : null}
          {f.familyId === state.selectedId ? <FamilyCardMembers key={`members-${f.familyId}`} familyId={f.familyId} onChanged={joined} /> : null}
          </View>)}
        </View>


      </> : null}
      {message ? <Text>{message}</Text> : null}
    </> : null}
  </SettingsPage>;
}
const styles = StyleSheet.create({
  rootActions: { flexDirection:'row', gap:12, alignItems:'stretch', marginBottom:16 },
  rootAction: { flex:1, alignSelf:'stretch', paddingHorizontal:8, marginBottom:0 },
  joinHit: { borderColor:inkSoft, backgroundColor:'transparent' },
  joinAction: { ...type.action, color:inkSoft, flexShrink:1, textAlign:'center' },
  inlineJoin: { paddingVertical:12, marginBottom:16 },
  familyName: { ...type.action, fontSize:16, lineHeight:24, color:ink },
  familyMeta: { ...type.meta, fontSize:13, lineHeight:20, color:inkSoft },
  joinSection: { gap: 12, paddingVertical: 24, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: hairline },
  selection: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  familySummary: { flex: 1, gap: 6 },
  cardInvite: { minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8, borderRadius: 24, backgroundColor: paperDeep, marginTop: 8 },
  intro: { ...type.body, color: inkSoft, marginTop: 16, marginBottom: 24 },
  welcome: { gap: 20, paddingTop: 40, paddingBottom: 32, alignItems: 'flex-start' },
  welcomeMark: { width: 80, height: 80, borderRadius: 24, backgroundColor: paperDeep, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  welcomeTitle: { ...type.title, fontSize: 26, lineHeight: 38, color: ink, maxWidth: 300 },
  welcomeBody: { ...type.body, color: inkSoft, maxWidth: 300 },
  privacyHint: { ...type.meta, color: inkSoft },
  connection: { gap: 12, paddingVertical: 28 },
  capacityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  capacityCount: { ...type.meta, color: inkSoft, backgroundColor: paperDeep, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  hit: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12 },
  capacity: { gap: 4, marginTop: 16, marginBottom: 12 },
  capacityTitle: { ...type.action, color: ink },
  meta: { ...type.meta, color: inkSoft },
  limit: { ...type.action, color: sage, marginTop: 8 },
  name: { ...type.action, fontSize: 18, lineHeight: 26, color: ink },
  action: { ...type.action, color: sage },
  createHit: { minHeight: 48, paddingHorizontal: 16, borderRadius: 24, backgroundColor: paperDeep,
    borderWidth: StyleSheet.hairlineWidth, borderColor: sage, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, alignSelf: 'flex-start', marginBottom: 12 },
  disabled: { opacity: 0.5 },
  form: { gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: hairline, marginBottom: 16 },
  formActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  input: { ...type.action, minHeight: 48, color: ink, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: hairline },
  empty: { ...type.body, color: inkSoft, marginVertical: 20 },
  wall: { flexDirection: 'column', gap: 20, marginTop: 12, marginBottom: 16 },
  tile: { alignSelf: 'stretch', minHeight: 48, gap: 6, paddingBottom: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: hairline },
  cover: { borderRadius: 10, borderWidth: 1, borderColor: 'transparent', overflow: 'hidden' },
  selectedCover: { borderColor: sage },
  coverMark: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },

});
