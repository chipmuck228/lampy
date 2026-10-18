import {useDeviceLock} from './device-lock-context';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { getFamilyUseCases } from '../application/container';
import { pauseForegroundAudio } from '../application/foreground-audio';
import { REPORT_REASONS, type ReportReason } from '../family-api/safety-types';
import { tr } from '../i18n';
import { ink, inkSoft, paper, sage, hairline } from './life-page';
import { Text, type } from './life-text';
export function reportReasonLabel(reason: ReportReason) {
  return tr(({inappropriate:'不当内容',harassment:'骚扰',privacy:'隐私侵犯',other:'其他'} as const)[reason]);
}
export function reportStatusLabel(status: string) { return tr(status==='restricted'?'已限制相关内容':status==='reviewed'?'已核对':'待处理'); }
export function FamilySafetyActions({familyId,shareId,authorUserId,current,onHidden}:{familyId:string;shareId:string;authorUserId:string;current:()=>boolean;onHidden:()=>void}) {
  const lock=useDeviceLock();const [active,setActive]=useState(AppState.currentState==='active');
  const [mode,setMode]=useState<'closed'|'menu'|'report'>('closed');
  useEffect(()=>{const sub=AppState.addEventListener('change',state=>{setActive(state==='active');if(state!=='active')setMode('closed');});return()=>sub.remove();},[]);
  const [reason,setReason]=useState<ReportReason>('inappropriate');
  const [detail,setDetail]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  const inFlight=useRef(false),requestId=useRef('');
  async function report() {
    if(inFlight.current||!current())return;
    if(!requestId.current)requestId.current=`safety-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    inFlight.current=true;setBusy(true);setMessage('');
    try {const app=await getFamilyUseCases();if(!current())return;const r=await app.safety.report(familyId,shareId,{requestId:requestId.current,reason,detail},current);
      if(current()){setMode('closed');setDetail('');requestId.current=`safety-${Date.now()}-${Math.random().toString(36).slice(2)}`;Alert.alert(tr('已收到举报'),tr('回执编号：{0}。可在设置的「家庭内容」中查看处理状态。',[r.reportId]));}
    } catch {if(current())setMessage(tr('这次没有提交成功，请稍后再试。'));}finally{inFlight.current=false;setBusy(false);}
  }
  function block() {
    if(!current()||inFlight.current)return;setMode('closed');pauseForegroundAudio();
    Alert.alert(tr('不再看这位家人的内容？'),tr('只对你生效。家庭记录和家庭册会隐藏对方的内容；对方不会被移出家庭，也不会收到通知。可在设置中解除屏蔽。'),[
      {text:tr('取消'),style:'cancel'}, {text:tr('屏蔽内容'),style:'destructive',onPress:()=>{void(async()=>{
        if(!current()||inFlight.current)return;inFlight.current=true;setBusy(true);
        try {const app=await getFamilyUseCases();if(!current())return;await app.safety.block(familyId,authorUserId,current);if(AppState.currentState==='active')onHidden();}
        catch {if(current())setMessage(tr('这次没有完成，请稍后再试。'));}finally{inFlight.current=false;setBusy(false);}
      })();}},
    ]);
  }
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={tr('家庭记录操作')} testID="family-safety-menu" disabled={busy} style={styles.hit} onPress={()=>{if(current()){pauseForegroundAudio();setMode('menu');}}}><Text style={styles.action}>⋯</Text></Pressable>
    {message&&mode==='closed'?<Text style={styles.meta}>{message}</Text>:null}
    <Modal visible={mode!=='closed'&&active&&!lock?.snapshot.locked} transparent animationType="fade" onRequestClose={()=>{if(!busy)setMode('closed');}}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel={tr('收起家庭记录操作')} style={StyleSheet.absoluteFill} onPress={()=>{if(!busy)setMode('closed');}}/>
        <View accessibilityViewIsModal style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:12}}>
            {mode==='menu'?<>
              <Pressable accessibilityRole="button" style={styles.hit} onPress={()=>{setMessage('');setMode('report');}}><Text style={styles.action}>{tr('举报这条内容')}</Text></Pressable>
              <Pressable accessibilityRole="button" style={styles.hit} onPress={block}><Text style={styles.action}>{tr('不再看这位家人的内容')}</Text></Pressable>
            </>:<>
              <Text style={styles.title}>{tr('举报这条内容')}</Text>
              <Text style={styles.meta}>{tr('只提交这条家庭分享的引用和举报原因，不上传你的私人记录。举报不会自动删除内容。')}</Text>
              {REPORT_REASONS.map(r=><Pressable key={r} accessibilityRole="radio" accessibilityState={{checked:reason===r,disabled:busy}} disabled={busy} style={styles.hit} onPress={()=>{setReason(r);requestId.current='';}}><Text style={styles.action}>{reason===r?'✓ ':''}{reportReasonLabel(r)}</Text></Pressable>)}
              <TextInput accessibilityLabel={tr('补充说明（可选）')} placeholder={tr('补充说明（可选）')} placeholderTextColor={inkSoft} value={detail} onChangeText={text=>{setDetail(text);requestId.current='';}} maxLength={1000} multiline editable={!busy} style={styles.input}/>
              {message?<Text style={styles.meta}>{message}</Text>:null}
              <Pressable accessibilityRole="button" disabled={busy} style={styles.hit} onPress={()=>void report()}><Text style={styles.action}>{tr(busy?'正在提交':'提交举报')}</Text></Pressable>
            </>}
            <Pressable accessibilityRole="button" style={styles.hit} disabled={busy} onPress={()=>setMode('closed')}><Text style={styles.action}>{tr('取消')}</Text></Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}
const styles=StyleSheet.create({overlay:{flex:1,justifyContent:'center',padding:24,backgroundColor:'rgba(0,0,0,0.25)'},sheet:{backgroundColor:paper,borderRadius:20,padding:24,maxHeight:'85%'},hit:{minHeight:48,justifyContent:'center',paddingVertical:10},action:{...type.action,color:sage},title:{...type.title,color:ink},meta:{...type.meta,color:inkSoft},input:{...type.body,color:ink,borderWidth:1,borderColor:hairline,borderRadius:12,padding:14,minHeight:96,textAlignVertical:'top'}});
