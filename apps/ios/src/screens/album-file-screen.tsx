import { useCallback, useLayoutEffect, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { albumFileFailureCode } from '../application/album-file';
import { forgetAlbumFile, pendingAlbumFile } from '../application/album-file-open';
import { closeAlbumFileSession, newAlbumFileSessionId, openAlbumFile, type OpenAlbumFile } from '../infrastructure/album-file-store';
import { useDeviceLock } from './device-lock-context';
import { SettingsPage } from './settings-chrome';
import { Text } from './life-text';
import LifeAlbumReadingScreen from './life-album-reading-screen';
import { tr } from '../i18n';
type Job = {id: string; token: number; promise: Promise<OpenAlbumFile>};
async function dispose(job: Job) {try {await job.promise;} catch { return; } await closeAlbumFileSession(job.id);}
export default function AlbumFileScreen() {
  const router = useRouter(); const token = Number(useLocalSearchParams<{token?: string}>().token);
  const lock = useDeviceLock(); const blocked = !!lock?.snapshot.locked;
  const [opened,setOpened] = useState<(OpenAlbumFile & {token:number}) | null>(null);
  const [code,setCode] = useState<string | null>(null);
  const [failed,setFailed] = useState(false); const [cleanupFailed,setCleanupFailed] = useState(false);
  const owner = useRef<Job | null>(null); const mounted = useRef(true);
  const generation = useRef(0); const locked = useRef(blocked); useLayoutEffect(() => { locked.current = blocked; }, [blocked]);
  useEffect(() => {
    if (blocked || owner.current?.token === token) return;
    const source = pendingAlbumFile(token); if (!source) {void Promise.resolve().then(() => setFailed(true)); return;}
    const previous = owner.current; const epoch = ++generation.current; const id = newAlbumFileSessionId();
    void Promise.resolve().then(() => {setOpened(null); setFailed(false);});
    const promise = (async () => {
      if (previous) {try {await dispose(previous);} catch {throw new Error('FILE_CLEANUP_FAILED');} forgetAlbumFile(previous.token);}
      return openAlbumFile(source,id,() => mounted.current && generation.current === epoch && !locked.current);
    })();
    const job = {id,token,promise}; owner.current = job;
    void promise.then(result => {if (mounted.current && generation.current === epoch) setOpened({...result,token});})
      .catch(error => {if (mounted.current && generation.current === epoch) {
        if (error instanceof Error && error.message === 'FILE_CLEANUP_FAILED' && previous) {owner.current = previous; setCleanupFailed(true);}
        else {owner.current = null; setFailed(true);setCode(albumFileFailureCode(error));}
      }});
  },[token,blocked]);
  useEffect(() => {
    mounted.current = true;
    return () => {mounted.current = false; generation.current += 1;
      const job = owner.current; owner.current = null;
      if (job) {forgetAlbumFile(job.token); void dispose(job).catch(() => undefined);}
    };
  },[]);
  const close = useCallback(() => {
    generation.current += 1; setOpened(null); forgetAlbumFile(token);
    const job = owner.current;
    if (!job) {router.replace('/'); return;}
    void dispose(job).then(() => {owner.current = null; router.replace('/');}).catch(() => {if (mounted.current) setCleanupFailed(true);});
  }, [token,router]);
  const external = useMemo(() => opened?.token === token ? {input:opened.input,style:opened.book.style,fonts:opened.book.fonts,onClose:close} : undefined,
    [opened,token,close]);
  if (opened?.token === token && !cleanupFailed) return <LifeAlbumReadingScreen key={opened!.id} external={external} />;
  return <SettingsPage title={tr('打开这一册')} backLabel={tr('关闭')} accessibilityLabel={tr('打开这一册')} onBack={close}>
    <View style={{paddingTop:24,gap:16}}>
      {!blocked ? <Text>{tr(cleanupFailed ? '临时文件尚未清理，请再试一次。' : failed ? '这一册暂时打不开，请从原文件重新打开。' : '正在打开这一册…')}</Text> : null}
      {!blocked && failed && __DEV__ && code ? <Text testID="album-file-failure-code">{code}</Text> : null}
      <Pressable accessibilityRole="button" onPress={close}><Text>{tr('关闭')}</Text></Pressable>
    </View>
  </SettingsPage>;
}
