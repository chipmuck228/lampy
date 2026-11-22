import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Alert,AppState,Pressable,StyleSheet,View} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {getAccountUseCases} from '../application/container';
import {isApplicationError} from '../application/errors';
import {emailCodeEntryOpen} from '../infrastructure/account-config';
import {isPlausibleEmail,normalizeEmail} from '../family-api/email-normalize';
import type {EmailCodeIntent,EmailCodeStatus,EmailCodeTicket} from '../family-api/email-code-types';
import {appLanguage,tr} from '../i18n';
import {useDeviceLock} from './device-lock-context';
import {SettingsPage} from './settings-chrome';
import {Text,TextInput} from './life-text';
import {ink,inkSoft,sage,hairline} from './life-page';

function errorCopy(error:unknown) {
  const code=isApplicationError(error)?error.code:'';
  if(code==='EMAIL_CODE_INVALID')return tr('验证码不正确、已过期或已使用，请重试或重新获取。');
  if(code==='RATE_LIMITED')return tr('获取或验证过于频繁，请稍后再试。');
  if(code==='EMAIL_DELIVERY_FAILED')return tr('邮件暂时没有发出，请稍后再试。');
  if(code==='CONFLICT')return tr('这个邮箱已关联另一个账号，请使用原来的登录方式。');
  if(code==='EMAIL_NOT_LINKED')return tr('请输入当前账号已关联的完整邮箱。');
  if(code==='EMAIL_ALREADY_LINKED')return tr('当前账号已有邮箱，请选择更换邮箱。');
  if(code==='REAUTHENTICATION_REQUIRED')return tr('请先重新验证当前登录方式，再关联或更换邮箱。');
  if(code==='ACCOUNT_HAS_MANAGED_FAMILY')return tr('请先转交或解散仍有其他成员的家庭，再删除账号。');
  if(code==='STALE_FAMILY_REQUEST')return tr('账号或页面已变化，请重新获取验证码。');
  if(code==='EMAIL_CODE_CLOSED')return tr('邮箱登录暂未开放。');
  return tr('现在没有完成，请再试一次。');
}

