import {subscribeFamilySafety} from '../application/family-safety-events';
import {familyNetworkDiagnostic} from '../infrastructure/family-network-diagnostic';
import {FamilyAlbumCoverPreview} from './family-album-editor';
import {albumCoverWallLayout,ALBUM_COVER_WALL_GAP} from './album-cover-wall';
import {FAMILY_ALBUM_LEASE_MS,FAMILY_ALBUM_RENEW_MS} from '../application/family-album';
import {useCallback,useEffect,useRef,useState} from 'react';
import {AppState,Pressable,View} from 'react-native';
import {useFocusEffect,useRouter} from 'expo-router';
import {getFamilyUseCases} from '../application/container';
import type {FamilyAlbumSummary} from '../family-api/family-album-types';
import type {FamilySummary} from '../family-api/types';
import {useDeviceLock} from './device-lock-context';
import {AlbumCoverFace,AlbumCoverMeta,AlbumCreateTile} from './album-cover-tile';
import {Text,type} from './life-text';
import {inkSoft} from './life-page';
import {tr} from '../i18n';
const LIBRARY_REQUEST_MS=10000;
function libraryFailureCode(error:unknown){
 const code=error&&typeof error==='object'&&'code' in error?error.code:null;
 return typeof code==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(code)?code:'UNKNOWN';
}
type Row=FamilyAlbumSummary & {familyName:string};
// This panel lives inside the same list page as personal albums. Nothing is persisted.
export function FamilyAlbumLibrary(){
 const router=useRouter(),lock=useDeviceLock();
 const [wallWidth,setWallWidth]=useState<number|null>(null);const layout=albumCoverWallLayout(wallWidth);
 const [foreground,setForeground]=useState(AppState.currentState==='active');
 const [rows,setRows]=useState<Row[]>([]),[pending,setPending]=useState<FamilySummary[]>([]);
 const [status,setStatus]=useState<'loading'|'ready'|'checking'|'failed'>('loading');
 const [diagnostic,setDiagnostic]=useState('');
 const [canCreate,setCanCreate]=useState(false),[retry,setRetry]=useState(0);
 const generation=useRef(0);const allowed=foreground&&!lock?.snapshot.locked;
 useEffect(()=>{const listener=AppState.addEventListener('change',state=>{if(state!=='active')generation.current++;setForeground(state==='active');});return()=>listener.remove();},[]);
 useEffect(()=>subscribeFamilySafety(()=>{generation.current++;setRows([]);setPending([]);setCanCreate(false);setRetry(n=>n+1);}),[]);
 useFocusEffect(useCallback(()=>{
  void retry;
  let disposed=false,inFlight=false,expired=false,loadId=0,lastFailure='';
  const epoch=++generation.current;let deadline=Date.now()+FAMILY_ALBUM_LEASE_MS;
  const current=()=>!disposed&&generation.current===epoch;
  const hide=()=>{setRows([]);setPending([]);setCanCreate(false);};
  hide();setStatus('loading');setDiagnostic('');
  async function load(){
   if(!allowed||inFlight||!current())return;
   inFlight=true;const id=++loadId,started=Date.now();let stage='CONTAINER';const phases=new Map<number,string>();
   const requestCurrent=()=>current()&&id===loadId;
   let timer:ReturnType<typeof setTimeout>|undefined;
   try{
    const work=(async()=>{
     const app=await getFamilyUseCases();stage='DIRECTORY';const directory=await app.getFamilies(requestCurrent,next=>{if(requestCurrent()&&/^[A-Z_]+$/.test(next))stage=next;});
     if(!requestCurrent())return null;
     stage='ALBUM_LIST';
     const result=await Promise.all(directory.families.map(async(family,index)=>{
      phases.set(index,'ALBUM_LIST');
      try{
       // list() already checks membership/rules and returns qualified access.
       const list=await app.albums.list(family.familyId);
       if(!requestCurrent())return null;
       if(list.access.userId!==directory.userId)throw {code:'ACCOUNT_CHANGED'};
       if(list.access.rulesAcknowledged===false)return {family,albums:[],pending:true};
       return {family,albums:list.albums,pending:false};
      }catch(error){
       if(libraryFailureCode(error)==='FAMILY_ALBUM_RULES_REQUIRED')return {family,albums:[],pending:true};
       throw {code:libraryFailureCode(error),stage:'ALBUM_LIST',networkDiagnostic:error&&typeof error==='object'&&'networkDiagnostic' in error?error.networkDiagnostic:undefined};
      }finally{phases.delete(index);}
     }));
     return {directory,result};
    })();
    const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject({code:'SERVER_UNREACHABLE',stage:'REQUEST_TIMEOUT'}),LIBRARY_REQUEST_MS);});
    const data=await Promise.race([work,timeout]);
    if(!requestCurrent()||!data)return;
    const result=data.result.filter(item=>item!==null);
    if(Date.now()-started>=FAMILY_ALBUM_LEASE_MS)throw {code:'SERVER_UNREACHABLE',stage:'READ_TOO_SLOW'};
    deadline=started+FAMILY_ALBUM_LEASE_MS;expired=false;
    setRows(result.flatMap(({family,albums})=>albums.map(album=>({...album,familyName:family.name||tr('未命名家庭')}))));
    setPending(result.filter(item=>item.pending).map(item=>item.family));
    setCanCreate(data.directory.families.some(family=>family.role==='creator'));setStatus('ready');setDiagnostic('');lastFailure='';
   }catch(error){
    if(!requestCurrent())return;
    const code=libraryFailureCode(error),phase=[...phases.values()].sort().join(',')||stage;
    if(error&&typeof error==='object'&&'stage' in error&&typeof error.stage==='string'&&/^[A-Z_]+$/.test(error.stage))stage=error.stage;
    lastFailure=`LIBRARY/${stage}/${code} elapsedMs=${Date.now()-started} phase=${phase} ${familyNetworkDiagnostic(error)}`.trim();setDiagnostic(lastFailure);
    if(code==='NETWORK'||code==='SERVER_UNREACHABLE'||code==='RATE_LIMITED'||code==='STALE_FAMILY_REQUEST'){
     // Keep the existing lease, never extend it on a failed refresh.
     if(Date.now()>=deadline){hide();setStatus('checking');expired=true;}
    }else{generation.current++;hide();setStatus('failed');}
   }finally{
    if(timer)clearTimeout(timer);
    if(id===loadId){inFlight=false;loadId++;} // Quarantine late work from a timed-out request.
   }
  }
  if(allowed)void load();
  const renew=setInterval(()=>void load(),FAMILY_ALBUM_RENEW_MS);
  const expiry=setInterval(()=>{
   if(allowed&&current()&&!expired&&Date.now()>=deadline){
    expired=true;hide();setStatus('checking');
    setDiagnostic(`${lastFailure||'LIBRARY/LEASE/EXPIRED'} lease=EXPIRED ageMs=${Math.max(0,Date.now()-(deadline-FAMILY_ALBUM_LEASE_MS))}`);
    loadId++;inFlight=false;void load();
   }
  },250);
  return()=>{disposed=true;generation.current++;loadId++;clearInterval(renew);clearInterval(expiry);};
 },[allowed,retry]));
 if(!allowed)return null;
 return <View style={{gap:16}} testID="family-album-library">
  {status==='failed'?<><Text>{tr('家庭内容或资格已变化，请重新核对。')}</Text><Pressable accessibilityRole="button" onPress={()=>setRetry(value=>value+1)} style={{minHeight:48,justifyContent:'center'}}><Text>{tr('再试一次')}</Text></Pressable></>:null}
  {status==='checking'?<Text>{tr('正在重新核对家庭内容，请稍候。')}</Text>:null}
  {__DEV__&&diagnostic?<Text selectable testID="family-album-library-diagnostic" style={{...type.meta,color:inkSoft}}>{`开发诊断：${diagnostic}`}</Text>:null}
  {status==='ready'?<>
   {rows.length===0&&pending.length===0?<Text style={{...type.body,color:inkSoft}}>{tr('还没有家庭册，把家人的日子慢慢收在一起。')}</Text>:null}
   <View testID="family-album-cover-wall" onLayout={event=>setWallWidth(Math.round(event.nativeEvent.layout.width))} style={{flexDirection:'row',flexWrap:'wrap',alignItems:'flex-start',gap:ALBUM_COVER_WALL_GAP}}>
   {rows.map(album=><Pressable key={album.albumId} accessibilityRole="button" accessibilityLabel={`${album.name}，${tr('{0}条记录',[album.entryCount])}，${album.familyName}`} onPress={()=>router.push({pathname:'/family-albums',params:{familyId:album.familyId,albumId:album.albumId,mode:'read'}})} style={{width:layout.tileWidth,gap:6}}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{album.cover?<FamilyAlbumCoverPreview key={`${album.cover.shareId}/${album.cover.objectId}`} familyId={album.familyId} cover={album.cover} tile={{name:album.name,width:layout.tileWidth,height:layout.tileHeight}}/>:<AlbumCoverFace name={album.name} coverUri={null} width={layout.tileWidth} height={layout.tileHeight}/>}</View>
    <AlbumCoverMeta name={album.name} entryCount={album.entryCount}/>
    <Text style={{...type.meta,color:inkSoft}} numberOfLines={1}>{album.familyName}</Text>
   </Pressable>)}
   {canCreate?<AlbumCreateTile width={layout.tileWidth} height={layout.tileHeight} label={tr('新建家庭册')} testID="family-album-new" onPress={()=>router.push({pathname:'/family-albums',params:{mode:'new'}})}/>:null}
   </View>
   {pending.map(family=><Pressable key={family.familyId} accessibilityRole="button" onPress={()=>router.push({pathname:'/family-albums',params:{familyId:family.familyId,mode:'read'}})} style={{minHeight:48,justifyContent:'center'}}><Text style={{...type.meta,color:inkSoft}}>{tr('确认 {0} 的家庭册说明',[family.name||tr('未命名家庭')])}</Text></Pressable>)}
   {!canCreate?<Text style={{...type.meta,color:inkSoft}}>{tr('家庭创建者可以把分享收成一册。')}</Text>:null}
  </>:null}
 </View>;
}
