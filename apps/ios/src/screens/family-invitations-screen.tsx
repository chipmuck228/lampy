import { useCallback, useRef, useState } from 'react';
import { AppState, Image, Pressable, Share, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { getFamilyUseCases } from '../application/container';
import { isFamilyProductEntryOpen } from '../infrastructure/family-config';
import type { InviteLinkView } from '../family-api/types';
import { dateLabel, tr } from '../i18n';
import { useDeviceLock } from './device-lock-context';
import { SettingsPage } from './settings-chrome';
import { Text, type } from './life-text';
import { inkSoft, paperDeep, sage, hairline } from './life-page';
import { LifeIcon } from './life-icons';
import { familyInviteError } from './family-invite-copy';
import { readInviteShare, saveInviteShare, removeInviteShare } from '../infrastructure/secure-invite-share';
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
     user.current=account;setItems(result);setShares(cached);setReady(true);setMessage(null);
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
 return <SettingsPage accessibilityLabel={tr('邀请家人')} title={tr('邀请家人')} backLabel={tr('家庭')} onBack={()=>router.dismissTo('/family')}>
 {allowed ? <>
 <Text style={styles.intro}>{tr('有效7天，可加入1人。')}</Text>
 <Pressable testID="invite-create" style={styles.hit} accessibilityRole="button" disabled={!ready||busy} onPress={()=>void act()}><Text>{tr('生成一份邀请')}</Text></Pressable>
 <View style={styles.heading}><Text style={type.action}>{tr('邀请')}</Text>
 <Pressable testID="invite-refresh" style={styles.iconHit} accessibilityRole="button" accessibilityLabel={tr('刷新')} disabled={busy} onPress={()=>void load()}><LifeIcon name="refresh"/></Pressable></View>
 {message?<Text accessibilityLiveRegion="polite" style={styles.intro}>{message}</Text>:null}
 {loadError?<Pressable style={styles.hit} accessibilityRole="button" onPress={()=>void load()}><Text>{tr('重新加载')}</Text></Pressable>:null}
 {items.map(i=>{
 const active=i.status==='pending',open=expanded===i.invitationId,data=shares[i.invitationId];
 const status=tr(active?'可使用':i.status==='accepted'?'已使用':i.status==='expired'?'已过期':'已撤销');
 return <View key={i.invitationId} style={styles.row}>
 <Pressable testID={'invite-row-'+i.invitationId} style={styles.heading} accessibilityRole="button"
 accessibilityLabel={expiry(i.expiresAt)+'，'+status} accessibilityState={{expanded:open,disabled:busy}}
 disabled={busy} onPress={()=>setExpanded(open?null:i.invitationId)}>
 <View style={styles.summary}><LifeIcon name={active?'family':i.status==='accepted'?'check':i.status==='revoked'?'clear':'replay'} color={active?sage:inkSoft}/>
 <Text style={{...type.action,color:active?sage:inkSoft,opacity:active?1:0.6}}>{expiry(i.expiresAt)}</Text></View>
 <LifeIcon name={open?'collapse':'expand'} color={active?sage:inkSoft}/></Pressable>
 {open&&active?<View style={styles.detail}>
 {data?<><Image testID="created-invitation" source={{uri:data.qr}} style={{width:220,height:220,maxWidth:'100%'}} accessibilityLabel={tr('家庭邀请')}/>
 <Pressable style={styles.hit} accessibilityRole="button" disabled={busy||!ready} onPress={()=>void share(data)}><Text>{tr('分享')}</Text></Pressable></>:<Text style={styles.intro}>{tr('本机没有保存这份邀请。可撤销后另建一份。')}</Text>}
 <Pressable style={styles.hit} accessibilityRole="button" disabled={busy||!ready} onPress={()=>void act(i.invitationId)}><Text>{tr('撤销邀请')}</Text></Pressable>
 </View>:null}
 </View>;
 })}
 </>:<Text>{tr('邀请暂未开放。')}</Text>}
 </SettingsPage>;
}
const styles=StyleSheet.create({
 intro:{...type.meta,color:inkSoft,marginVertical:12},
 hit:{minHeight:48,justifyContent:'center',paddingHorizontal:16,backgroundColor:paperDeep,borderRadius:24,marginVertical:8,alignSelf:'flex-start'},
 iconHit:{minHeight:48,minWidth:48,alignItems:'center',justifyContent:'center'},
 heading:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},
 summary:{flexDirection:'row',alignItems:'center',gap:12,flexShrink:1},
 row:{paddingVertical:12,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:hairline},
 detail:{gap:12,paddingVertical:12},
});
