import { useCallback, useRef, useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getFamilyUseCases } from '../application/container';
import type { ReportReceipt, UserBlock } from '../family-api/safety-types';
import { tr } from '../i18n';
import { SettingsPage } from './settings-chrome';
import { Text, type } from './life-text';
import { ink, inkSoft, sage } from './life-page';
import { useFamilyPrivateRequest } from './use-family-private-request';
import { reportReasonLabel, reportStatusLabel } from './family-safety-actions';
export default function AccountFamilySafetyScreen() {
 const router=useRouter();const {allowed,enter,leave,begin}=useFamilyPrivateRequest();
 const [blocks,setBlocks]=useState<(UserBlock & {nickname:string})[]>([]),[reports,setReports]=useState<ReportReceipt[]>([]);
 const [restricted,setRestricted]=useState(false),[hiddenShares,setHiddenShares]=useState<string[]>([]);
 const [message,setMessage]=useState(''),[loaded,setLoaded]=useState(false);const busy=useRef(false),current=useRef<()=>boolean>(()=>false);
 const load=useCallback(async()=>{
  const check=begin();current.current=check;setBlocks([]);setReports([]);setRestricted(false);setHiddenShares([]);setLoaded(false);setMessage('');
  try{const app=await getFamilyUseCases();if(!check())return;const [b,r]=await Promise.all([app.safety.blocks(check),app.safety.reports(check)]);if(check()){setBlocks(b.blocks);setReports(r.reports);setRestricted(r.sharingRestricted===true);setHiddenShares(r.restrictedShares??[]);setLoaded(true);}}
  catch(e){if(check())setMessage(tr(e&&typeof e==='object'&&'code'in e&&e.code==='UNAUTHENTICATED'?'请先登录。':'这次没有完成，请稍后再试。'));}
 },[begin]);
 useFocusEffect(useCallback(()=>{enter();if(allowed)void load();return()=>{leave();setBlocks([]);setReports([]);setRestricted(false);setHiddenShares([]);setLoaded(false);};},[allowed,enter,leave,load]));
 function unblock(target:string){const check=current.current;if(!check()||busy.current)return;Alert.alert(tr('解除屏蔽？'),tr('重新联网核验后，会恢复仍可阅读的内容。已撤回或被限制的内容不会恢复。'),[{text:tr('取消'),style:'cancel'},{text:tr('解除屏蔽'),onPress:()=>{void(async()=>{if(!check()||busy.current)return;busy.current=true;try{const app=await getFamilyUseCases();if(!check())return;await app.safety.unblock(target,check);if(allowed)await load();}catch{if(check())setMessage(tr('这次没有完成，请稍后再试。'));}finally{busy.current=false;}})();}}]);}
 return <SettingsPage title={tr('家庭内容')} backLabel={tr('本机设置')} accessibilityLabel={tr('家庭内容')} onBack={()=>router.dismissTo('/account')}>
  <Text style={{...type.body,color:inkSoft}}>{tr('开发者每天查看举报。如需帮助或申诉，请联系：')}</Text>
  <Pressable accessibilityRole="link" style={{minHeight:48,justifyContent:'center'}} onPress={()=>{void Linking.openURL('mailto:dev@yunpura.com').catch(()=>setMessage(tr('请发送邮件至 dev@yunpura.com。')));}}><Text selectable style={{...type.action,color:sage}}>dev@yunpura.com</Text></Pressable>
  {allowed?<>
   {restricted?<Text style={{...type.body,color:ink}}>{tr('此账号暂时不能新增家庭分享。已有记录仍可阅读，如有疑问请联系 dev@yunpura.com。')}</Text>:null}
   {hiddenShares.length?<><Text style={{...type.body,color:ink}}>{tr('以下家庭分享因内容规则被限制。如有异议，请联系 dev@yunpura.com。')}</Text>{hiddenShares.map(id=><Text selectable key={id} style={{...type.meta,color:inkSoft}}>{id}</Text>)}</>:null}
   <Text style={{...type.action,color:ink}}>{tr('已屏蔽的家人')}</Text>
   {blocks.map(b=><View key={b.targetUserId} style={{paddingVertical:16,gap:8}}><Text style={{...type.body,color:ink}}>{b.nickname||tr('家人')}</Text><Pressable accessibilityRole="button" style={{minHeight:48,justifyContent:'center'}} onPress={()=>unblock(b.targetUserId)}><Text style={{...type.action,color:sage}}>{tr('解除屏蔽')}</Text></Pressable></View>)}
   {loaded&&!blocks.length?<Text style={{...type.meta,color:inkSoft}}>{tr('没有屏蔽任何家人。')}</Text>:null}
   <Text style={{...type.action,color:ink,marginTop:32}}>{tr('我的举报')}</Text>
   {reports.map(r=><View key={r.reportId} style={{paddingVertical:16,gap:8}}><Text style={{...type.body,color:ink}}>{reportReasonLabel(r.reason)} · {reportStatusLabel(r.status)}</Text><Text selectable style={{...type.meta,color:inkSoft}}>{r.reportId}</Text><Text style={{...type.meta,color:inkSoft}}>{r.createdAt.slice(0,10)}</Text></View>)}
   {loaded&&!reports.length?<Text style={{...type.meta,color:inkSoft}}>{tr('没有提交过举报。')}</Text>:null}
   {message?<><Text style={{...type.meta,color:inkSoft}}>{message}</Text><Pressable accessibilityRole="button" style={{minHeight:48}} onPress={()=>void load()}><Text style={{...type.action,color:sage}}>{tr('再试一次')}</Text></Pressable></>:null}
  </>:null}
 </SettingsPage>;
}
