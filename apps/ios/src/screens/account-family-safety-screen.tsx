import { useCallback, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getFamilyUseCases } from '../application/container';
import type { ReportReceipt, UserBlock } from '../family-api/safety-types';
import { appLanguage, tr } from '../i18n';
import { SettingsPage } from './settings-chrome';
import { Text, type } from './life-text';
import { hairline, ink, inkSoft, paperDeep, sage } from './life-page';
import { useFamilyPrivateRequest } from './use-family-private-request';
import { reportReasonLabel, reportStatusLabel } from './family-safety-actions';
import { familySnapshotDate } from './family-history-copy';

type Block = UserBlock & { nickname: string };
function reportTime(value: string) {
 const date=new Date(value);
 return Number.isFinite(date.getTime())?date.toLocaleString(appLanguage==='en'?'en-US':'zh-CN'):tr('时间还没确定');
}
export default function AccountFamilySafetyScreen() {
 const router=useRouter();const {allowed,enter,leave,begin}=useFamilyPrivateRequest();
 const [blocks,setBlocks]=useState<Block[]>([]),[reports,setReports]=useState<ReportReceipt[]>([]);
 const [selected,setSelected]=useState<string|null>(null),[pending,setPending]=useState(false);
 const [restricted,setRestricted]=useState(false),[hiddenShares,setHiddenShares]=useState<string[]>([]);
 const [message,setMessage]=useState(''),[loaded,setLoaded]=useState(false);
 const busy=useRef(false),current=useRef<()=>boolean>(()=>false);
 const load=useCallback(async()=>{
  const check=begin();current.current=check;setBlocks([]);setReports([]);setSelected(null);setRestricted(false);setHiddenShares([]);setLoaded(false);setMessage('');
  try{const app=await getFamilyUseCases();if(!check())return;const [b,r]=await Promise.all([app.safety.blocks(check),app.safety.reports(check)]);if(check()){setBlocks(b.blocks);setReports(r.reports);setRestricted(r.sharingRestricted===true);setHiddenShares(r.restrictedShares??[]);setLoaded(true);}}
  catch(e){if(check())setMessage(tr(e&&typeof e==='object'&&'code'in e&&e.code==='UNAUTHENTICATED'?'请先登录。':'这次没有完成，请稍后再试。'));}
 },[begin]);
 useFocusEffect(useCallback(()=>{enter();if(allowed)void load();return()=>{leave();setBlocks([]);setReports([]);setSelected(null);setRestricted(false);setHiddenShares([]);setLoaded(false);};},[allowed,enter,leave,load]));
 const target=blocks.find(b=>b.targetUserId===selected);
 function unblock(person:Block){
  const check=current.current;if(!check()||busy.current)return;
  Alert.alert(tr('解除对{0}的屏蔽？',[person.nickname||tr('家人')]),tr('只解除这位家人的屏蔽。重新联网核验后，会恢复仍可阅读的内容；已撤回或被限制的内容不会恢复。'),[
   {text:tr('取消'),style:'cancel'},
   {text:tr('解除屏蔽'),onPress:()=>{void(async()=>{
    if(!check()||busy.current)return;busy.current=true;setPending(true);
    try{const app=await getFamilyUseCases();if(!check())return;await app.safety.unblock(person.targetUserId,check);if(allowed)await load();}
    catch{if(check())setMessage(tr('这次没有完成，请稍后再试。'));}
    finally{busy.current=false;setPending(false);}
   })();}},
  ]);
 }
 return <SettingsPage title={tr('家庭内容')} backLabel={tr('本机设置')} accessibilityLabel={tr('家庭内容')} onBack={()=>router.dismissTo('/account')}>
  <Text style={styles.meta}>{tr('开发者每天查看举报。如需帮助或申诉，')}</Text>
  <View style={styles.contact}><Text style={styles.meta}>{tr('请联系：')}<Text accessibilityRole="link" style={styles.action} onPress={()=>{void Linking.openURL('mailto:dev@yunpura.com').catch(()=>setMessage(tr('请发送邮件至 dev@yunpura.com。')));}}>dev@yunpura.com</Text></Text></View>
  {allowed?<>
   {restricted?<Text style={styles.body}>{tr('此账号暂时不能新增家庭分享。已有记录仍可阅读，如有疑问请联系 dev@yunpura.com。')}</Text>:null}
   {hiddenShares.length?<Text style={styles.body}>{tr('有{0}条家庭分享因内容规则被限制。如有异议，请联系 dev@yunpura.com。',[hiddenShares.length])}</Text>:null}
   <View style={styles.heading}><Text style={styles.title}>{tr('已屏蔽的家人')}</Text><View style={styles.count}><Text style={styles.meta} testID="blocked-family-count">{loaded?blocks.length:'—'}</Text></View></View>
   <View style={styles.chips}>{blocks.map(b=><Pressable key={b.targetUserId} testID={`blocked-family-${b.targetUserId}`} accessibilityRole="button" accessibilityLabel={tr('选择家人：{0}',[b.nickname||tr('家人')])} accessibilityState={{selected:selected===b.targetUserId,disabled:pending}} disabled={pending} onPress={()=>{if(current.current()&&!busy.current)setSelected(selected===b.targetUserId?null:b.targetUserId);}} style={[styles.chip,selected===b.targetUserId&&styles.selected]}><Text style={styles.body}>{b.nickname||tr('家人')}</Text></Pressable>)}</View>
   {blocks.length?<Text style={styles.meta}>{tr('选择一位家人，再解除屏蔽。每次只影响所选家人。')}</Text>:null}
   {target?<Pressable accessibilityRole="button" accessibilityState={{disabled:pending}} disabled={pending} style={styles.hit} onPress={()=>unblock(target)}><Text style={styles.action}>{tr('解除所选家人的屏蔽')}</Text></Pressable>:null}
   {loaded&&!blocks.length?<Text style={styles.meta}>{tr('没有屏蔽任何家人。')}</Text>:null}
   <Text style={[styles.title,{marginTop:32}]}>{tr('我的举报')}</Text>
   {reports.map(r=><View key={r.reportId} style={styles.report}>
    <Text style={styles.body}>{r.summary?tr('{0}分享的记录',[r.summary.authorNickname||tr('家人')]):tr('家庭记录（目前不可用）')}</Text>
    {r.summary?<>
     <Text style={styles.meta}>{r.summary.familyName||tr('未命名家庭')} · {familySnapshotDate(r.summary)}</Text>
     <Text style={styles.meta}>{tr('照片{0}张 · 声音{1}段',[r.summary.photoCount,r.summary.soundCount])}</Text>
    </>:null}
    <Text style={styles.meta}>{reportReasonLabel(r.reason)} · {reportStatusLabel(r.status)}</Text>
    <Text style={styles.meta}>{tr('举报于{0}',[reportTime(r.createdAt)])}</Text>
   </View>)}
   {loaded&&!reports.length?<Text style={styles.meta}>{tr('没有提交过举报。')}</Text>:null}
  </>:null}
  {message?<><Text style={styles.meta}>{message}</Text>{allowed?<Pressable accessibilityRole="button" style={styles.hit} disabled={pending} onPress={()=>{if(!busy.current)void load();}}><Text style={styles.action}>{tr('再试一次')}</Text></Pressable>:null}</>:null}
 </SettingsPage>;
}
const styles=StyleSheet.create({
 body:{...type.body,color:ink},meta:{...type.meta,color:inkSoft},action:{...type.action,color:sage},title:{...type.action,color:ink},
 contact:{minHeight:48,justifyContent:'center'},heading:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12,marginTop:16},
 count:{minWidth:32,minHeight:28,borderRadius:16,paddingHorizontal:10,alignItems:'center',justifyContent:'center',backgroundColor:paperDeep},
 chips:{flexDirection:'row',flexWrap:'wrap',gap:10,marginVertical:14},chip:{minHeight:48,maxWidth:'100%',paddingVertical:7,paddingHorizontal:16,borderRadius:24,borderWidth:1,borderColor:hairline,backgroundColor:paperDeep,justifyContent:'center'},selected:{borderColor:sage,borderWidth:2},
 hit:{minHeight:48,justifyContent:'center'},report:{paddingVertical:16,gap:6,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:hairline},
});
