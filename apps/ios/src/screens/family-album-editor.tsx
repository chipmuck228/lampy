import {familySafetyGeneration,subscribeFamilySafety} from '../application/family-safety-events';
import {AlbumCoverFace} from './album-cover-tile';
import { AlbumEditorFields } from './album-workflow-controls';
import {normalizeAlbumName} from '../application/life-album';
import {useCallback,useEffect,useState} from 'react';
import {Pressable,View} from 'react-native';
import {Image} from 'expo-image';
import {useFocusEffect} from 'expo-router';
import {getFamilyUseCases} from '../application/container';
import type {FamilyAlbumCover,FamilyAlbumMutation,FamilyAlbumView} from '../family-api/family-album-types';
import {Text,type} from './life-text';
import {ink,inkSoft,sage,hairline} from './life-page';
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
  {candidates.map(candidate=><Pressable key={`${candidate.shareId}/${candidate.objectId}`} accessibilityRole="button" accessibilityLabel={`${tr('选这张照片做封面')} · ${candidate.label}`} accessibilityState={{selected:choice?.shareId===candidate.shareId&&choice.objectId===candidate.objectId,disabled:busy}} disabled={busy} onPress={()=>{const coverChoice={shareId:candidate.shareId,objectId:candidate.objectId};setChoice(coverChoice);onSave({kind:'edit',name:book.name,opening:book.opening,coverChoice});}} style={{minHeight:48,justifyContent:'center'}}><Text style={{...type.action,color:inkSoft}}>{choice?.shareId===candidate.shareId&&choice.objectId===candidate.objectId?'✓ ':''}{candidate.label}</Text></Pressable>)}
 </View>;
}
// The parent hides this preview on expiry and unmounts it on withdrawal or loss of access.
export function FamilyAlbumCoverPreview({familyId,cover,compact=false,tile}:{familyId:string;cover:FamilyAlbumCover;compact?:boolean;tile?:{name:string;width:number;height:number}}){
 const [uri,setUri]=useState<string|null>(null);
 const [safety,setSafety]=useState(familySafetyGeneration);
 useEffect(()=>subscribeFamilySafety(()=>{setUri(null);setSafety(familySafetyGeneration());}),[]);
 useFocusEffect(useCallback(()=>{
  let current=true;const valid=()=>current&&familySafetyGeneration()===safety;setUri(null);
  void (async()=>{try{const app=await getFamilyUseCases();const read=await app.history.read(familyId,cover.shareId,valid,cover.objectId);if(valid())setUri(read.media.find(media=>media.objectId===cover.objectId)?.uri??null);}catch{if(valid())setUri(null);}})();
  return()=>{current=false;setUri(null);};
 },[familyId,cover.shareId,cover.objectId,safety]));
 if(tile)return <AlbumCoverFace name={tile.name} coverUri={uri} width={tile.width} height={tile.height} privateMedia showWordsFallback={false}/>;
 return uri?<Image accessibilityLabel={tr('家庭照片')} source={{uri}} cachePolicy="none" contentFit={compact?'cover':'contain'} style={compact?{width:72,height:96}:{width:'100%',height:180}}/>:null;
}
