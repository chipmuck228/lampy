import { AppleAuthButton } from './apple-auth-button';
import { createExpoAppleIdentityTokenSource } from '../infrastructure/expo-apple-auth';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getFamilyUseCases } from '../application/container';
import { isControlledEmailAccountsOpen, isFamilyProductEntryOpen, isFamilyInternalTestBuild } from '../infrastructure/family-config';
import { isPersonalSettingsDiagnosticsOpen } from '../application/personal-settings-visibility';
import { isPlausibleEmail, normalizeEmail, passwordPolicyError } from '../family-api/email-normalize';
import type { UserProfile } from '../family-api/types';
import { ApplicationError, isApplicationError } from '../application/errors';
import { tr } from '../i18n';
import { useDeviceLock } from './device-lock-context';
import { SettingsPage } from './settings-chrome';
import { Text, TextInput, type } from './life-text';
import { LifeIcon } from './life-icons';
import { hairline, ink, inkSoft, sage, paperDeep } from './life-page';

function errorCopy(error: unknown) {
  if (isApplicationError(error)) {
    if (error.code === 'EMAIL_ACCOUNT_EXISTS') return tr('这个账号已存在，请登录。');
    if (error.code === 'AUTH_FAILED') return tr('邮箱或密码不对。');
    if (error.code === 'RATE_LIMITED') return tr('请稍后再试。');
    if (error.code === 'EMAIL_ACCOUNT_CLOSED') return tr('测试账号入口暂未开放。');
    if (error.code === 'APPLE_AUTH_WAIT_TIMEOUT') return tr('Apple授权等待已结束，请重新试一次。');
    if (error.code === 'APPLE_SIGN_IN_CANCELLED') return tr('已取消Apple登录。');
    if (error.code === 'APPLE_TOKEN_INVALID') return tr('Apple授权没有完成，请重新试一次。');
    if (error.code === 'APPLE_UNAVAILABLE') return tr('这台设备暂不能使用Apple登录。');
    if (error.code === 'CONFLICT') return tr('这个Apple账号已关联其他账号，不能合并。');
    if (error.code === 'UNAUTHENTICATED') return tr('请先登录。');
  }
  return tr('现在没有完成，请再试一次。');
}

