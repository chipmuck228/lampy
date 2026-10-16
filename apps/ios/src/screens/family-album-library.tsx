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
type Row=FamilyAlbumSummary & {familyName:string};
// This panel lives inside the same list page as personal albums. Nothing is persisted.
export function FamilyAlbumLibrary(){
 const router=useRouter(),lock=useDeviceLock();
 const [wallWidth,setWallWidth]=useState<number|null>(null);const layout=albumCoverWallLayout(wallWidth);
 const [foreground,setForeground]=useState(AppState.currentState==='active');
 const [rows,setRows]=useState<Row[]>([]),[pending,setPending]=useState<FamilySummary[]>([]);
 const [status,setStatus]=useState<'loading'|'ready'|'failed'>('loading');
 const [canCreate,setCanCreate]=useState(false),[retry,setRetry]=useState(0);
 const generation=useRef(0);const allowed=foreground&&!lock?.snapshot.locked;
 useEffect(()=>{const listener=AppState.addEventListener('change',state=>{if(state!=='active')generation.current++;setForeground(state==='active');});return()=>listener.remove();},[]);
 useFocusEffect(useCallback(()=>{
  void retry;
  let disposed=false,inFlight=false;const epoch=++generation.current;let deadline=Date.now()+FAMILY_ALBUM_LEASE_MS;
  const current=()=>!disposed&&generation.current===epoch;
  const hide=()=>{setRows([]);setPending([]);setCanCreate(false);};
  hide();setStatus('loading');
  async function load(){
   if(!allowed||inFlight||!current())return;inFlight=true;const started=Date.now();
   try{
    const app=await getFamilyUseCases();const directory=await app.getFamilies(current);
    const result=await Promise.all(directory.families.map(async family=>{
     const access=await app.albums.access(family.familyId);
     if(access.userId!==directory.userId)throw new Error('account changed');
     if(!access.rulesAcknowledged)return {family,albums:[],pending:true};
     const list=await app.albums.list(family.familyId);if(list.access.userId!==directory.userId)throw new Error('account changed');return {family,albums:list.albums,pending:false};
    }));
    if(!current())return;if(Date.now()-started>=FAMILY_ALBUM_LEASE_MS)throw new Error('expired');
    deadline=started+FAMILY_ALBUM_LEASE_MS;
    setRows(result.flatMap(({family,albums})=>albums.map(album=>({...album,familyName:family.name||tr('未命名家庭')}))));
    setPending(result.filter(item=>item.pending).map(item=>item.family));
    setCanCreate(directory.families.some(family=>family.role==='creator'));setStatus('ready');
   }catch{if(current()){generation.current++;hide();setStatus('failed');}}finally{inFlight=false;}
  }
  if(allowed)void load();
  const renew=setInterval(()=>void load(),FAMILY_ALBUM_RENEW_MS);
  const expiry=setInterval(()=>{if(allowed&&current()&&Date.now()>deadline){generation.current++;hide();setStatus('failed');}},250);
  return()=>{disposed=true;generation.current++;clearInterval(renew);clearInterval(expiry);};
 },[allowed,retry]));
 if(!allowed)return null;
 return <View style={{gap:16}} testID="family-album-library">
  {status==='loading'?<Text style={{...type.meta,color:inkSoft}}>{tr('正在读取家庭册。')}</Text>:null}
  {status==='failed'?<><Text>{tr('家庭内容或资格已变化，请重新核对。')}</Text><Pressable accessibilityRole="button" onPress={()=>setRetry(value=>value+1)} style={{minHeight:48,justifyContent:'center'}}><Text>{tr('再试一次')}</Text></Pressable></>:null}
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
