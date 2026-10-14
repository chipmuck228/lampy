import { useLayoutEffect, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { albumFileEvaluationOpen, albumFileFailureCode } from '../application/album-file';
import { closeAlbumFileSession, createAlbumFileEdition, saveAlbumFileArtifact } from '../infrastructure/album-file-store';
import { SettingsPage } from './settings-chrome';
import { useDeviceLock } from './device-lock-context';
import { Text } from './life-text';
import { tr } from '../i18n';
export default function AlbumFileCreateScreen() {
  const router = useRouter(); const edition = useLocalSearchParams<{edition?: string}>().edition ?? '';
  const lock = useDeviceLock(); const enabled = albumFileEvaluationOpen(typeof __DEV__ !== 'undefined' && __DEV__);
  const [foreground,setForeground] = useState(AppState.currentState === 'active');
  const blocked = !enabled || !!lock?.snapshot.locked || !foreground;
  const [artifact,setArtifact] = useState<Awaited<ReturnType<typeof createAlbumFileEdition>> | null>(null);
  const [code,setCode] = useState<string | null>(null);
  const [busy,setBusy] = useState(false); const [saved,setSaved] = useState(false); const [failed,setFailed] = useState(false);
  const generation = useRef(0); const alive = useRef(true); const hidden = useRef(blocked); useLayoutEffect(() => { hidden.current = blocked; if (blocked) generation.current += 1; }, [blocked]);
  const owned = useRef<typeof artifact>(null); const task = useRef<Promise<unknown> | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change',state => {setForeground(state === 'active'); if (state !== 'active') generation.current += 1;});
    return () => {sub.remove(); alive.current = false; generation.current += 1;
      void (async () => {try {await task.current;} catch { /* generator cleans */ } if (owned.current) await closeAlbumFileSession(owned.current.id);})().catch(() => undefined);
    };
  },[]);
  async function generate() {
    if (task.current || blocked || artifact) return;
    const epoch = ++generation.current; setBusy(true); setFailed(false); setCode(null);
    const job = createAlbumFileEdition(edition,() => alive.current && !hidden.current && generation.current === epoch);
    task.current = job;
    try {const result = await job;
      if (!alive.current || hidden.current || generation.current !== epoch) {await closeAlbumFileSession(result.id); return;}
      owned.current = result; setArtifact(result);
    }
    catch (error) {if (alive.current && generation.current === epoch) {setFailed(true);setCode(albumFileFailureCode(error));}}
    finally {task.current = null; if (alive.current) setBusy(false);}
  }
  async function save() {
    if (task.current || blocked || !artifact) return;
    setBusy(true); setFailed(false); setCode(null);
    const job = saveAlbumFileArtifact(artifact,() => alive.current && !hidden.current && AppState.currentState === 'active'); task.current = job;
    try {const complete = await job; if (alive.current) setSaved(complete);}
    catch (error) {if (alive.current) {setFailed(true);setCode(albumFileFailureCode(error));}}
    finally {task.current = null; if (alive.current) setBusy(false);}
  }
  return <SettingsPage title={tr('生活册文件')} backLabel={tr('返回')} accessibilityLabel={tr('生活册文件')} onBack={() => router.back()}>
    {!blocked ? <View style={{paddingTop:24,gap:16}}>
      <Text>{tr('照片、声音和打印PDF都在这一份文件里。')}</Text>
      <Text>{tr('保存后，这份文件不再只待在Lampy里，无法从别人的设备收回。')}</Text>
      <Text>{tr('按这次已经生成的版本制作，原记录后来的变化不会改动它。')}</Text>
      <Pressable accessibilityRole="button" disabled={busy || !!artifact} onPress={() => void generate()}><Text>{tr(busy ? '正在准备这一册…' : '生成生活册文件')}</Text></Pressable>
      {busy && !artifact ? <Pressable accessibilityRole="button" onPress={() => {generation.current += 1;}}><Text>{tr('取消')}</Text></Pressable> : null}
      {artifact ? <><Text>{artifact.name} · {(artifact.bytes / 1024 / 1024).toFixed(1)} MB</Text><Pressable accessibilityRole="button" disabled={busy} onPress={() => void save()}><Text>{tr('保存成品')}</Text></Pressable></> : null}
      {saved ? <Text>{tr('成品已保存到你选择的位置。')}</Text> : null}
      {failed && code ? <Text testID="album-file-failure-code">{code}</Text> : null}
      {failed ? <Text>{tr('这次没有完成，请核对空间和文件后再试。')}</Text> : null}
    </View> : null}
  </SettingsPage>;
}
