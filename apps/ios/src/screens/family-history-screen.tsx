import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { getFamilyUseCases } from '../application/container';
import { pauseForegroundAudio } from '../application/foreground-audio';
import type { HistoryReading } from '../application/family-history-use-cases';
import type { ShareView } from '../family-api/types';
import { Text, type } from './life-text';
import { SettingsPage } from './settings-chrome';
import { hairline, ink, inkSoft, sage } from './life-page';
import { LifeIcon } from './life-icons';
import { useFamilyPrivateRequest } from './use-family-private-request';
import { familyHistoryError, familySnapshotDate } from './family-history-copy';
import { useSoundPlayer } from './use-sound-player';
import { feelingLabel, tr } from '../i18n';

// Process-only progress, namespaced by account/family/share/object. Never a permission grant.
const progress = new Map<string, number>();
function mediaKey(read: HistoryReading, objectId: string) { return `${read.userId}/${read.share.familyId}/${read.share.shareId}/${objectId}`; }
function FamilyPhoto({ uri }: { uri: string }) {
  const [ratio, setRatio] = useState(4/3);
  return <Image source={{ uri }} style={{ width:'100%',aspectRatio:ratio }} contentFit="contain" cachePolicy="none"
    accessibilityLabel={tr('家庭照片')} accessible onLoad={e => {
      if (e.source.width > 0 && e.source.height > 0) setRatio(e.source.width / e.source.height);
    }} />;
}

