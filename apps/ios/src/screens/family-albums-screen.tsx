import {albumManageStyles as bookStyles} from './album-manage-styles';
import { AlbumCreateFields, AlbumManageToolbar, AlbumEntryActions } from './album-workflow-controls';
import { DEFAULT_ALBUM_NAME, normalizeAlbumName, albumEntryCountLabel } from '../application/life-album';
import { moveAlbumReference } from '../application/album-entry-order';
import { FamilyAlbumEditor, FamilyAlbumCoverPreview } from './family-album-editor';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { getFamilyUseCases } from '../application/container';
import { createFamilyAlbumReadSession, familyAlbumEvaluationOpen, FAMILY_ALBUM_RULE_COPY, FAMILY_ALBUM_LEASE_MS, FAMILY_ALBUM_RENEW_MS } from '../application/family-album';
import type { FamilyAlbumUseCases } from '../application/family-album';
import type { FamilyAlbumAccess, FamilyAlbumSummary, FamilyAlbumView } from '../family-api/family-album-types';
import type { FamilySummary, ShareView } from '../family-api/types';
import { pauseForegroundAudio } from '../application/foreground-audio';
import { isFamilyProductEntryOpen } from '../infrastructure/family-config';
import { useDeviceLock } from './device-lock-context';
import { SettingsPage } from './settings-chrome';
import { Text, type } from './life-text';
import { ink, inkSoft, sage } from './life-page';
import { tr } from '../i18n';
export default function FamilyAlbumsScreen() {
  const params = useLocalSearchParams<{familyId?:string;albumId?:string;mode?:string}>();
  const routeFamily = typeof params.familyId === 'string' ? params.familyId : null;
  const routeAlbum = typeof params.albumId === 'string' ? params.albumId : null;
  const mode = params.mode === 'new' ? 'new' : params.mode === 'collect' ? 'collect' : 'read';
  return <FamilyAlbumFlow key={`${routeFamily ?? ''}/${routeAlbum ?? ''}/${mode}`} routeFamily={routeFamily} routeAlbum={routeAlbum} mode={mode}/>;
}
function FamilyAlbumFlow({routeFamily,routeAlbum,mode}:{routeFamily:string|null;routeAlbum:string|null;mode:'new'|'collect'|'read'}) {
  const router = useRouter();
  const lock = useDeviceLock();
  const [focused, setFocused] = useState(false);
  const focusedRef = useRef(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const allowed = isFamilyProductEntryOpen() && familyAlbumEvaluationOpen(typeof __DEV__ !== 'undefined' && __DEV__) && !lock?.snapshot.locked && foreground;
  const [families, setFamilies] = useState<FamilySummary[]>([]);
  const [familyId, setFamilyId] = useState<string | null>(routeFamily);
  const [access, setAccess] = useState<FamilyAlbumAccess | null>(null);
  const [albums, setAlbums] = useState<FamilyAlbumSummary[]>([]);
  const [book, setBook] = useState<FamilyAlbumView | null>(null);
  const [sources, setSources] = useState<ShareView[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(DEFAULT_ALBUM_NAME);
  const [organizing, setOrganizing] = useState(false);
  const [reading,setReading]=useState(false);
  const [failed, setFailed] = useState(false);
  const [diagnostic, setDiagnostic] = useState('');
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const accountId = useRef<string | null>(null);
  const epoch = useRef(0);
  const owner = useRef(false);
  const requestId = useRef<string | null>(null);
  const session = useRef<ReturnType<typeof createFamilyAlbumReadSession> | null>(null);
  const client = useRef<FamilyAlbumUseCases | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      setForeground(state === 'active');
      if (state !== 'active') {
        epoch.current++;
        session.current?.invalidate();
        pauseForegroundAudio();
      }
    });
    return () => sub.remove();
  }, []);
  useFocusEffect(useCallback(() => {
    void retry;
    focusedRef.current=true;setFocused(true);
    const ticket = ++epoch.current;
    let disposed = false;
    session.current?.invalidate();
    setBook(null);
    setEditing(false);
    setOrganizing(false);
    setReading(false);
    setAccess(null);
    setAlbums([]);
    setSources([]);
    setSelected([]);
    setFamilies([]);
    setFailed(false);
    setDiagnostic('');
    setChecking(false);
    if (allowed) void (async () => {
      try {
        const app = await getFamilyUseCases();
        const directory = await app.getFamilies(() => !disposed && ticket === epoch.current);
        if (disposed || ticket !== epoch.current) return;
        if (accountId.current && accountId.current !== directory.userId) {
          setName(DEFAULT_ALBUM_NAME);
          requestId.current = null;
        }
        accountId.current = directory.userId;
        client.current = app.albums;
        setFamilies(directory.families);
        if (!familyId && mode === 'new') {
          const creators = directory.families.filter(family => family.role === 'creator');
          if (creators.length === 1) { setFamilyId(creators[0].familyId); return; }
        }
        if (familyId && directory.families.some(family => family.familyId === familyId)) {
          const permission = await app.albums.access(familyId);
          if (disposed || ticket !== epoch.current) return;
          setAccess(permission);
          if (permission.rulesAcknowledged) {
            const list = await app.albums.list(familyId);
            if (disposed || ticket !== epoch.current) return;
            setAlbums(list.albums);
            if (routeAlbum && mode !== 'new') {
              const reading = createFamilyAlbumReadSession({client:app.albums,onInvalidate:()=>{if(focusedRef.current)pauseForegroundAudio();}});
              session.current = reading;
              await reading.load(familyId,routeAlbum);
              if (disposed || ticket !== epoch.current) { reading.invalidate(); return; }
              setBook(reading.snapshot());setAccess(reading.snapshot()?.access ?? null);
            }
          }
        }
      } catch (error) {
        if (!disposed && ticket === epoch.current) {
          setDiagnostic(`LOAD/${familyAlbumFailureCode(error)}`);
          setFailed(true);
          setBook(null);
          setAccess(null);
          setSources([]);
        }
      }
    })();
    return () => {
      if(disposed)return;
      focusedRef.current=false;setFocused(false);
      disposed = true;
      epoch.current++;
      session.current?.invalidate();
      client.current = null;
      pauseForegroundAudio();
    };
  }, [allowed, familyId, retry, mode, routeAlbum]));
  // A bounded read lease: expire locally even if a network request hangs.
  useEffect(() => {
    if (!book || !allowed || !focused) return;
    const timer = setInterval(() => {
      if(!focusedRef.current)return;
      if (!session.current?.snapshot()) {
        setDiagnostic(`READ_LEASE/EXPIRED ${session.current?.diagnostic()??'NO_SESSION'} busy=${owner.current?1:0}`);
        setChecking(true);
        pauseForegroundAudio();
      } else setChecking(false);
    }, 250);
    let validating = false;
    const renew = () => {
      if (validating || !focusedRef.current) return;
      const current = session.current;
      if (current && !owner.current) {
        validating = true;
        const started = Date.now();
        void current.validate().catch((error) => {
        if (focusedRef.current && session.current === current && !owner.current) {
          setChecking(false);
          setDiagnostic(`VALIDATE/${familyAlbumFailureCode(error)}/${Date.now()-started}ms`);
          epoch.current++;
          setBook(null);
          setAccess(null);
          setAlbums([]);
          setFamilies([]);
          setSources([]);
          setSelected([]);
          setFailed(true);
          pauseForegroundAudio();
        }
        }).finally(() => { validating = false; });
      }
    };
    renew();
    const validate = setInterval(renew, FAMILY_ALBUM_RENEW_MS);
    return () => {
      clearInterval(timer);
      clearInterval(validate);
    };
  }, [book, allowed, focused]);
  useEffect(() => {
    if (!allowed || !focused || failed || (familyId && !access) || (book && !sources.length)) return;
    let disposed = false;
    let pending = false;
    let deadline = Date.now() + FAMILY_ALBUM_LEASE_MS;
    const clear = (reason:string) => {
      setDiagnostic(reason);
      setChecking(false);
      epoch.current++;
      session.current?.invalidate();
      pauseForegroundAudio();
      setBook(null);
      setAccess(null);
      setAlbums([]);
      setSources([]);
      setSelected([]);
      setFamilies([]);
      setFailed(true);
    };
    const timer = setInterval(() => {
      if (focusedRef.current && !disposed && Date.now() > deadline) clear('DIRECTORY_LEASE/EXPIRED');
    }, 250);
    const validate = setInterval(() => {
      if (pending || owner.current || !focusedRef.current) return;
      pending = true;
      const ticket = epoch.current;
      const started = Date.now();
      void (async () => {
        try {
          const app = await getFamilyUseCases();
          const directory = book ? null : await app.getFamilies(() => !disposed && epoch.current === ticket);
          const permission = book ? null : familyId ? await app.albums.access(familyId) : null;
          const refreshed = sources.length && familyId ? await app.albums.sources(familyId) : null;
          if (disposed || epoch.current !== ticket) return;
          if (Date.now() - started >= FAMILY_ALBUM_LEASE_MS) throw new Error('expired');
          if (access && permission && (access.userId !== permission.userId || access.authority !== permission.authority || access.rulesAcknowledged !== permission.rulesAcknowledged)) throw new Error('changed');
          deadline = started + FAMILY_ALBUM_LEASE_MS;
          if (directory) setFamilies(directory.families);
          if (refreshed) {
            setSources(refreshed.shares);
            setSelected(previous => previous.filter(id => refreshed.shares.some(share => share.shareId === id)));
          }
        } catch (error) {
          if (!disposed && epoch.current === ticket) clear(`DIRECTORY/${familyAlbumFailureCode(error)}/${Date.now()-started}ms`);
        } finally {
          pending = false;
        }
      })();
    }, FAMILY_ALBUM_RENEW_MS);
    return () => {
      disposed = true;
      clearInterval(timer);
      clearInterval(validate);
    };
  }, [allowed, focused, familyId, access, sources.length, failed, book]);
  async function run(work: (api: FamilyAlbumUseCases, current: () => boolean) => Promise<void>) {
    if (owner.current || !allowed || !focusedRef.current || !client.current || !familyId) return;
    owner.current = true;
    setBusy(true);
    setFailed(false);
    const ticket = ++epoch.current;
    try {
      await work(client.current, () => epoch.current === ticket && AppState.currentState === 'active');
    } catch (error) {
      if (epoch.current === ticket) {
        setChecking(false);
        setDiagnostic(`ACTION/${familyAlbumFailureCode(error)}`);
        session.current?.invalidate();
        setBook(null);
        setAccess(null);
        setAlbums([]);
        setFamilies([]);
        setSources([]);
        setSelected([]);
        setFailed(true);
      }
    } finally {
      owner.current = false;
      setBusy(false);
    }
  }
  async function moveEntry(view:FamilyAlbumView,shareId:string,direction:'up'|'down') {
    const order=moveAlbumReference(view.items.map(item=>item.shareId),shareId,direction);
    if(!order||order.every((id,index)=>id===view.items[index].shareId))return;
    await run(async(api,current)=>{await api.mutate(familyId!,view,{kind:'reorder',shareIds:order});if(current())await show(api,view.albumId,current,true);});
  }
  async function show(api:FamilyAlbumUseCases,albumId:string,current:()=>boolean,preserve=false) {
    const reading=createFamilyAlbumReadSession({client:api,onInvalidate:()=>{if(focusedRef.current)pauseForegroundAudio();}});
    if(!preserve){session.current?.invalidate();session.current=reading;setBook(null);setEditing(false);setOrganizing(false);setSources([]);setSelected([]);}
    await reading.load(familyId!,albumId);
    if(current()){
      if(preserve){session.current?.invalidate();session.current=reading;}
      setChecking(false);setBook(reading.snapshot());setAccess(reading.snapshot()?.access??null);
      if(mode==='collect'&&!preserve&&reading.snapshot()?.access.canManage){const result=await api.sources(familyId!);if(current()&&reading.snapshot())setSources(result.shares);}
    }else reading.invalidate();
  }
  return <SettingsPage title={mode === 'new' ? tr('新建家庭册') : mode === 'collect' ? tr('添加到家庭册') : allowed && focused && !checking && !failed && book ? book.name : tr('这一册')} backLabel={tr(routeAlbum ? '我的生活册' : '返回')} accessibilityLabel={tr('家里的生活册')} onBack={() => router.back()}>
    {allowed && focused ? <><View accessibilityElementsHidden={checking} importantForAccessibility={checking?'no-hide-descendants':'auto'} pointerEvents={checking?'none':'auto'} style={{
      paddingTop: 24,
      gap: 10,
      display:checking?'none':'flex'
    }}>
      {!familyId ? <Text style={{...type.body,color:inkSoft}}>{tr('选择这册所属的家庭')}</Text> : <Text style={{...type.meta,color:inkSoft}}>{families.find(family=>family.familyId===familyId)?.name}</Text>}
      {mode === 'collect' && !book ? <Text style={{...type.body,color:inkSoft}}>{tr('选择已有家庭册，再收入这个家的分享。')}</Text> : null}
      {!familyId ? families.filter(family=>mode !== 'new' || family.role === 'creator').map(family => <View key={family.familyId}>{<FamilyAlbumButton label={family.name} onPress={() => {
          epoch.current++;
          session.current?.invalidate();
          setFamilyId(family.familyId);
          requestId.current = null;
          setName(DEFAULT_ALBUM_NAME);
          setRetry(value => value + 1);
        }} disabled={busy} />}</View>) : null}
      {access && !access.rulesAcknowledged ? <><Text>{tr(FAMILY_ALBUM_RULE_COPY)}</Text><Text>{tr('已经交付的文件和纸书无法追回。')}</Text>
        {<FamilyAlbumButton label={tr('我知道了')} onPress={() => void run(async (api, current) => {
          await api.acknowledge(familyId!, access.membershipId);
          if (current()) setRetry(value => value + 1);
        })} disabled={busy} />}</> : null}
      {access?.rulesAcknowledged ? <>
        {mode !== 'new' && !book ? albums.map(album => <View key={album.albumId}>{<FamilyAlbumButton label={`${album.name} · ${album.entryCount}`} onPress={() => void run((api, current) => show(api, album.albumId, current))} disabled={busy} />}</View>) : null}
        {mode !== 'new' && !book && albums.length===0 ? <Text style={{...type.body,color:inkSoft}}>{tr('这个家还没有家庭册。')}</Text> : null}
        {access.canManage && mode === 'new' ? <AlbumCreateFields name={name} onChangeName={value=>{setName(value);requestId.current=null;}} placeholder={DEFAULT_ALBUM_NAME} maxLength={200} busy={busy} prefix="family-album-new" submitLabel={tr('创建这一册')} busyLabel={tr('正在记下')} onSubmit={()=>void run(async(api,current)=>{
          const operation=requestId.current??`album_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;requestId.current=operation;
          const created=await api.create(familyId!,{requestId:operation,authority:access.authority,name:normalizeAlbumName(name),opening:null});
          if(!current())return;requestId.current=null;router.replace({pathname:'/family-albums',params:{familyId:familyId!,albumId:created.albumId,mode:'read'}});
        })}/> : null}
        {access.canManage && mode === 'collect' && !book ? <FamilyAlbumButton label={tr('新建家庭册')} onPress={()=>router.push({pathname:'/family-albums',params:{familyId:familyId!,mode:'new'}})} disabled={busy}/> : null}
      </> : null}
      {book ? <View style={{
        gap: 12
      }}><View style={bookStyles.hero} testID="family-album-manage-hero">
        <View style={bookStyles.heroCover}>{book.cover ? <FamilyAlbumCoverPreview key={`${book.cover.shareId}/${book.cover.objectId}`} familyId={book.familyId} cover={book.cover} compact/> : <Text style={bookStyles.heroWords} numberOfLines={3}>{book.name}</Text>}</View>
        <View style={bookStyles.heroCopy}><Text style={bookStyles.heroTitle} numberOfLines={2}>{book.name}</Text><Text style={{...type.meta,color:inkSoft}}>{albumEntryCountLabel(book.items.length)}</Text>
        <Text style={{...type.meta,color:inkSoft}}>{families.find(family=>family.familyId===book.familyId)?.name}</Text>
        {book.items.length?<FamilyAlbumButton label={tr(reading?'返回整理':'看看这一册')} onPress={()=>{setReading(value=>!value);setEditing(false);setOrganizing(false);setSources([]);setSelected([]);}} disabled={busy}/>:<Text style={{...type.meta,color:inkSoft}}>{tr('先收下一条，也可以慢慢添。')}</Text>}
        </View></View>
        {reading && book.opening ? <Text style={{...type.body,color:ink}}>{book.opening}</Text> : null}
        {book.access.canManage && !reading ? <AlbumManageToolbar prefix="family-album" editing={editing} organizing={organizing} busy={busy} onEdit={()=>{setSources([]);setSelected([]);setEditing(value=>!value);}} onOrganize={()=>{setSources([]);setSelected([]);setOrganizing(value=>!value);}}/> : null}
        {editing && book.access.canManage ? <FamilyAlbumEditor book={book} busy={busy} onSave={change=>void run(async(api,current)=>{
          await api.mutate(familyId!,book,change);if(current())await show(api,book.albumId,current,true);
        })}/> : null}
        {book.items.map((item,index) => <View key={item.shareId} style={bookStyles.entry} testID={`family-album-entry-${item.shareId}`}>
          {item.status === 'active' ? <Pressable accessibilityRole="button" accessibilityLabel={item.share.snapshot.note||tr('第{0}条',[index+1])} disabled={busy||organizing} onPress={()=>router.push({pathname:'/family-record/[id]',params:{id:item.shareId,familyId:familyId!}})} style={bookStyles.entryHit}>
          {!reading&&item.share.snapshot.media.find(media=>media.mimeType.startsWith('image/'))?<FamilyAlbumCoverPreview familyId={book.familyId} cover={{shareId:item.shareId,objectId:item.share.snapshot.media.find(media=>media.mimeType.startsWith('image/'))!.objectId}} tile={{name:'',width:56,height:56}}/>:null}
          <View style={bookStyles.entryCopy}>
          {item.share.snapshot.note?<Text style={{...type.body,color:ink}} numberOfLines={reading?undefined:3}>{item.share.snapshot.note}</Text>:null}
          <Text style={{...type.meta,color:inkSoft}}>{item.share.authorNickname || tr('家人')}{item.share.snapshot.occurredAt&&item.share.snapshot.occurredAtPrecision!=='unknown'?` · ${item.share.snapshot.occurredAt.slice(0,10)}`:''}</Text>
          {reading?item.share.snapshot.media.filter(media=>media.mimeType.startsWith('image/')).map(media=><FamilyAlbumCoverPreview key={media.objectId} familyId={book.familyId} cover={{shareId:item.shareId,objectId:media.objectId}}/>):null}
          {item.share.snapshot.media.length?<View style={bookStyles.mediaRow}>
          {item.share.snapshot.media.some(media=>media.mimeType.startsWith('image/'))?<Text style={{...type.meta,color:inkSoft}}>{tr('{0}张照片',[item.share.snapshot.media.filter(media=>media.mimeType.startsWith('image/')).length])}</Text>:null}
          {item.share.snapshot.media.some(media=>media.mimeType.startsWith('audio/'))?<Text style={{...type.meta,color:inkSoft}}>{tr('有声音')}</Text>:null}
          </View>:null}
          </View></Pressable>:<Text style={{...type.body,color:ink}}>{tr('这条分享已不可用。')}</Text>}
          {book.access.canManage && organizing ? <AlbumEntryActions prefix="family-album" id={item.shareId} first={index===0} last={index===book.items.length-1} busy={busy} onMoveUp={()=>void moveEntry(book,item.shareId,'up')} onMoveDown={()=>void moveEntry(book,item.shareId,'down')} onRemove={()=>void run(async(api,current)=>{await api.mutate(familyId!,book,{kind:'remove',shareId:item.shareId});if(current())await show(api,book.albumId,current,true);})}/> : null}
        </View>)}
        {book.access.canManage && !reading && !editing && !organizing ? <>
          {<FamilyAlbumButton label={tr('收入记录')} onPress={() => void run(async (api, current) => {
            const result = await api.sources(familyId!);
            if (current()) {
              setSources(result.shares);
              setSelected([]);
            }
          })} disabled={busy} />}
          {sources.map(share => <View key={share.shareId}>{<FamilyAlbumButton label={`${selected.includes(share.shareId) ? '✓ ' : ''}${share.authorNickname || tr('家人')} · ${share.snapshot.note.slice(0, 60)}`} onPress={() => setSelected(previous => previous.includes(share.shareId) ? previous.filter(id => id !== share.shareId) : [...previous, share.shareId])} disabled={busy} />}</View>)}
          {selected.length ? <FamilyAlbumButton label={tr('收入选中的分享')} onPress={() => void run(async (api, current) => {
            await api.mutate(familyId!, book, {
              kind: 'collect',
              shareIds: selected
            });
            if (current()) await show(api, book.albumId, current);
          })} disabled={busy} /> : null}
          {<FamilyAlbumButton label={tr('收入当前全部分享')} onPress={() => void run(async (api, current) => {
            await api.mutate(familyId!, book, {
              kind: 'collect',
              shareIds: 'all'
            });
            if (current()) await show(api, book.albumId, current);
          })} disabled={busy} />}
        </> : null}
      </View> : null}
      {failed ? <><Text>{tr('家庭内容或资格已变化，请重新核对。')}</Text>{__DEV__ ? <Text selectable testID="family-album-diagnostic" style={{...type.meta,color:inkSoft}}>{`开发诊断：${diagnostic}`}</Text> : null}{<FamilyAlbumButton label={tr('再试一次')} onPress={() => setRetry(value => value + 1)} disabled={busy} />}</> : null}
    </View>{checking ? <View style={{paddingTop:24,gap:16}} testID="family-album-checking"><Text>{tr('正在重新核对家庭内容，请稍候。')}</Text><FamilyAlbumButton label={tr('再试一次')} onPress={()=>setRetry(value=>value+1)} disabled={busy}/>{__DEV__?<Text style={{...type.meta,color:inkSoft}}>{diagnostic}</Text>:null}</View> : null}</> : null}
  </SettingsPage>;
}
function FamilyAlbumButton({label,onPress,disabled}:{label:string;onPress:()=>void;disabled:boolean}) {
  return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={{minHeight:48,justifyContent:'center'}}><Text style={{...type.action,color:disabled?inkSoft:sage}}>{label}</Text></Pressable>;
}

function familyAlbumFailureCode(error:unknown) {
  const code=error&&typeof error==='object'&&'code' in error?error.code:null;
  if(typeof code==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(code))return code;
  if(error instanceof Error&&error.message==='expired')return 'EXPIRED';
  if(error instanceof Error&&error.message==='changed')return 'AUTHORITY_CHANGED';
  return 'UNKNOWN';
}
