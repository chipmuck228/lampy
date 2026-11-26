import {LifeIcon} from './life-icons';
import {familySafetyGeneration,subscribeFamilySafety} from '../application/family-safety-events';
import {ALBUM_COVER_RADIUS} from './album-cover-wall';
import {LampyPhotoPlaceholder,useGentlePhotoMotion} from './lampy-photo-placeholder';
import { AlbumEditorFields } from './album-workflow-controls';
import {normalizeAlbumName} from '../application/life-album';
import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Pressable,StyleSheet,View} from 'react-native';
import {Image} from 'expo-image';
import {useFocusEffect} from 'expo-router';
import {getFamilyUseCases} from '../application/container';
import type {FamilyAlbumCover,FamilyAlbumMutation,FamilyAlbumView} from '../family-api/family-album-types';
import {Text,type} from './life-text';
import {ink,sage,hairline,paperDeep} from './life-page';
import {tr} from '../i18n';
export function FamilyAlbumEditor({book,busy,onSave}:{book:FamilyAlbumView;busy:boolean;onSave:(change:FamilyAlbumMutation)=>void}){
 const [name,setName]=useState(book.name),[opening,setOpening]=useState(book.opening??'');
 const [choice,setChoice]=useState<FamilyAlbumCover|null>(book.coverChoice??null);
 const candidates=book.items.flatMap(item=>item.status==='active'?item.share.snapshot.media.filter(media=>media.mimeType.startsWith('image/')).map((media,index)=>({shareId:item.shareId,objectId:media.objectId,label:`${item.share.authorNickname||tr('家人')} · ${tr('照片 {0}',[index+1])}`})):[]);
 const preview=choice??(candidates[0]?{shareId:candidates[0].shareId,objectId:candidates[0].objectId}:null);
 return <View testID="family-album-editor" style={{gap:12,paddingVertical:20,borderTopWidth:1,borderTopColor:hairline}}>
  <AlbumEditorFields prefix="family-album-manage" name={name} opening={opening} busy={busy} onName={setName} onOpening={setOpening} maxName={200} maxOpening={20000} onSaveName={()=>{const saved=normalizeAlbumName(name);setName(saved);onSave({kind:'rename',name:saved,opening:book.opening});}} onSaveOpening={()=>onSave({kind:'rename',name:book.name,opening:opening||null})}/>
  <Text style={{...type.action,color:ink}}>{tr('封面')}</Text>
  {preview?<FamilyAlbumCoverPreview key={`${preview.shareId}/${preview.objectId}`} familyId={book.familyId} cover={preview}/>:null}
  <Pressable accessibilityRole="button" accessibilityState={{selected:choice===null,disabled:busy}} disabled={busy} onPress={()=>{setChoice(null);onSave({kind:'edit',name:book.name,opening:book.opening,coverChoice:null});}} style={{minHeight:48,justifyContent:'center'}}><Text style={{...type.action,color:sage}}>{choice===null?'✓ ':''}{tr('自动封面')}</Text></Pressable>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{candidates.map(candidate=><Pressable key={`${candidate.shareId}/${candidate.objectId}`} accessibilityRole="button" accessibilityLabel={`${tr('选这张照片做封面')} · ${candidate.label}`} accessibilityState={{selected:choice?.shareId===candidate.shareId&&choice.objectId===candidate.objectId,disabled:busy}} disabled={busy} onPress={()=>{const coverChoice={shareId:candidate.shareId,objectId:candidate.objectId};setChoice(coverChoice);onSave({kind:'edit',name:book.name,opening:book.opening,coverChoice});}} style={{width:72,height:72,overflow:'hidden',borderRadius:6,borderWidth:choice?.shareId===candidate.shareId&&choice.objectId===candidate.objectId?2:0,borderColor:sage}}><FamilyAlbumCoverPreview familyId={book.familyId} cover={candidate} fill/>{choice?.shareId===candidate.shareId&&choice.objectId===candidate.objectId?<View style={{position:'absolute',right:2,bottom:2,backgroundColor:'#FAF9F5',borderRadius:12}}><LifeIcon name="check" size={20}/></View>:null}</Pressable>)}</View>
 </View>;
}
// The parent hides the photo on lease expiry; this local request is invalidated on blur/safety changes.
export const FAMILY_PHOTO_READY_TIMEOUT_MS=15000;
export function FamilyAlbumCoverPreview({familyId,cover,compact=false,tile,fill=false}:{familyId:string;cover:FamilyAlbumCover;compact?:boolean;fill?:boolean;tile?:{name:string;width:number;height:number}}){
 const [safety,setSafety]=useState(familySafetyGeneration);
 const key=`${familyId}/${cover.shareId}/${cover.objectId}/${safety}`;
 const latestKey=useRef(key);useLayoutEffect(()=>{latestKey.current=key;},[key]);
 const request=useRef<{valid:()=>boolean;stop:()=>void}|null>(null);
 const [photo,setPhoto]=useState<{key:string;uri:string|null;phase:'loading'|'ready'|'failed'}>({key,uri:null,phase:'loading'});
 const [focused,setFocused]=useState(false);
 const motionAllowed=useGentlePhotoMotion();const animate=motionAllowed&&focused;
 useEffect(()=>subscribeFamilySafety(()=>{request.current?.stop();setPhoto({key:'',uri:null,phase:'loading'});setSafety(familySafetyGeneration());}),[]);
 useFocusEffect(useCallback(()=>{
  let active=true,expired=false;setFocused(true);
  const valid=()=>active&&!expired&&latestKey.current===key&&familySafetyGeneration()===safety;
  const timeout=setTimeout(()=>{if(valid()){expired=true;setPhoto({key,uri:null,phase:'failed'});}},FAMILY_PHOTO_READY_TIMEOUT_MS);
  const stop=()=>{active=false;clearTimeout(timeout);};
  request.current={valid,stop};setPhoto({key,uri:null,phase:'loading'});
  void (async()=>{try{
   const app=await getFamilyUseCases();const read=await app.history.read(familyId,cover.shareId,valid,cover.objectId);
   if(!valid())return;
   const uri=read.media.find(media=>media.objectId===cover.objectId)?.uri??null;
   if(!uri){clearTimeout(timeout);expired=true;setPhoto({key,uri:null,phase:'failed'});return;}
   setPhoto({key,uri,phase:'loading'});
  }catch{if(valid()){clearTimeout(timeout);expired=true;setPhoto({key,uri:null,phase:'failed'});}}})();
  return()=>{stop();request.current=null;setFocused(false);setPhoto({key,uri:null,phase:'loading'});};
 },[familyId,cover.shareId,cover.objectId,safety,key]));
 const visible=photo.key===key?photo:{key,uri:null,phase:'loading' as const};
 function displayed(){
  if(latestKey.current!==key||!request.current?.valid())return;
  // The effect owns the timeout; stopping this request also quarantines duplicate/late image callbacks.
  request.current.stop();
  setPhoto(previous=>previous.key===key&&previous.uri===visible.uri?{...previous,phase:'ready'}:previous);
 }
 function failed(){
  if(latestKey.current!==key||!request.current?.valid())return;
  request.current.stop();setPhoto({key,uri:null,phase:'failed'});
 }
 const frame=tile?{width:tile.width,height:tile.height,borderRadius:ALBUM_COVER_RADIUS,overflow:'hidden' as const,borderWidth:StyleSheet.hairlineWidth,borderColor:hairline,backgroundColor:paperDeep}:fill?StyleSheet.absoluteFill:compact?{width:72,height:96}:{width:'100%' as const,height:180};
 return <View style={frame} testID="family-photo-frame">
   {visible.uri?<Image key={`${key}/${visible.uri}`} accessibilityLabel={tr('家庭照片')} source={{uri:visible.uri}}
     cachePolicy="none" contentFit={fill||compact||tile?'cover':'contain'} style={StyleSheet.absoluteFill}
     transition={animate?{duration:320,effect:'cross-dissolve'}:0} onLoad={displayed} onDisplay={displayed} onError={failed}/>:null}
   {visible.phase!=='ready'?<LampyPhotoPlaceholder loading={visible.phase==='loading'} animate={animate}/>:null}
 </View>;
}