export function FamilyHistoryScreen({ familyId, shareId }: { familyId: string; shareId?: string }) {
  const router = useRouter();
  const { allowed, enter, leave, begin } = useFamilyPrivateRequest();
  const [view, setView] = useState<HistoryReading | null>(null);
  const [rows, setRows] = useState<ShareView[]>([]);
  const [viewer, setViewer] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [policy, setPolicy] = useState<'legacy' | 'family-history-v2' | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const busyOwner = useRef<(() => boolean) | null>(null);
  const currentRef = useRef<() => boolean>(() => false);
  const sound = useSoundPlayer();
  const soundRef = useRef(sound);
  useLayoutEffect(() => { soundRef.current = sound; });
  const playingKey = useRef<string | null>(null);
  const [selectedAudio, setSelectedAudio] = useState<string | null>(null);
  const saveProgress = useCallback(() => {
    if (playingKey.current) progress.set(playingKey.current,soundRef.current.currentTimeMs);
    pauseForegroundAudio();
  }, []);
  const load = useCallback(async () => {
    const current = begin(); currentRef.current = current;
    saveProgress(); setView(null); setRows([]); setViewer(null); setPolicy(null); setMessage(null); setStatus('loading');
    try {
      const family = await getFamilyUseCases(); if (!current()) return;
      const p = await family.history.getPolicy(familyId,current); if (!current()) return;
      setName(p.family.name); setPolicy(p.policy);
      if (p.policy === 'family-history-v2') {
        if (shareId) {
          const result = await family.history.read(familyId,shareId,current); if (!current()) return;
          setView(result); setViewer(result.userId);
        } else {
          const result = await family.history.list(familyId,current); if (!current()) return;
          setRows(result.shares); setViewer(result.userId);
        }
      }
      if (current()) setStatus('ready');
    } catch (e) { if (current()) { setView(null); setRows([]); setStatus('failed'); setMessage(familyHistoryError(e)); } }
  }, [begin, familyId, shareId, saveProgress]);
  useFocusEffect(useCallback(() => {
    enter(); if (allowed) void load();
    return () => { saveProgress(); leave(); currentRef.current = () => false; busyRef.current = false; busyOwner.current = null; setBusy(false); setView(null); setRows([]); setViewer(null); setName(''); };
  }, [allowed, enter, leave, load, saveProgress]));
  useEffect(() => {
    if (playingKey.current && sound.status !== 'preparing') progress.set(playingKey.current,sound.currentTimeMs);
  }, [sound.status,sound.currentTimeMs]);
  async function play(read: HistoryReading, objectId: string, uri: string) {
    if (busyRef.current || !allowed) return;
    const current = currentRef.current; if (!current()) return;
    busyRef.current = true; busyOwner.current = current; setBusy(true);
    saveProgress();
    try {
      const family = await getFamilyUseCases(); if (!current()) return;
      const authorized = await family.history.authorize(familyId,read.share.shareId,current);
      if (!current() || authorized.userId !== read.userId) return;
      const key = mediaKey(read,objectId);
      playingKey.current = key; setSelectedAudio(objectId);
      await soundRef.current.play(uri,progress.get(key) || 0);
      if (!current()) pauseForegroundAudio();
    } catch (e) { if (current()) { setView(null); setRows([]); setStatus('failed'); setMessage(familyHistoryError(e)); } }
    finally { if (busyOwner.current === current) { busyOwner.current=null;busyRef.current=false;setBusy(false); } }
  }
  async function revoke(expected = view, expectedCurrent = currentRef.current) {
    if (!expected || expected !== view || viewer !== expected.share.authorUserId || busyRef.current || !allowed) return;
    const current=expectedCurrent; if (!current()) return;
    busyRef.current=true;busyOwner.current=current;setBusy(true);saveProgress();
    try {
      const family=await getFamilyUseCases();if(!current())return;
      await family.history.revoke(familyId,expected.share.shareId,current);
      if(current())router.back();
    } catch(e){if(current())setMessage(familyHistoryError(e));}
    finally{if(busyOwner.current===current){busyOwner.current=null;busyRef.current=false;setBusy(false);}}
  }
  return <SettingsPage title={tr('家庭记录')} backLabel={tr('家庭')} accessibilityLabel={tr('家庭记录')} onBack={() => { saveProgress(); router.back(); }}>
    {!allowed ? <Text>{tr('家庭分享暂未开放。')}</Text> : <>
      {name && !(status === 'ready' && policy === 'family-history-v2' && !shareId && rows.length === 0) ? <Text style={styles.name}>{name}</Text> : null}
      {status === 'loading' ? <Text style={styles.meta}>{tr('正在读取家庭记录。')}</Text> : null}
      {status === 'ready' && policy === 'legacy' ? <View style={styles.block}>
        <Text style={styles.meta}>{tr('请在家庭页开启家庭分享。')}</Text>
        <Pressable style={styles.hit} accessibilityRole="button" onPress={() => router.dismissTo('/family')}><Text style={styles.action}>{tr('返回家庭')}</Text></Pressable>
      </View> : null}
      {status === 'ready' && policy === 'family-history-v2' && !shareId && rows.length === 0 ? <View style={styles.empty} testID="history-empty">
        <Text style={styles.emptyName}>{name}</Text>
        <Text style={styles.emptyTitle}>{tr('家里的片段，会慢慢留在这里。')}</Text>
        <Text style={styles.emptyBody}>{tr('去最近或回看，打开一条记录，再选择「分享给家里」。')}</Text>
        <View style={styles.footer}>
          <Pressable style={styles.hit} accessibilityRole="button" onPress={() => router.dismissTo('/')}><Text style={styles.action}>{tr('去最近')}</Text></Pressable>
          <Pressable style={styles.hit} accessibilityRole="button" onPress={() => router.dismissTo('/lookback')}><Text style={styles.action}>{tr('去回看')}</Text></Pressable>
        </View>
      </View> : null}
      {rows.map(row => <View key={row.shareId} style={styles.record}>
        <Text style={styles.meta}>{familySnapshotDate(row.snapshot)}</Text>
        {row.snapshot.note ? <Text style={styles.body} numberOfLines={6}>{row.snapshot.note}</Text> : null}
        <Text style={styles.meta}>{tr('照片：{0} · 声音：{1}',[row.snapshot.media.filter(m=>m.mimeType.startsWith('image/')).length,row.snapshot.media.filter(m=>m.mimeType.startsWith('audio/')).length])}</Text>
        {row.snapshot.emotion ? <Text style={styles.meta}>{feelingLabel(row.snapshot.emotion)}</Text> : null}
        <View style={styles.footer}><Text style={styles.meta}>{tr(viewer === row.authorUserId ? '你分享的' : '家人分享的')}</Text>
        <Pressable accessibilityRole="button" testID={`history-open-${row.shareId}`} style={styles.hit}
          onPress={() => router.push({pathname:'/family-record/[id]',params:{id:row.shareId,familyId}})}><Text style={styles.action}>{tr('阅读完整记录')}</Text></Pressable></View>
      </View>)}
      {view ? <View style={styles.record} testID="family-history-reading">
        <View style={styles.footer}>
          <Text style={styles.meta}>{tr(viewer === view.share.authorUserId ? '你分享的' : '家人分享的')}</Text>
          {viewer === view.share.authorUserId ? <Pressable accessibilityRole="button" testID="history-revoke" disabled={busy} style={styles.hit}
            onPress={() => {
              const expected = view; const current = currentRef.current; if (!current()) return;
              Alert.alert(tr('撤回这次分享？'), tr('家人将不能再阅读这次分享。你的个人记录仍然保留。'), [
                {text:tr('取消'),style:'cancel'}, {text:tr('撤回分享'),style:'destructive',onPress:() => void revoke(expected,current)},
              ]);
            }}><Text style={styles.meta}>{tr('撤回这次分享')}</Text></Pressable> : null}
        </View>
        <Text style={styles.meta}>{familySnapshotDate(view.share.snapshot)}</Text>
        {view.share.snapshot.note ? <Text style={styles.body}>{view.share.snapshot.note}</Text> : null}
        {view.media.map(media => media.mimeType.startsWith('image/') ? <FamilyPhoto key={media.objectId} uri={media.uri} /> :
          media.mimeType.startsWith('audio/') ? <View key={media.objectId} style={styles.audio}>
            <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy}}
              accessibilityLabel={tr(selectedAudio === media.objectId && sound.status === 'playing' ? '暂停' : '播放')}
              testID={`history-audio-${media.objectId}`} style={styles.hit}
              onPress={() => selectedAudio === media.objectId && sound.status === 'playing' ? saveProgress() : void play(view,media.objectId,media.uri)}>
              <LifeIcon name={selectedAudio === media.objectId && sound.status === 'playing' ? 'pause' : 'play'} />
              <Text style={styles.action}>{tr('一段声音')}</Text>
            </Pressable>
            {selectedAudio === media.objectId ? <Text style={styles.meta}>{Math.floor(sound.currentTimeMs/1000)}s</Text> : null}
            {selectedAudio === media.objectId && sound.failed ? <Text style={styles.meta}>{tr('这段声音暂时无法播放，其他内容仍然保留。')}</Text> : null}
          </View> : <Text key={media.objectId} style={styles.meta}>{tr('这份内容暂时无法打开。')}</Text>)}
        {view.share.snapshot.emotion ? <Text style={styles.meta}>{feelingLabel(view.share.snapshot.emotion)}</Text> : null}

      </View> : null}
      {message ? <Text style={styles.meta}>{message}</Text> : null}
      {status === 'failed' ? <Pressable accessibilityRole="button" style={styles.hit} onPress={() => void load()}><Text style={styles.action}>{tr('再试一次')}</Text></Pressable> : null}
    </>}
  </SettingsPage>;
}
const styles=StyleSheet.create({
  footer:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:12},
  empty:{alignItems:'center',paddingVertical:48,gap:20},emptyName:{...type.title,color:ink,textAlign:'center'},emptyTitle:{...type.action,color:inkSoft,textAlign:'center'},emptyBody:{...type.meta,color:inkSoft,textAlign:'center',maxWidth:320},
  name:{...type.body,color:inkSoft,marginTop:16,marginBottom:24},body:{...type.body,color:ink},meta:{...type.meta,color:inkSoft},
  action:{...type.action,color:sage},block:{gap:16},record:{gap:16,paddingVertical:24,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:hairline},
  hit:{minHeight:48,flexDirection:'row',alignItems:'center',gap:12,paddingVertical:12},audio:{gap:8},
});
