import {useCallback,useState} from 'react';
import {Pressable,View} from 'react-native';
import {Image} from 'expo-image';
import {useFocusEffect} from 'expo-router';
import {getFamilyUseCases} from '../application/container';
import type {FamilyAlbumCover,FamilyAlbumMutation,FamilyAlbumView} from '../family-api/family-album-types';
import {Text,TextInput,type} from './life-text';
import {ink,inkSoft,sage,hairline} from './life-page';
import {tr} from '../i18n';
export function FamilyAlbumEditor({book,busy,onSave,onCancel}:{book:FamilyAlbumView;busy:boolean;onSave:(change:FamilyAlbumMutation)=>void;onCancel:()=>void}){
 const [name,setName]=useState(book.name),[opening,setOpening]=useState(book.opening??'');
 const [choice,setChoice]=useState<FamilyAlbumCover|null>(book.coverChoice??null);
 const candidates=book.items.flatMap(item=>item.status==='active'?item.share.snapshot.media.filter(media=>media.mimeType.startsWith('image/')).map((media,index)=>({shareId:item.shareId,objectId:media.objectId,label:`${item.share.authorNickname||tr('家人')} · ${tr('照片 {0}',[index+1])}`})):[]);
 const preview=choice??(candidates[0]?{shareId:candidates[0].shareId,objectId:candidates[0].objectId}:null);
 return <View testID="family-album-editor" style={{gap:12,paddingVertical:20,borderTopWidth:1,borderTopColor:hairline}}>
  <Text style={{...type.action,color:ink}}>{tr('册名')}</Text><TextInput accessibilityLabel={tr('册名')} value={name} onChangeText={setName} maxLength={200} editable={!busy} style={{...type.body,color:ink,minHeight:48}}/>
  <Text style={{...type.action,color:ink}}>{tr('开篇')}</Text><TextInput accessibilityLabel={tr('开篇')} value={opening} onChangeText={setOpening} maxLength={20000} multiline editable={!busy} style={{...type.body,color:ink,minHeight:96}}/>
  <Text style={{...type.action,color:ink}}>{tr('封面')}</Text>
  {preview?<FamilyAlbumCoverPreview key={`${preview.shareId}/${preview.objectId}`} familyId={book.familyId} cover={preview}/>:null}
  <Pressable accessibilityRole="button" accessibilityState={{selected:choice===null,disabled:busy}} disabled={busy} onPress={()=>setChoice(null)} style={{minHeight:48,justifyContent:'center'}}><Text style={{...type.action,color:sage}}>{choice===null?'✓ ':''}{tr('自动封面')}</Text></Pressable>
  {candidates.map(candidate=><Pressable key={`${candidate.shareId}/${candidate.objectId}`} accessibilityRole="button" accessibilityLabel={`${tr('选这张照片做封面')} · ${candidate.label}`} accessibilityState={{selected:choice?.shareId===candidate.shareId&&choice.objectId===candidate.objectId,disabled:busy}} disabled={busy} onPress={()=>setChoice({shareId:candidate.shareId,objectId:candidate.objectId})} style={{minHeight:48,justifyContent:'center'}}><Text style={{...type.action,color:inkSoft}}>{choice?.shareId===candidate.shareId&&choice.objectId===candidate.objectId?'✓ ':''}{candidate.label}</Text></Pressable>)}
  <Pressable accessibilityRole="button" disabled={busy||!name.trim()} onPress={()=>onSave({kind:'edit',name,opening:opening||null,coverChoice:choice})} style={{minHeight:48,justifyContent:'center'}}><Text style={{...type.action,color:sage}}>{tr('保存修改')}</Text></Pressable>
  <Pressable accessibilityRole="button" disabled={busy} onPress={onCancel} style={{minHeight:48,justifyContent:'center'}}><Text style={{...type.action,color:inkSoft}}>{tr('取消')}</Text></Pressable>
 </View>;
}
// The parent album read lease unmounts this preview on withdrawal, expiry or loss of access.
export function FamilyAlbumCoverPreview({familyId,cover}:{familyId:string;cover:FamilyAlbumCover}){
 const [uri,setUri]=useState<string|null>(null);
 useFocusEffect(useCallback(()=>{
  let current=true;setUri(null);
  void (async()=>{try{const app=await getFamilyUseCases();const read=await app.history.read(familyId,cover.shareId,()=>current);if(current)setUri(read.media.find(media=>media.objectId===cover.objectId)?.uri??null);}catch{if(current)setUri(null);}})();
  return()=>{current=false;setUri(null);};
 },[familyId,cover.shareId,cover.objectId]));
 return uri?<Image accessibilityLabel={tr('家庭照片')} source={{uri}} cachePolicy="none" contentFit="contain" style={{width:'100%',height:180}}/>:null;
}