export default function FamilyEmailAccountScreen({ profileMode = false, embedded = false, onAuthenticated, onCancel, onOtherSignIn }: {
  profileMode?: boolean; embedded?: boolean; onAuthenticated?: () => void; onCancel?: () => void; onOtherSignIn?: () => void;
} = {}) {
  const router = useRouter();
  const lock = useDeviceLock();
  const internal = isFamilyInternalTestBuild();
  const [registrationAllowed, setRegistrationAllowed] = useState(false);
  const entryAllowed = isControlledEmailAccountsOpen() && isFamilyProductEntryOpen() && (internal || isPersonalSettingsDiagnosticsOpen());
  const allowed = entryAllowed && !lock?.snapshot.locked;
  const allowedRef=useRef(allowed);
  useLayoutEffect(()=>{allowedRef.current=allowed;},[allowed]);
  const nativeApple=useRef<number | null>(null);const focused=useRef(false);
  const [appleAvailable,setAppleAvailable]=useState(false);const [appleLinked,setAppleLinked]=useState(false);
  const [register, setRegister] = useState(false);
  const [email,setEmail] = useState(''); const [password,setPassword] = useState(''); const [nickname,setNickname] = useState('');
  const [profile,setProfile] = useState<UserProfile | null>(null);
  const [ready,setReady] = useState(false); const [loading,setLoading] = useState(true); const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState<string | null>(null);
  const sequence = useRef(0); const owner = useRef<number | null>(null);
  const appleRecoveryMessage = useRef<string | null>(null);
  const current = useCallback((seq: number) => seq === sequence.current && allowedRef.current && AppState.currentState === 'active', []);
  function cancel() { sequence.current++;owner.current=null;appleRecoveryMessage.current=null;setPassword(''); if (onCancel) onCancel(); else if (router.canGoBack()) router.back(); else router.dismissTo('/family'); }
  const load = useCallback(async(seq: number) => {
    if (!current(seq)) return;
    // A reread after unlocking may have invalidated the timed-out owner before its finally.
    // Never release a newer submission that is already in flight.
    if (owner.current === null) setBusy(false);
    setLoading(true);setReady(false);setRegistrationAllowed(false);setRegister(false);setProfile(null);setMessage(appleRecoveryMessage.current);appleRecoveryMessage.current=null;setAppleAvailable(false);setAppleLinked(false);
    try {
      const service = await getFamilyUseCases(); if (!current(seq)) return;
      const health = await service.getControlledEmailAvailability(); if (!current(seq)) return;
      if (!health.controlledEmailAccounts || (internal && (health.publicTestLogin !== true || health.emailRegistration !== false))) { setMessage(tr('测试账号入口暂未开放。')); return; }
      setRegistrationAllowed(!internal && health.emailRegistration === true);
      if (profileMode) { const value = await service.getMyProfile(() => current(seq)); if (!current(seq)) return;setProfile(value);setNickname(value.nickname); }
      if(health.appleLogin===true) {
        const available=await createExpoAppleIdentityTokenSource().isAvailable().catch(()=>false);if(!current(seq)) return;setAppleAvailable(available);
        if(profileMode && available) { const status=await service.getAppleLink(()=>current(seq));if(!current(seq)) return;setAppleLinked(status.linked); }
      }
      setReady(true);
    } catch(error) { if(current(seq)) { if (embedded && isApplicationError(error) && error.code === 'UNAUTHENTICATED') { setProfile(null);setNickname('');setReady(true); } else setMessage(errorCopy(error)); } }
    finally { if(current(seq)) setLoading(false); }
  },[current,profileMode,internal,embedded]);
  useFocusEffect(useCallback(() => {
    focused.current=true;const seq = ++sequence.current;owner.current=null;appleRecoveryMessage.current=null;setBusy(false);
    if (entryAllowed && allowedRef.current) void load(seq);
    const sub = AppState.addEventListener('change',state => {
      if(nativeApple.current !== null && state !== 'background') return;
      if (state !== 'active') { sequence.current++;owner.current=null;appleRecoveryMessage.current=null;setPassword('');setBusy(false);setReady(false);setProfile(null); }
      else if (allowedRef.current) { const next=++sequence.current;void load(next); }
    });
    return () => { focused.current=false;sub.remove();sequence.current++;owner.current=null;appleRecoveryMessage.current=null;setPassword('');setProfile(null); };
  },[entryAllowed,load]));
  const previouslyAllowed=useRef(allowed);
  useEffect(()=>{
    const changed=previouslyAllowed.current!==allowed;previouslyAllowed.current=allowed;
    if(!changed || !focused.current || nativeApple.current!==null) return;
    const seq=++sequence.current;owner.current=null;
    void Promise.resolve().then(()=>{
      if(!focused.current || sequence.current!==seq || nativeApple.current!==null) return;
      if(!allowedRef.current) {setPassword('');setBusy(false);setReady(false);setProfile(null);}
      else if(AppState.currentState==='active') void load(seq);
    });
  },[allowed,load]);
  async function submit() {
    if ((register && !registrationAllowed) || !ready || owner.current !== null || !allowed || AppState.currentState !== 'active') return;
    if ((profileMode || register) && (!nickname.trim() || Array.from(nickname.trim()).length > 24 || /[\u0000-\u001f\u007f\u2028\u2029]/.test(nickname))) {setMessage(tr('昵称请填写1至24个字。'));return;}
    if (!profileMode && (!isPlausibleEmail(normalizeEmail(email)) || (register && passwordPolicyError(password)) || !password)) {setMessage(tr('请填写邮箱和密码，密码需10至128个字符。'));return;}
    const seq=sequence.current;const submitted={email,password,nickname};owner.current=seq;appleRecoveryMessage.current=null;setBusy(true);setMessage(null);
    try {
      const service=await getFamilyUseCases();if (!current(seq)) return;
      if (profileMode) { const result=await service.updateMyProfile(submitted.nickname,()=>current(seq));if (!current(seq)) return;setProfile(result);setNickname(result.nickname);setMessage(tr('昵称已保存。')); }
      else {
        if(register) await service.registerControlledEmail(submitted,()=>current(seq));
        else await service.signInWithControlledEmail(submitted,()=>current(seq));
        if (!current(seq)) return;setPassword('');
        if(onAuthenticated) onAuthenticated();else router.dismissTo('/family');
      }
    } catch(error) {if(current(seq)) setMessage(errorCopy(error));}
    finally {if(owner.current===seq) {owner.current=null;if(current(seq)) setBusy(false);} }
  }
  async function runApple(seq:number) {
    if(!current(seq) || !ready || !appleAvailable || owner.current!==null || (profileMode && (!profile || appleLinked))) return;
    owner.current=seq;appleRecoveryMessage.current=null;setBusy(true);setMessage(null);setPassword('');
    try {
      const service=await getFamilyUseCases();if(!current(seq)) return;
      await service.authenticateApple(profileMode?'link':'login',async nonce=>{
        if(!current(seq)) throw new Error('Inactive');
        nativeApple.current=seq;
        try {
          const token=await createExpoAppleIdentityTokenSource().requestIdentityToken(nonce);
          // Authorization sheets can set inactive; protection is never bypassed. Wait for active/unlocked.
          const end=Date.now()+30_000;
          while(!current(seq) && sequence.current===seq && AppState.currentState!=='background' && Date.now()<end) await new Promise<void>(resolve=>setTimeout(resolve,50));
          if(!current(seq)) {
            if(focused.current && sequence.current===seq && owner.current===seq && AppState.currentState!=='background' && Date.now()>=end) {
              appleRecoveryMessage.current=tr('Apple授权等待已结束，请重新试一次。');
              throw new ApplicationError('APPLE_AUTH_WAIT_TIMEOUT','Apple authorization foreground wait timed out.');
            }
            throw new Error('Inactive');
          }
          return token;
        } finally {
          if(nativeApple.current===seq) {
            nativeApple.current=null;
            if(focused.current && sequence.current!==seq && owner.current===null && allowedRef.current && AppState.currentState==='active') void load(++sequence.current);
          }
        }
      },()=>current(seq));
      if(!current(seq)) return;
      if(profileMode) {setAppleLinked(true);setMessage(tr('Apple账号已关联。'));}
      else if(onAuthenticated) onAuthenticated();else router.dismissTo('/family');
    } catch(error) {
      if(current(seq)) setMessage(errorCopy(error));
      else if(focused.current && sequence.current===seq && owner.current===seq && appleRecoveryMessage.current) setMessage(appleRecoveryMessage.current);
    } finally {
      if(owner.current===seq) {
        owner.current=null;
        // Visibility/lock eligibility controls committing credentials, not releasing this lock.
        if(focused.current && sequence.current===seq) setBusy(false);
      }
    }
  }
  function confirmAppleLink() {
    const seq=sequence.current;
    if(!current(seq) || owner.current!==null) return;
    Alert.alert(tr('关联Apple账号'),tr('关联后可用Apple登录当前账号，家庭和昵称保留。不会合并其他账号。'),[
      {text:tr('取消'),style:'cancel'}, {text:tr('关联'),onPress:()=>void runApple(seq)},
    ]);
  }
  function confirmSignOut() {
    const seq=sequence.current;
    if (!profileMode || !profile || owner.current !== null || !current(seq)) return;
    Alert.alert(tr('退出登录'), tr('仅退出这台设备，个人记录不变。'), [
      {text:tr('取消'),style:'cancel'},
      {text:tr('退出登录'),onPress:()=>void leaveAccount(seq)},
    ]);
  }
  async function leaveAccount(seq:number) {
    if (!current(seq) || owner.current !== null || !profile) return;
    owner.current=seq;appleRecoveryMessage.current=null;setBusy(true);setMessage(null);
    try {
      const service=await getFamilyUseCases();if(!current(seq)) return;
      const result=await service.signOut();if(!current(seq)) return;
      if(result.local === 'still-signed-in') {setMessage(tr('退出还未完成，请再试一次。'));return;}
      setProfile(null);setNickname('');setPassword('');
      setMessage(tr(result.server === 'unconfirmed' ? '已退出这台设备，联网后会继续撤销会话。' : '已退出这台设备。'));
    } catch(error) {if(current(seq)) setMessage(errorCopy(error));}
    finally {if(owner.current===seq){owner.current=null;if(current(seq))setBusy(false);}}
  }
  const title=tr(profileMode ? '我的资料' : register ? '创建账号' : '登录家庭');
  const content = <>
    {!allowed ? <Text>{tr('测试账号入口暂未开放。')}</Text> : <>
      {profileMode ? <View style={styles.avatar}><LifeIcon name="person" size={56} color={sage}/></View> : <Text style={styles.explanation}>{tr(internal ? '请使用受邀测试账号登录。' : '邮箱仅用作测试账号，不会发送邮件。')}</Text>}
      {loading ? <Text>{tr('正在读取。')}</Text> : null}
      {ready ? <View style={styles.form}>
        {appleAvailable && !register && (!profileMode || profile) ? <View style={{gap:12}}>
          {profileMode ? <Text style={styles.explanation}>{tr(appleLinked?'已关联Apple账号':'关联Apple账号')}</Text> : null}
          {!appleLinked ? <AppleAuthButton disabled={busy} onPress={()=>profileMode?confirmAppleLink():void runApple(sequence.current)}/> : null}
        </View> : null}
        {!profileMode ? <>
          <TextInput testID="email-account-email" accessibilityLabel={tr('邮箱')} placeholder={tr('邮箱')} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" maxLength={254} editable={!busy} style={styles.input}/>
          <TextInput testID="email-account-password" accessibilityLabel={tr('密码')} placeholder={tr('密码')} value={password} onChangeText={setPassword} secureTextEntry textContentType={register ? 'newPassword' : 'password'} maxLength={128} editable={!busy} style={styles.input}/>
        </> : null}
        {(profileMode && profile) || register ? <TextInput testID="email-account-nickname" accessibilityLabel={tr('昵称')} placeholder={tr('昵称')} value={nickname} onChangeText={setNickname} editable={!busy} style={styles.input}/> : null}
        {profileMode && !profile ? <View><Text>{tr('请先登录。')}</Text>{embedded ? <Pressable testID="settings-profile-login" style={styles.hit} accessibilityRole="button" onPress={() => router.push({pathname:'/family-email-account',params:{returnTo:'settings'}})}><Text style={styles.action}>{tr('登录')}</Text></Pressable> : null}</View> : <Pressable testID="email-account-submit" style={styles.primary} accessibilityRole="button" accessibilityState={{disabled:busy}} disabled={busy} onPress={()=>void submit()}><Text style={styles.action}>{tr(busy ? '正在处理。' : profileMode ? '保存昵称' : register ? '创建并登录' : '登录')}</Text></Pressable>}
        {!profileMode && registrationAllowed ? <Pressable testID="email-account-toggle" style={styles.hit} accessibilityRole="button" disabled={busy} onPress={()=>{setRegister(!register);setMessage(null);setPassword('');}}><Text style={styles.action}>{tr(register ? '已有账号，去登录' : '没有账号，创建一个')}</Text></Pressable> : null}
      </View> : !loading ? <Pressable style={styles.hit} accessibilityRole="button" onPress={()=>void load(++sequence.current)}><Text style={styles.action}>{tr('再试一次')}</Text></Pressable> : null}
      {!profileMode && !internal ? <Pressable style={styles.hit} accessibilityRole="button" disabled={busy} onPress={() => { if(onOtherSignIn) onOtherSignIn(); else router.push('/account-diagnostics'); }}><Text style={styles.action}>{tr('其他登录方式')}</Text></Pressable> : null}
      {profileMode && profile ? <Pressable testID="email-account-sign-out" style={styles.hit} accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy}} onPress={confirmSignOut}><Text style={styles.action}>{tr('退出登录')}</Text></Pressable> : null}
      {message ? <Text testID="email-account-message" style={styles.explanation}>{message}</Text> : null}
    </>}
  </>;
  return embedded ? <View testID="settings-profile">{content}</View> : <SettingsPage title={title} accessibilityLabel={title} backLabel={tr('返回')} onBack={cancel} pageTestID="family-email-page">{content}</SettingsPage>;
}
const styles=StyleSheet.create({form:{gap:16},input:{...type.action,color:ink,minHeight:48,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:hairline,paddingVertical:12},primary:{minHeight:48,borderRadius:24,backgroundColor:paperDeep,alignItems:'center',justifyContent:'center',padding:12},hit:{minHeight:48,justifyContent:'center'},action:{...type.action,color:sage},explanation:{...type.meta,color:inkSoft,marginVertical:16},avatar:{alignItems:'center',marginVertical:24}});
