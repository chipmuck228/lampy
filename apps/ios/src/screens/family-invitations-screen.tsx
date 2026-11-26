import { useCallback, useRef, useState } from 'react';
import { AppState, Image, Platform, Pressable, Share, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { getFamilyUseCases } from '../application/container';
import { isFamilyProductEntryOpen } from '../infrastructure/family-config';
import type { InviteLinkView } from '../family-api/types';
import { appLanguage, dateLabel, tr } from '../i18n';
import { useDeviceLock } from './device-lock-context';
import { SettingsPage } from './settings-chrome';
import { Text, type } from './life-text';
import { ink, inkSoft, sage, hairline } from './life-page';
import { LifeIcon } from './life-icons';
import { familyInviteError } from './family-invite-copy';
import { readInviteShare, saveInviteShare, removeInviteShare } from '../infrastructure/secure-invite-share';
import {inviteImageSaveSupported,saveInviteImage} from '../infrastructure/save-invite-image';
type ShareData={link:string;qr:string};
function expiry(value:string) { const d=new Date(value); return dateLabel(d.getFullYear(),d.getMonth()+1,d.getDate()); }
export default function FamilyInvitationsScreen() {
 const router=useRouter();
 const {familyId}=useLocalSearchParams<{familyId:string}>();
 const lock=useDeviceLock();
 const allowed=isFamilyProductEntryOpen()&&!lock?.snapshot.locked;
 const [items,setItems]=useState<InviteLinkView[]>([]);
 const [expanded,setExpanded]=useState<string|null>(null);
 const [shares,setShares]=useState<Record<string,ShareData>>({});
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState<string|null>(null);
 const [checkedAt,setCheckedAt]=useState(()=>Date.now());
 const [ready,setReady]=useState(false);
 const [loadError,setLoadError]=useState(false);
 const seq=useRef(0),owner=useRef<number|null>(null),user=useRef<string|null>(null);
 const load=useCallback(async()=>{
   const n=++seq.current;setReady(false);setLoadError(false);setShares({});setExpanded(null);
   try {
     const u=await getFamilyUseCases();
     if(n!==seq.current)return;
     const account=await u.inviteLinkAccount();
     if(n!==seq.current)return;
     const result=await u.listInviteLinks(familyId);
     if(n!==seq.current)return;
     const cached:Record<string,ShareData>={};
     for(const i of result) {
       if(n!==seq.current)return;
       try {
         if(i.status==='pending') { const value=await readInviteShare(account,familyId,i.invitationId);if(value)cached[i.invitationId]=value; }
         else await removeInviteShare(account,familyId,i.invitationId);
       } catch { /* A cache failure never changes the server invitation status. */ }
     }
     if(n!==seq.current || await u.inviteLinkAccount()!==account)return;
     if(n!==seq.current)return;
     user.current=account;setItems(result);setShares(cached);setCheckedAt(Date.now());setReady(true);setMessage(null);
   } catch {if(n===seq.current){setLoadError(true);setMessage(tr('邀请暂时读不出来。'));}}
 },[familyId]);
 useFocusEffect(useCallback(()=>{
   if(allowed)void load();
   const sub=AppState.addEventListener('change',s=>{
     if(s==='background'){seq.current++;owner.current=null;user.current=null;setShares({});setExpanded(null);setBusy(false);setReady(false);}
     else if(s==='active'&&allowed)void load();
   });
   return ()=>{sub.remove();seq.current++;owner.current=null;user.current=null;setShares({});setItems([]);setExpanded(null);setBusy(false);setReady(false);};
 },[allowed,load]));
 async function act(id?:string) {
   if(!allowed||!ready||owner.current!==null||AppState.currentState!=='active')return;
   if(id&&!items.some(i=>i.invitationId===id&&i.status==='pending'))return;
   const n=seq.current;owner.current=n;setBusy(true);setMessage(null);
   const current=()=>n===seq.current&&AppState.currentState==='active';
   try {
     const u=await getFamilyUseCases();const account=await u.inviteLinkAccount();
     if(!current()||account!==user.current)return;
     if(id) {
       await u.revokeInviteLink(id,current);
       try{await removeInviteShare(account,familyId,id);}catch{}
       if(current())await load();
     }else{
       const result=await u.createInviteLink(familyId,current);
       if(!current())return;
       const data={link:result.link,qr:result.qr};
       // The account owns this key even if the screen leaves during the secure write.
       try{await saveInviteShare(account,familyId,result.invitationId,data);}catch{if(current())setMessage(tr('邀请已生成，但本机未能保存。请现在分享。'));}
       if(!current() || await u.inviteLinkAccount()!==account)return;
       if(!current())return;
       setShares(old=>({...old,[result.invitationId]:data}));
       setItems(old=>[result,...old]);setExpanded(result.invitationId);
     }
   }catch(e){if(current())setMessage(id?familyInviteError(e):tr('邀请未确认生成。请刷新查看，必要时撤销旧邀请后重新生成。'));}
   finally{if(owner.current===n){owner.current=null;setBusy(false);}}
 }
 async function share(data:ShareData) {
   const n=seq.current,account=user.current;
   if(!allowed||!ready||busy||AppState.currentState!=='active')return;
   try {
     const u=await getFamilyUseCases();
     if(await u.inviteLinkAccount()!==account||n!==seq.current||AppState.currentState!=='active')return;
     await Share.share({message:data.link});
   } catch {if(n===seq.current)setMessage(tr('暂时无法分享，请再试一次。'));}
 }
 async function saveImage(id:string,data:ShareData){
   if(!allowed||!ready||owner.current!==null||AppState.currentState!=='active'||!items.some(i=>i.invitationId===id&&i.status==='pending'&&Date.parse(i.expiresAt)>Date.now()))return;
   const n=seq.current,account=user.current;owner.current=n;setBusy(true);setMessage(null);
   const current=()=>n===seq.current&&AppState.currentState==='active';
   try{const app=await getFamilyUseCases();
     const saved=await saveInviteImage(data.qr,async()=>current()&&await app.inviteLinkAccount()===account&&current());
     if(current()&&saved)setMessage(tr('邀请图片已保存到相册。转发后，撤销邀请仍会使它失效。'));
   }catch(error){if(current())setMessage(tr(error&&typeof error==='object'&&'code'in error&&error.code==='INVITE_IMAGE_PERMISSION'?'未获得保存图片的权限。可在系统设置中允许添加照片，或直接分享邀请链接。':'本次未能保存邀请图片，请重试或分享邀请链接。'));}
   finally{if(owner.current===n){owner.current=null;setBusy(false);}}
 }
 return <SettingsPage accessibilityLabel={tr('邀请家人')} title={tr('邀请家人')} backLabel={tr('家庭')} onBack={()=>router.dismissTo('/family')}
 headerRight={allowed?<Pressable testID="invite-refresh" style={styles.iconHit} accessibilityRole="button" accessibilityLabel={tr('刷新')} accessibilityState={{disabled:busy}} disabled={busy} onPress={()=>void load()}><LifeIcon name="refresh" size={19}/></Pressable>:null}>
 {allowed ? <View style={styles.page}>
  <View style={styles.introduction}>
   <View style={styles.kicker}><LifeIcon name="family" size={17}/><Text style={styles.eyebrow}>{tr('给家人的邀请')}</Text></View>
   <Text accessibilityRole="header" style={styles.lead}>{tr('一起，留下日常。')}</Text>
   <Text style={styles.meta}>{tr('有效7天，可加入1人。')}</Text>
  </View>
  <Pressable testID="invite-create" style={[styles.create,busy||!ready?styles.disabled:null]} accessibilityRole="button" accessibilityState={{disabled:!ready||busy}} disabled={!ready||busy} onPress={()=>void act()}><LifeIcon name="plus" size={18}/><Text style={styles.action}>{tr('生成一份邀请')}</Text></Pressable>
  {message?<Text accessibilityLiveRegion="polite" style={styles.feedback}>{message}</Text>:null}
  {loadError?<Pressable style={styles.quietHit} accessibilityRole="button" onPress={()=>void load()}><Text style={styles.action}>{tr('重新加载')}</Text></Pressable>:null}
  {!ready&&!loadError?<Text accessibilityLiveRegion="polite" style={styles.meta}>{tr('正在读取邀请…')}</Text>:null}
  {ready&&!items.length?<View style={styles.empty}><View style={styles.shortRule}/><Text style={styles.emptyCopy}>{tr('生成后，可保存二维码或分享邀请链接。')}</Text></View>:null}
  {items.length?<View style={styles.sectionHeading}><Text style={styles.eyebrow}>{tr('邀请')}</Text><View style={styles.rule}/></View>:null}
  {items.map(i=>{
   const active=i.status==='pending'&&Date.parse(i.expiresAt)>checkedAt,open=expanded===i.invitationId,data=shares[i.invitationId];
   const status=tr(active?'可使用':i.status==='accepted'?'已使用':i.status==='expired'||i.status==='pending'?'已过期':'已撤销');
   return <View key={i.invitationId} style={styles.row}>
    <Pressable testID={'invite-row-'+i.invitationId} style={styles.heading} accessibilityRole="button"
     accessibilityLabel={expiry(i.expiresAt)+'，'+status} accessibilityState={{expanded:open,disabled:busy||!ready}}
     disabled={busy||!ready} onPress={()=>setExpanded(open?null:i.invitationId)}>
     <View style={styles.summary}><View style={styles.statusLine}><View accessible={false} style={[styles.statusDot,{backgroundColor:active?sage:inkSoft}]}/><Text style={[styles.status,{color:active?sage:inkSoft}]}>{status}</Text></View><Text style={styles.date}>{tr('有效期至 {0}',[expiry(i.expiresAt)])}</Text></View>
     <LifeIcon name={open?'collapse':'expand'} size={17} color={active?sage:inkSoft}/>
    </Pressable>
    {open&&active&&ready?<View style={styles.detail}>
     <View testID="invitation-letter" style={styles.letter}>
      <View pointerEvents="none" style={styles.binding}/>
      <View style={styles.letterBrand}><Image source={require('../../assets/images/splash-icon.png')} style={styles.mark} accessible={false}/><Text style={styles.brand}>Lampy</Text></View>
      {data?<View style={styles.qrPaper}><Image testID="created-invitation" source={{uri:data.qr}} resizeMode="contain" style={styles.qr} accessibilityLabel={tr('家庭邀请')}/></View>:<Text style={styles.missing}>{tr('本机没有保存这份邀请。可撤销后另建一份。')}</Text>}
      {data?<Text style={styles.caption}>{tr('扫描二维码，或将邀请分享给家人。')}</Text>:null}
      <View style={styles.letterRule}/>
      <Text style={styles.letterNote}>{tr('对方登录并确认后，才会加入家庭。')}</Text>
     </View>
     {data?<View style={styles.actionRow}>
      {inviteImageSaveSupported()?<Pressable testID={'invite-save-image-'+i.invitationId} style={[styles.saveHit,busy||!ready?styles.disabled:null]} accessibilityRole="button" accessibilityState={{disabled:busy||!ready}} disabled={busy||!ready} onPress={()=>void saveImage(i.invitationId,data)}><LifeIcon name="photo" size={18}/><Text style={styles.action}>{tr('保存到相册')}</Text></Pressable>:null}
      <Pressable style={[styles.shareHit,busy||!ready?styles.disabled:null]} accessibilityRole="button" accessibilityState={{disabled:busy||!ready}} disabled={busy||!ready} onPress={()=>void share(data)}><LifeIcon name="share" size={18} color="#FAF8F2"/><Text style={styles.shareLabel}>{tr('分享')}</Text></Pressable>
     </View>:null}
     <Pressable style={styles.revokeHit} accessibilityRole="button" accessibilityState={{disabled:busy||!ready}} disabled={busy||!ready} onPress={()=>void act(i.invitationId)}><Text style={styles.revokeLabel}>{tr('撤销邀请')}</Text></Pressable>
    </View>:null}
   </View>;
  })}
 </View>:<Text>{tr('邀请暂未开放。')}</Text>}
 </SettingsPage>;
}
const styles=StyleSheet.create({
 page:{paddingTop:28,paddingBottom:12},
 introduction:{gap:12,paddingBottom:12},
 kicker:{flexDirection:'row',alignItems:'center',gap:9},
 eyebrow:{fontSize:12,lineHeight:18,letterSpacing:appLanguage==='en'?1.4:.8,color:sage},
 lead:{fontFamily:appLanguage==='en'?Platform.select({ios:'Baskerville',android:'serif',default:'Georgia'}):undefined,fontSize:29,lineHeight:40,color:ink},
 meta:{...type.meta,color:inkSoft},
 action:{...type.action,color:sage},
 create:{minHeight:48,flexDirection:'row',gap:9,alignItems:'center',alignSelf:'flex-start',paddingVertical:12,marginBottom:16},
 disabled:{opacity:.45},
 iconHit:{minHeight:48,minWidth:44,alignItems:'center',justifyContent:'center'},
 quietHit:{minHeight:48,justifyContent:'center',alignSelf:'flex-start'},
 feedback:{...type.meta,color:inkSoft,paddingVertical:12},
 empty:{paddingTop:24,paddingBottom:36,gap:18},
 shortRule:{width:36,height:StyleSheet.hairlineWidth,backgroundColor:sage},
 emptyCopy:{...type.meta,color:inkSoft,maxWidth:280},
 sectionHeading:{flexDirection:'row',alignItems:'center',gap:14,paddingBottom:4},
 rule:{height:StyleSheet.hairlineWidth,backgroundColor:hairline,flex:1},
 row:{borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:hairline},
 heading:{minHeight:72,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,paddingVertical:12},
 summary:{gap:4,flexShrink:1},
 statusLine:{flexDirection:'row',alignItems:'center',gap:7},
 statusDot:{width:4,height:4,borderRadius:2},
 status:{fontSize:12,lineHeight:18,letterSpacing:.4},
 date:{...type.meta,color:inkSoft,flexShrink:1},
 detail:{paddingBottom:12},
 letter:{backgroundColor:'#FAF8F2',alignItems:'center',paddingHorizontal:20,paddingTop:20,paddingBottom:20,borderTopWidth:StyleSheet.hairlineWidth,borderBottomWidth:StyleSheet.hairlineWidth,borderColor:hairline},
 binding:{position:'absolute',left:0,top:0,bottom:0,width:2,backgroundColor:sage,opacity:.65},
 letterBrand:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:16},
 mark:{width:23,height:23,resizeMode:'contain'},
 brand:{fontFamily:Platform.select({ios:'Baskerville',android:'serif',default:'Georgia'}),fontSize:19,lineHeight:28,letterSpacing:.6,color:sage},
 qrPaper:{width:'100%',maxWidth:256,padding:14,backgroundColor:'#FFFFFF'},
 qr:{width:'100%',aspectRatio:1},
 caption:{fontSize:13,lineHeight:22,color:inkSoft,textAlign:'center',marginTop:14},
 missing:{...type.meta,color:inkSoft,textAlign:'center',paddingVertical:30},
 letterRule:{width:28,height:StyleSheet.hairlineWidth,backgroundColor:hairline,marginTop:18,marginBottom:12},
 letterNote:{fontSize:12,lineHeight:20,color:inkSoft,textAlign:'center'},
 actionRow:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'center',gap:12,paddingTop:16},
 saveHit:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,paddingHorizontal:10,paddingVertical:10,flexShrink:1},
 shareHit:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,paddingHorizontal:22,paddingVertical:12,borderRadius:28,backgroundColor:sage,flexShrink:1},
 shareLabel:{...type.action,color:'#FAF8F2'},
 revokeHit:{minHeight:48,alignSelf:'center',justifyContent:'center',paddingHorizontal:18,marginTop:8},
 revokeLabel:{fontSize:13,lineHeight:20,color:inkSoft},
});