export default function EmailCodeScreen({onAuthenticated,onCancel,onOtherSignIn}:{onAuthenticated?:()=>void;onCancel:()=>void;onOtherSignIn?:()=>void}) {
  const open=emailCodeEntryOpen();const lock=useDeviceLock();
  const [status,setStatus]=useState<EmailCodeStatus>({signedIn:false,linked:false});
  const [mode,setMode]=useState<EmailCodeIntent|'summary'|'name'>('login');
  const [needsRefresh,setNeedsRefresh]=useState(false);
  const [retry,setRetry]=useState(0);const initialRead=useRef(false);
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[email,setEmail]=useState(''),[code,setCode]=useState(''),[nickname,setNickname]=useState('');
  const [ticket,setTicket]=useState<EmailCodeTicket|null>(null),[message,setMessage]=useState<string|null>(null);
  const [limitedUntil,setLimitedUntil]=useState(0),[limitedAddress,setLimitedAddress]=useState('');
  const [resendAt,setResendAt]=useState(0),[sentTo,setSentTo]=useState(''),[tick,setTick]=useState(()=>Date.now());
  const [foreground,setForeground]=useState(AppState.currentState==='active');
  const accountOwner=useRef<string|null>(null);
  const active=useRef(false),sequence=useRef(0),foregroundRef=useRef(foreground),locked=useRef(!!lock?.snapshot.locked),action=useRef<'send'|'verify'|'other'|null>(null);
  useLayoutEffect(()=>{locked.current=!!lock?.snapshot.locked;foregroundRef.current=foreground;},[lock?.snapshot.locked,foreground]);
  const current=useCallback((n:number,visible=false)=>active.current&&sequence.current===n&&(!visible||(foregroundRef.current&&!locked.current)),[]);
  useFocusEffect(useCallback(()=>{
    void retry;active.current=true;const n=++sequence.current;setReady(false);setNeedsRefresh(false);setCode('');setTicket(null);setMessage(null);
    initialRead.current=false;
    if(open&&!locked.current&&foregroundRef.current){initialRead.current=true;void(async()=>{try{const service=await getAccountUseCases();if(!await service.getEmailCodeAvailability()){if(current(n))setMessage(tr('邮箱登录暂未开放。'));return;}
      const state=await service.getEmailCodeAccount();if(!current(n))return;setStatus(state);accountOwner.current=state.userId??null;setMode(state.signedIn?(state.linked?'summary':'link'):'login');setReady(true);
    }catch(error){if(current(n))setMessage(errorCopy(error));}})();}
    return ()=>{active.current=false;sequence.current++;action.current=null;};
  },[open,retry,current]));
  useEffect(()=>{if(open&&active.current&&!locked.current&&foreground&&!initialRead.current)setRetry(value=>value+1);},[open,foreground,lock?.snapshot.locked]);
  useEffect(()=>{const timer=setInterval(()=>setTick(Date.now()),1000);return ()=>clearInterval(timer);},[]);
  const conceal=useCallback(()=>{setCode('');if(action.current==='verify'){sequence.current++;action.current=null;setBusy(false);setTicket(null);setNeedsRefresh(true);setMessage(tr('这次验证没有完成，请先重新确认账号。'));}},[]);
  useEffect(()=>{const sub=AppState.addEventListener('change',state=>{foregroundRef.current=state==='active';setForeground(state==='active');if(state!=='active')conceal();});return()=>sub.remove();},[conceal]);
  useEffect(()=>{if(!lock?.snapshot.locked)return;const timer=setTimeout(conceal,0);return()=>clearTimeout(timer);},[lock?.snapshot.locked,conceal]);
  function choose(next:typeof mode){sequence.current++;setMode(next);setEmail('');setCode('');setTicket(null);setMessage(null);}
  const normalized=normalizeEmail(email),limited=limitedAddress===normalized?Math.max(0,Math.ceil((limitedUntil-tick)/1000)):0;
  const recentlyAuthenticated=Date.parse(status.reauthenticationExpiresAt??'')>tick;
  const activeTicket=ticket&&Date.parse(ticket.expiresAt)>tick?ticket:null;
  const remaining=sentTo===normalized?Math.max(0,Math.ceil((resendAt-tick)/1000)):0;
  async function send() {
    if(needsRefresh||busy||!ready||!foregroundRef.current||locked.current||mode==='summary'||mode==='name'||remaining||limited)return;
    if(!isPlausibleEmail(normalized)){setMessage(tr('请输入有效邮箱。'));return;}
    const n=++sequence.current;action.current='send';setBusy(true);setMessage(null);
    try{const service=await getAccountUseCases();const next=await service.requestEmailCode({email:normalized,intent:mode,language:appLanguage==='en'?'en':'zh'},()=>current(n),accountOwner.current);
      if(!current(n))return;setLimitedUntil(0);setTicket(next);setSentTo(normalized);setResendAt(Date.now()+next.resendAfterSeconds*1000);setTick(Date.now());setCode('');setMessage(tr('验证码已发出，请查看收件箱或垃圾邮件。'));
    }catch(error){if(current(n)){setMessage(errorCopy(error));if(isApplicationError(error)&&['STALE_FAMILY_REQUEST','UNAUTHENTICATED'].includes(error.code))setNeedsRefresh(true);if(isApplicationError(error)&&error.code==='REAUTHENTICATION_REQUIRED'){setStatus(previous=>({...previous,reauthenticationExpiresAt:undefined}));setTicket(null);setCode('');}if(isApplicationError(error)&&error.code==='RATE_LIMITED'){setLimitedAddress(normalized);setLimitedUntil(Date.now()+(error.retryAfterSeconds??0)*1000);setTick(Date.now());if(!activeTicket||Date.parse(activeTicket.expiresAt)<=Date.now()){setTicket(null);setCode('');setMessage(tr('发送过于频繁，本次没有发出邮件，请稍后再试。'));}else setMessage(tr('新验证码没有发出，仍可使用上一封邮件中的有效验证码。'));}}}
    finally{if(current(n)){action.current=null;setBusy(false);}}
  }
  async function verify() {
    if(busy||!ticket||mode==='summary'||mode==='name'||!activeTicket||!/^\d{6}$/.test(code)||!foregroundRef.current||locked.current)return;
    const n=++sequence.current;action.current='verify';setBusy(true);setMessage(null);
    try{const service=await getAccountUseCases();const result=await service.verifyEmailCode({email:normalized,challengeId:ticket.challengeId,intent:mode,code,
      ...(mode==='delete'?{confirmation:'delete-my-lampy-account-v1'}:{})},()=>current(n,true));
      if(!current(n,true))return;setTicket(null);setCode('');
      if('signedIn'in result){accountOwner.current=result.userId;setStatus({signedIn:true,linked:true});if(result.needsProfile)setMode('name');else if(onAuthenticated)onAuthenticated();else{setMode('summary');setMessage(tr('已登录。'));}}
      else if('deleted'in result){accountOwner.current=null;setStatus({signedIn:false,linked:false});setMode('login');setMessage(tr(result.appleRevocation==='manual-required'?'账号已删除。请在 Apple 账号设置中停止使用 Lampy 登录。':'账号已删除，本机个人记录仍保留。'));}
      else {const state=await service.getEmailCodeAccount();if(!current(n,true))return;setStatus(state);if('reauthenticated'in result){setBusy(false);action.current=null;choose('change');setMessage(tr('身份已确认，请输入新的邮箱地址。'));}else {setMode('summary');setMessage(tr('邮箱已关联。'));}}
    }catch(error){if(current(n,true)){setCode('');setMessage(errorCopy(error));if(isApplicationError(error)&&['STALE_FAMILY_REQUEST','UNAUTHENTICATED'].includes(error.code))setNeedsRefresh(true);if(isApplicationError(error)&&error.code==='REAUTHENTICATION_REQUIRED')setStatus(previous=>({...previous,reauthenticationExpiresAt:undefined}));}}
    finally{if(current(n)){action.current=null;setBusy(false);}}
  }
  async function name() {
    if(!nickname.trim()||busy)return;const n=++sequence.current;setBusy(true);action.current='other';
    try{const service=await getAccountUseCases();if(!accountOwner.current)return;await service.finishEmailProfile(nickname.trim(),accountOwner.current,()=>current(n,true));if(current(n,true)){if(onAuthenticated)onAuthenticated();else setMode('summary');}}
    catch(error){if(current(n))setMessage(errorCopy(error));}finally{if(current(n)){setBusy(false);action.current=null;}}
  }
  async function logout(){if(busy)return;const n=++sequence.current;setBusy(true);try{const service=await getAccountUseCases();if(!accountOwner.current)return;const result=await service.signOutEmailAccount(accountOwner.current);if(!current(n))return;if(result.local==='signed-out'){accountOwner.current=null;setStatus({signedIn:false,linked:false});choose('login');}else setMessage(tr('现在没有完成，请再试一次。'));}catch(error){if(current(n))setMessage(errorCopy(error));}finally{if(active.current)setBusy(false);}}
  function deletion(){Alert.alert(tr('删除账号'),tr('删除账号会移除家庭账号相关数据，本机个人记录保留。'),[{text:tr('取消'),style:'cancel'},{text:tr('继续'),style:'destructive',onPress:()=>choose('delete')}]);}
  const blocked=!!lock?.snapshot.locked||!foreground;

  return <SettingsPage title={tr('登录与找回')} backLabel={tr('返回')} accessibilityLabel={tr('登录与找回')} onBack={onCancel} pageTestID="email-code-page">
    {!open?<Text>{tr('邮箱登录暂未开放。')}</Text>:blocked?<Text>{tr('请先解锁，再继续。')}</Text>:<View style={styles.content}>
      <Text style={styles.title}>{tr(mode==='summary'?'你的邮箱':mode==='name'?'怎么称呼你？':mode==='login'?'用邮箱继续':mode==='delete'?'验证邮箱后删除账号':mode==='change'?'更换邮箱':mode==='reauth'?'验证当前邮箱':'关联邮箱')}</Text>
      {!ready?<>{message?<Text accessibilityLiveRegion="polite">{message}</Text>:<Text>{tr('正在确认账号服务。')}</Text>}{<Action label={tr('再试一次')} onPress={()=>setRetry(value=>value+1)} disabled={false} testID={'email-code-retry'}/>}{onOtherSignIn?<Action label={tr('其他登录方式')} onPress={onOtherSignIn}/>:null}{<Action label={tr('返回')} onPress={onCancel} disabled={false} testID={'email-code-back'}/>}</>:
      mode==='summary'?<>
        <Text>{status.maskedEmail??tr('邮箱已关联。')}</Text>
        <Text style={styles.note}>{tr('邮箱已验证。')}</Text>
        {recentlyAuthenticated?<Text testID="email-code-identity-confirmed" style={styles.note}>{tr('身份已确认，可以更换邮箱。')}</Text>:<Action label={tr('更换邮箱前重新验证身份')} onPress={()=>choose('reauth')} disabled={busy} testID="email-code-reauth"/>}
        {<Action label={tr('更换邮箱')} onPress={()=>choose('change')} disabled={busy} testID={'email-code-change'}/>}
        {<Action label={tr('退出登录')} onPress={()=>void logout()} disabled={busy} testID={'email-code-logout'}/>}
        {<Action label={tr('删除账号')} onPress={deletion} disabled={busy} testID={'email-code-delete'}/>}
      </>:mode==='name'?<>
        <Text style={styles.body}>{tr('留一个家人熟悉的称呼。')}</Text>
        <TextInput testID="email-code-name" accessibilityLabel={tr('昵称')} value={nickname} onChangeText={setNickname} maxLength={24} editable={!busy} style={styles.input}/>
        {<Action label={tr('继续')} onPress={()=>void name()} disabled={busy||!nickname.trim()} testID={'email-code-name-save'}/>}
      </>:<>
        <Text style={styles.body}>{tr(mode==='delete'?'删除账号会移除家庭账号相关数据，本机个人记录保留。':mode==='reauth'?'请输入当前账号已关联的完整邮箱。':mode==='change'?'请输入新的邮箱地址，我们会向新邮箱发送验证码。':'我们会发送一封邮件，你可以切换到邮箱查看验证码，再回来继续。')}</Text>
        <TextInput testID="email-code-address" accessibilityLabel={tr('邮箱')} value={email} onChangeText={value=>{setEmail(value);setCode('');setTicket(null);}} editable={!busy} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" maxLength={254} style={styles.input}/>
        {<Action label={limited?`${tr('稍后重试')} (${limited})`:remaining?`${tr('重新获取')} (${remaining})`:activeTicket?tr('重新获取'):tr('获取验证码')} onPress={()=>void send()} disabled={needsRefresh||busy||remaining>0||limited>0} testID={'email-code-send'}/>}
        {ticket&&!activeTicket?<Text style={styles.body}>{tr('验证码已过期，请重新获取。')}</Text>:null}
        {activeTicket?<>
          <TextInput testID="email-code-value" accessibilityLabel={tr('六位验证码')} value={code} onChangeText={value=>setCode(value.replace(/\D/g,'').slice(0,6))} editable={!busy} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} style={styles.input}/>
          {<Action label={tr(mode==='delete'?'确认删除账号':'验证并继续')} onPress={()=>mode==='delete'?Alert.alert(tr('删除账号'),tr('这个操作无法撤销。'),[{text:tr('取消'),style:'cancel'},{text:tr('确认删除账号'),style:'destructive',onPress:()=>void verify()}]):void verify()} disabled={busy||code.length!==6} testID={'email-code-verify'}/>}
        </>:null}
        {mode==='change'&&status.linked&&!recentlyAuthenticated?<Action label={tr('先验证当前邮箱')} onPress={()=>choose('reauth')} disabled={busy}/>:null}
        {mode==='login'?<Text style={styles.note}>{tr('如果已有 Lampy 账号，请先用原来的方式登录，再关联邮箱。')}</Text>:null}
        {onOtherSignIn?<Action label={tr('其他登录方式')} onPress={onOtherSignIn} disabled={busy} testID={'email-code-other'}/>:null}
      </>}
      {ready&&message?<Text accessibilityLiveRegion="polite" style={styles.body}>{message}</Text>:null}
      {needsRefresh?<Action label={tr('重新确认账号')} onPress={()=>setRetry(value=>value+1)} disabled={busy} testID={'email-code-refresh-account'}/>:null}
      <Text style={styles.note}>{tr('个人记录仍留在这台设备，登录不会自动备份或上传。')}</Text>
    </View>}
  </SettingsPage>;
}
const styles=StyleSheet.create({content:{gap:20,paddingVertical:24},title:{fontSize:25,lineHeight:36,color:ink},body:{fontSize:16,lineHeight:26,color:inkSoft},note:{fontSize:13,lineHeight:22,color:inkSoft},input:{fontSize:18,color:ink,borderBottomWidth:StyleSheet.hairlineWidth,borderColor:hairline,paddingVertical:12},button:{alignSelf:'flex-start',paddingVertical:10,minHeight:48,justifyContent:'center'},link:{fontSize:16,color:sage}});

function Action({label,onPress,disabled=false,testID}:{label:string;onPress:()=>void;disabled?:boolean;testID?:string}){return <Pressable testID={testID} accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button,disabled&&{opacity:0.4}]}><Text style={styles.link}>{label}</Text></Pressable>;}
