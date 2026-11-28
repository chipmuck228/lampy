import { useCallback, useRef, useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getFamilyUseCases } from '../application/container';
import type { ReportReceipt, UserBlock } from '../family-api/safety-types';
import { appLanguage, tr } from '../i18n';
import { SettingsPage } from './settings-chrome';
import { Text, type } from './life-text';
import { hairline, ink, inkSoft, sage } from './life-page';
import { useFamilyPrivateRequest } from './use-family-private-request';
import { reportReasonLabel, reportStatusLabel } from './family-safety-actions';
import {PageAction} from './quiet-form';
import { familySnapshotDate } from './family-history-copy';

type Block = UserBlock & { nickname: string };
function reportTime(value: string) {
 const date=new Date(value);
 return Number.isFinite(date.getTime())?date.toLocaleString(appLanguage==='en'?'en-US':'zh-CN'):tr('时间还没确定');
}
export default function AccountFamilySafetyScreen() {
 const router=useRouter();const {allowed,enter,leave,begin}=useFamilyPrivateRequest();
 const [blocks,setBlocks]=useState<Block[]>([]),[reports,setReports]=useState<ReportReceipt[]>([]);
 const [pending,setPending]=useState(false);
 const [restricted,setRestricted]=useState(false),[hiddenShares,setHiddenShares]=useState<string[]>([]);
 const [message,setMessage]=useState(''),[loaded,setLoaded]=useState(false);
 const busy=useRef(false),current=useRef<()=>boolean>(()=>false);
 const load=useCallback(async()=>{
  const check=begin();current.current=check;setBlocks([]);setReports([]);setRestricted(false);setHiddenShares([]);setLoaded(false);setMessage('');
  try{const app=await getFamilyUseCases();if(!check())return;const [b,r]=await Promise.all([app.safety.blocks(check),app.safety.reports(check)]);if(check()){setBlocks(b.blocks);setReports(r.reports);setRestricted(r.sharingRestricted===true);setHiddenShares(r.restrictedShares??[]);setLoaded(true);}}
  catch(e){if(check())setMessage(tr(e&&typeof e==='object'&&'code'in e&&e.code==='UNAUTHENTICATED'?'请先登录。':'这次没有完成，请稍后再试。'));}
 },[begin]);
 useFocusEffect(useCallback(()=>{enter();if(allowed)void load();return()=>{leave();setBlocks([]);setReports([]);setRestricted(false);setHiddenShares([]);setLoaded(false);};},[allowed,enter,leave,load]));
 function unblock(person:Block){
  const check=current.current;if(!check()||busy.current)return;
  Alert.alert(tr('解除对{0}的屏蔽？',[person.nickname||tr('家人')]),tr('解除后，可以重新查看这位家人仍在分享的记录。'),[
   {text:tr('取消'),style:'cancel'},
   {text:tr('解除屏蔽'),onPress:()=>{void(async()=>{
    if(!check()||busy.current)return;busy.current=true;setPending(true);
    try{const app=await getFamilyUseCases();if(!check())return;await app.safety.unblock(person.targetUserId,check);if(allowed)await load();}
    catch{if(check())setMessage(tr('这次没有完成，请稍后再试。'));}
    finally{busy.current=false;setPending(false);}
   })();}},
  ]);
 }
 return <SettingsPage title={tr('屏蔽与举报')} backLabel={tr('本机设置')} accessibilityLabel={tr('屏蔽与举报')} onBack={()=>router.dismissTo('/account')}>
  <View style={styles.content}>
  <Text style={styles.lead}>{tr('让家里的分享，保持自在。')}</Text>
  {!allowed?<Text style={styles.meta}>{tr('请先解锁，再继续。')}</Text>:<>
   {restricted?<Text style={styles.notice}>{tr('家庭分享暂不可用，已有记录仍可阅读。如有疑问，可以联系我们。')}</Text>:null}
   {hiddenShares.length?<Text style={styles.notice}>{tr('有{0}条分享暂不可见。如需了解原因，可以联系我们。',[hiddenShares.length])}</Text>:null}
   <View style={styles.heading}><Text style={styles.title} accessibilityRole="header">{tr('已屏蔽的家人')}</Text><Text style={styles.meta} testID="blocked-family-count">{loaded?blocks.length:'—'}</Text></View>
   <Text style={styles.meta}>{tr('屏蔽后，不再显示对方分享的家庭记录。')}</Text>
   {!loaded&&!message?<Text style={styles.meta}>{tr('正在读取。')}</Text>:null}
   {blocks.map(person=><View key={person.targetUserId} style={styles.member}>
     <Text style={styles.memberName}>{person.nickname||tr('家人')}</Text>
     <PageAction label={tr('解除屏蔽')} accessibilityLabel={tr('解除对{0}的屏蔽？',[person.nickname||tr('家人')])} testID={`blocked-family-${person.targetUserId}`} disabled={pending} onPress={()=>unblock(person)}/>
   </View>)}
   {loaded&&!blocks.length?<Text style={styles.empty}>{tr('没有屏蔽任何家人。')}</Text>:null}
   <Text style={[styles.title,styles.section]} accessibilityRole="header">{tr('我的举报')}</Text>
   <Text style={styles.meta}>{tr('在家庭记录中选择「举报」，可以在这里查看处理进展。')}</Text>
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
  </>}
  {message?<View style={styles.feedback}><Text accessibilityLiveRegion="polite" style={styles.meta}>{message}</Text>{allowed?<PageAction label={tr('再试一次')} disabled={pending} onPress={()=>{if(!busy.current)void load();}}/>:null}</View>:null}
  <View style={styles.support}>
    <Text style={styles.title} accessibilityRole="header">{tr('需要帮助？')}</Text>
    <Text style={styles.meta}>{tr('对处理结果有疑问，或需要其他帮助，欢迎联系我们。')}</Text>
    <PageAction label={tr('联系 Lampy')} onPress={()=>{void Linking.openURL('mailto:support@5sparks.ai').catch(()=>setMessage(tr('请发送邮件至 support@5sparks.ai。')));}}/>
    <Text style={styles.meta}>support@5sparks.ai</Text>
  </View>
  </View>
 </SettingsPage>;
}
const styles=StyleSheet.create({
 content:{paddingTop:28,paddingBottom:28,gap:12},lead:{...type.body,color:ink,marginBottom:12},
 body:{...type.body,color:ink},meta:{...type.meta,color:inkSoft},action:{...type.action,color:sage},title:{...type.action,color:ink},
 notice:{...type.body,color:inkSoft,borderLeftWidth:2,borderLeftColor:sage,paddingLeft:14,marginBottom:12},
 heading:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12},
 member:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',columnGap:16,paddingVertical:8,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:hairline},
 memberName:{...type.body,color:ink,flexShrink:1},empty:{...type.meta,color:inkSoft,paddingVertical:16},section:{marginTop:24},
 report:{paddingVertical:16,gap:6,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:hairline},
 support:{marginTop:28,paddingTop:24,gap:8,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:hairline},feedback:{gap:8},
});
