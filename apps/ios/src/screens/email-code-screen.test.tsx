import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
import {Alert,AppState,type AppStateStatus} from 'react-native';
import EmailCodeScreen from './email-code-screen';
import {ApplicationError} from '../application/errors';

let mockOpen=true;const mockLock={snapshot:{locked:false}};
const mockApple={isAvailable:jest.fn(),requestAuthorization:jest.fn()};
jest.mock('../infrastructure/expo-apple-auth',()=>({createExpoAppleIdentityTokenSource:()=>mockApple}));
const mockService={deleteAccount:jest.fn(),getEmailCodeAvailability:jest.fn(),getEmailCodeAccount:jest.fn(),requestEmailCode:jest.fn(),verifyEmailCode:jest.fn(),finishEmailProfile:jest.fn(),signOutEmailAccount:jest.fn()};
jest.mock('../application/container',()=>({getAccountUseCases:async()=>mockService}));
jest.mock('../infrastructure/account-config',()=>({emailCodeEntryOpen:()=>mockOpen}));
jest.mock('./device-lock-context',()=>({useDeviceLock:()=>mockLock}));
jest.mock('expo-router',()=>({useFocusEffect:(callback:()=>void|(()=>void))=>{const React=jest.requireActual('react');React.useEffect(()=>{mockFocusStart=callback;const stop=callback();mockFocusStop=typeof stop==='function'?stop:undefined;return stop;},[callback]);}}));
jest.mock('./settings-chrome',()=>{const {View}=jest.requireActual('react-native');return {SettingsPage:({children}:any)=><View>{children}</View>};});
let mockSendPress:()=>void=()=>{};
jest.mock('./quiet-form',()=>{const actual=jest.requireActual('./quiet-form');const React=jest.requireActual('react');return {...actual,PageAction:(props:any)=>{if(props.testID==='email-code-send')mockSendPress=props.onPress;return React.createElement(actual.PageAction,props);}};});
let changed:(state:AppStateStatus)=>void;
let mockFocusStart:(()=>void|(()=>void))|undefined,mockFocusStop:(()=>void)|undefined;
beforeEach(()=>{
  jest.clearAllMocks();mockApple.isAvailable.mockResolvedValue(true);mockApple.requestAuthorization.mockResolvedValue({identityToken:'apple',authorizationCode:'code'});mockOpen=true;mockLock.snapshot.locked=false;
  Object.defineProperty(AppState,'currentState',{configurable:true,value:'active'});
  jest.spyOn(AppState,'addEventListener').mockImplementation((event,listener)=>{if(event==='change')changed=listener;return {remove:jest.fn()};});
  mockService.getEmailCodeAvailability.mockResolvedValue(true);mockService.getEmailCodeAccount.mockResolvedValue({signedIn:false,linked:false});
  mockService.requestEmailCode.mockResolvedValue({challengeId:'challenge',expiresAt:new Date(Date.now()+300000).toISOString(),resendAfterSeconds:60});
  mockService.verifyEmailCode.mockResolvedValue({signedIn:true,userId:'a',needsProfile:false});
  mockService.finishEmailProfile.mockResolvedValue({userId:'a',nickname:'小禾'});
});
async function form(){const page=await render(<EmailCodeScreen onCancel={jest.fn()} onAuthenticated={jest.fn()}/>);await waitFor(()=>expect(page.getByTestId('email-code-address')).toBeTruthy());return page;}
async function send(page:Awaited<ReturnType<typeof form>>){if(page.queryByTestId('email-code-address'))await fireEvent.changeText(page.getByTestId('email-code-address'),' Person@Example.com ');await fireEvent.press(page.getByTestId('email-code-send'));}

it('hides controls when closed, the service is unconfigured or the device is locked',async()=>{
 mockOpen=false;const page=await render(<EmailCodeScreen onCancel={jest.fn()}/>);expect(mockService.getEmailCodeAvailability).not.toHaveBeenCalled();expect(page.queryByTestId('email-code-address')).toBeNull();await page.unmount();
 mockOpen=true;mockService.getEmailCodeAvailability.mockResolvedValue(false);const offline=await render(<EmailCodeScreen onCancel={jest.fn()}/>);await waitFor(()=>expect(offline.getByText('邮箱登录暂未开放。')).toBeTruthy());expect(offline.queryByTestId('email-code-address')).toBeNull();await offline.unmount();
 mockLock.snapshot.locked=true;await render(<EmailCodeScreen onCancel={jest.fn()}/>);
});
it('sends a normalized address, limits resend and returns after an existing-account login',async()=>{
 const done=jest.fn();const page=await render(<EmailCodeScreen onCancel={jest.fn()} onAuthenticated={done}/>);
 await waitFor(()=>expect(page.getByTestId('email-code-address')).toBeTruthy());await send(page);
 expect(mockService.requestEmailCode).toHaveBeenCalledWith({email:'person@example.com',intent:'login',language:'zh'},expect.any(Function),null);
 expect(page.getByTestId('email-code-send')).toBeDisabled();await fireEvent.changeText(page.getByTestId('email-code-value'),'123456');await fireEvent.press(page.getByTestId('email-code-verify'));
 expect(mockService.verifyEmailCode).toHaveBeenCalledWith(expect.objectContaining({email:'person@example.com',code:'123456',intent:'login'}),expect.any(Function));expect(done).toHaveBeenCalledTimes(1);
});
it('asks a new account for a name before returning to its original destination',async()=>{
 mockService.verifyEmailCode.mockResolvedValue({signedIn:true,userId:'a',needsProfile:true});const done=jest.fn();
 const page=await render(<EmailCodeScreen onCancel={jest.fn()} onAuthenticated={done}/>);await waitFor(()=>expect(page.getByTestId('email-code-address')).toBeTruthy());await send(page);
 await fireEvent.changeText(page.getByTestId('email-code-value'),'123456');await fireEvent.press(page.getByTestId('email-code-verify'));expect(done).not.toHaveBeenCalled();
 await fireEvent.changeText(page.getByTestId('email-code-name'),'小禾');await fireEvent.press(page.getByTestId('email-code-name-save'));
 expect(mockService.finishEmailProfile).toHaveBeenCalledWith('小禾','a',expect.any(Function));expect(done).toHaveBeenCalledTimes(1);
});
it('keeps the challenge while checking email in another app, but clears entered digits',async()=>{
 const page=await form();await send(page);await fireEvent.changeText(page.getByTestId('email-code-value'),'123');
 await act(async()=>changed('background'));expect(page.queryByTestId('email-code-value')).toBeNull();await act(async()=>changed('active'));
 expect(page.getByTestId('email-code-value').props.value).toBe('');expect(mockService.requestEmailCode).toHaveBeenCalledTimes(1);
});
it('does not accept a verification completion after backgrounding',async()=>{
 let finish!:(v:unknown)=>void;let live!:()=>boolean;
 mockService.verifyEmailCode.mockImplementation(async(_input,current)=>{live=current;return new Promise(resolve=>{finish=resolve;});});
 const done=jest.fn();const page=await render(<EmailCodeScreen onCancel={jest.fn()} onAuthenticated={done}/>);await waitFor(()=>expect(page.getByTestId('email-code-address')).toBeTruthy());await send(page);
 await fireEvent.changeText(page.getByTestId('email-code-value'),'123456');await fireEvent.press(page.getByTestId('email-code-verify'));
 await act(async()=>changed('background'));expect(live()).toBe(false);await act(async()=>finish({signedIn:true,userId:'a',needsProfile:false}));await act(async()=>changed('active'));expect(done).not.toHaveBeenCalled();expect(page.queryByTestId('email-code-value')).toBeNull();
});
it('clears the challenge if the user edits the email, and shows a wrong-code message without creating a new request',async()=>{
 mockService.verifyEmailCode.mockRejectedValueOnce(new ApplicationError('EMAIL_CODE_INVALID','wrong'));
 const page=await form();await send(page);await fireEvent.changeText(page.getByTestId('email-code-value'),'123456');await fireEvent.press(page.getByTestId('email-code-verify'));
 expect(page.getByText('验证码不正确、已过期或已使用，请重试或重新获取。')).toBeTruthy();expect(mockService.requestEmailCode).toHaveBeenCalledTimes(1);
 await fireEvent.changeText(page.getByTestId('email-code-address'),'new@example.com');expect(page.queryByTestId('email-code-value')).toBeNull();
});
it('binds an email to the displayed signed-in account instead of opening a second account',async()=>{
 mockService.getEmailCodeAccount.mockResolvedValue({signedIn:true,linked:false,userId:'a'});mockService.verifyEmailCode.mockResolvedValue({linked:true,userId:'a'});
 const page=await form();await send(page);expect(mockService.requestEmailCode).toHaveBeenCalledWith(expect.objectContaining({intent:'link'}),expect.any(Function),'a');
});
it('changes an existing email through a distinct purpose and requires explicit deletion confirmation',async()=>{
 mockService.getEmailCodeAccount.mockResolvedValue({signedIn:true,linked:true,userId:'a',maskedEmail:'p***@example.com',reauthenticationExpiresAt:new Date(Date.now()+300000).toISOString()});
 const page=await render(<EmailCodeScreen onCancel={jest.fn()}/>);await waitFor(()=>expect(page.getByTestId('email-code-change')).toBeTruthy());
 await fireEvent.press(page.getByTestId('email-code-change'));await send(page);
 expect(mockService.requestEmailCode).toHaveBeenLastCalledWith(expect.objectContaining({intent:'change'}),expect.any(Function),'a');await page.unmount();
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 const deletion=await render(<EmailCodeScreen onCancel={jest.fn()}/>);
 try {
  await waitFor(()=>expect(deletion.getByTestId('email-code-delete')).toBeTruthy());await fireEvent.press(deletion.getByTestId('email-code-delete'));
  expect(mockService.verifyEmailCode).not.toHaveBeenCalled();await act(async()=>alert.mock.calls[0][2]![1].onPress!());
  await send(deletion);await fireEvent.changeText(deletion.getByTestId('email-code-value'),'123456');await fireEvent.press(deletion.getByTestId('email-code-verify'));
  expect(mockService.verifyEmailCode).not.toHaveBeenCalled();mockService.verifyEmailCode.mockResolvedValue({deleted:true,appleRevocation:'not-linked',mediaCleanup:'completed'});
  await act(async()=>alert.mock.calls[1][2]![1].onPress!());
  expect(mockService.verifyEmailCode).toHaveBeenCalledWith(expect.objectContaining({intent:'delete',confirmation:'delete-my-lampy-account-v1'}),expect.any(Function));
 } finally {alert.mockRestore();await deletion.unmount();}
});


it('shows a verified email and does not request identity confirmation again during the recent-authentication window',async()=>{
 mockService.getEmailCodeAccount.mockResolvedValue({signedIn:true,linked:true,userId:'a',maskedEmail:'p***@example.com',reauthenticationExpiresAt:new Date(Date.now()+300000).toISOString()});
 const page=await render(<EmailCodeScreen onCancel={jest.fn()}/>);
 await waitFor(()=>expect(page.getByTestId('email-code-change')).toBeTruthy());
 expect(page.getByText('邮箱已验证。')).toBeTruthy();expect(page.queryByTestId('email-code-reauth')).toBeNull();
 await fireEvent.press(page.getByTestId('email-code-change'));expect(page.queryByText('先验证当前邮箱')).toBeNull();
});

it('moves from successful identity confirmation to a fresh new-email form without reusing the old challenge',async()=>{
 mockService.getEmailCodeAccount.mockResolvedValue({signedIn:true,linked:true,userId:'a',maskedEmail:'p***@example.com'});
 mockService.verifyEmailCode.mockResolvedValue({reauthenticated:true,userId:'a'});
 const page=await render(<EmailCodeScreen onCancel={jest.fn()}/>);await waitFor(()=>expect(page.getByTestId('email-code-change')).toBeTruthy());
 await fireEvent.press(page.getByTestId('email-code-change'));
 expect(page.queryByTestId('email-code-address')).toBeNull();expect(page.getByText('当前邮箱：p***@example.com')).toBeTruthy();await send(page);
 expect(mockService.requestEmailCode).toHaveBeenLastCalledWith({intent:'reauth',language:'zh'},expect.any(Function),'a');
 await fireEvent.changeText(page.getByTestId('email-code-value'),'123456');
 mockService.getEmailCodeAccount.mockResolvedValue({signedIn:true,linked:true,userId:'a',maskedEmail:'p***@example.com',reauthenticationExpiresAt:new Date(Date.now()+300000).toISOString()});
 await fireEvent.press(page.getByTestId('email-code-verify'));
 expect(page.getByText('身份已确认，请输入新的邮箱地址。')).toBeTruthy();expect(page.queryByText('先验证当前邮箱')).toBeNull();
 expect(page.getByTestId('email-code-address').props.value).toBe('');expect(page.queryByTestId('email-code-value')).toBeNull();
 await fireEvent.changeText(page.getByTestId('email-code-address'),'new@example.com');await fireEvent.press(page.getByTestId('email-code-send'));
 expect(mockService.requestEmailCode).toHaveBeenLastCalledWith(expect.objectContaining({email:'new@example.com',intent:'change'}),expect.any(Function),'a');
});

it('does not imply delivery or show a code field when the first send is rate limited, and uses the real wait',async()=>{
 mockService.requestEmailCode.mockRejectedValueOnce(new ApplicationError('RATE_LIMITED','Too many requests',2700));
 const page=await form();await send(page);
 expect(page.queryByTestId('email-code-value')).toBeNull();expect(page.getByTestId('email-code-send')).toBeDisabled();
 expect(page.getByText(/稍后重试 \(2700\)/)).toBeTruthy();expect(page.queryByText('验证码已发出，请查看收件箱或垃圾邮件。')).toBeNull();
});

it('does not invent a 60-second countdown for a legacy rate-limit response without a retry time',async()=>{
 mockService.requestEmailCode.mockRejectedValueOnce(new ApplicationError('RATE_LIMITED','Too many requests'));
 const page=await form();await send(page);expect(page.getByText('发送过于频繁，本次没有发出邮件，请稍后再试。')).toBeTruthy();
 expect(page.queryByTestId('email-code-value')).toBeNull();expect(page.queryByText(/重新获取 \(/)).toBeNull();
});

it('keeps only an actually delivered, unexpired code on a failed resend and hides it after expiry',async()=>{
 jest.useFakeTimers();
 try {
  mockService.requestEmailCode.mockResolvedValueOnce({challengeId:'old',expiresAt:new Date(Date.now()+300000).toISOString(),resendAfterSeconds:60});
  const page=await form();await send(page);await act(async()=>jest.advanceTimersByTime(61000));
  mockService.requestEmailCode.mockRejectedValueOnce(new ApplicationError('RATE_LIMITED','Too many requests',1800));
  await fireEvent.press(page.getByTestId('email-code-send'));
  expect(page.getByTestId('email-code-value')).toBeTruthy();expect(page.getByText('新验证码没有发出，仍可使用上一封邮件中的有效验证码。')).toBeTruthy();
  await act(async()=>jest.advanceTimersByTime(240000));expect(page.queryByTestId('email-code-value')).toBeNull();await page.unmount();
 }finally{jest.useRealTimers();}
});

it('offers an editable default nickname and explains the one-time choice before saving',async()=>{
 mockService.verifyEmailCode.mockResolvedValue({signedIn:true,userId:'a',needsProfile:true});
 const page=await form();await send(page);await fireEvent.changeText(page.getByTestId('email-code-value'),'123456');await fireEvent.press(page.getByTestId('email-code-verify'));
 expect(page.getByTestId('email-code-name').props.value).toBe('生活记录者');
 expect(page.getByText('昵称仅能在首次登录时设置，保存后无法修改。')).toBeTruthy();
 await fireEvent.press(page.getByTestId('email-code-name-save'));expect(mockService.finishEmailProfile).toHaveBeenCalledWith('生活记录者','a',expect.any(Function));
});
it('never displays a code entry or fake resend countdown when deletion mail is rate limited',async()=>{
 mockService.getEmailCodeAccount.mockResolvedValue({signedIn:true,linked:true,userId:'a',maskedEmail:'p***@example.com'});
 mockService.requestEmailCode.mockRejectedValueOnce(new ApplicationError('RATE_LIMITED','Too many requests',1800));
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 const page=await render(<EmailCodeScreen onCancel={jest.fn()}/>);
 try{
  await waitFor(()=>expect(page.getByTestId('email-code-delete')).toBeTruthy());await fireEvent.press(page.getByTestId('email-code-delete'));
  await act(async()=>alert.mock.calls[0][2]![1].onPress!());await send(page);
  expect(mockService.requestEmailCode).toHaveBeenCalledWith(expect.objectContaining({intent:'delete'}),expect.any(Function),'a');
  expect(page.queryByTestId('email-code-value')).toBeNull();expect(page.getByText(/稍后重试 \(1800\)/)).toBeTruthy();expect(mockService.verifyEmailCode).not.toHaveBeenCalled();
 }finally{alert.mockRestore();await page.unmount();}
});

it('clears deletion form and countdowns, then returns to settings without calling the sign-in callback',async()=>{
 mockService.getEmailCodeAccount.mockResolvedValue({signedIn:true,linked:true,userId:'a',maskedEmail:'p***@example.com'});
 mockService.verifyEmailCode.mockResolvedValue({deleted:true,appleRevocation:'manual-required',mediaCleanup:'completed'});
 const deleted=jest.fn(),signedIn=jest.fn();const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 const page=await render(<EmailCodeScreen onCancel={jest.fn()} onDeleted={deleted} onAuthenticated={signedIn}/>);
 try{
  await waitFor(()=>expect(page.getByTestId('email-code-delete')).toBeTruthy());await fireEvent.press(page.getByTestId('email-code-delete'));
  await act(async()=>alert.mock.calls[0][2]![1].onPress!());await send(page);
  await fireEvent.changeText(page.getByTestId('email-code-value'),'123456');await fireEvent.press(page.getByTestId('email-code-verify'));
  await act(async()=>alert.mock.calls[1][2]![1].onPress!());
  expect(deleted).toHaveBeenCalledTimes(1);expect(signedIn).not.toHaveBeenCalled();
  expect(page.queryByTestId('email-code-value')).toBeNull();expect(page.getByTestId('email-code-address').props.value).toBe('');
  expect(page.getByTestId('email-code-send')).not.toBeDisabled();expect(page.queryByText(/重新获取 \(/)).toBeNull();
  expect(alert).toHaveBeenLastCalledWith('账号已删除','账号已删除。请在 Apple 账号设置中停止使用 Lampy 登录。');
 }finally{alert.mockRestore();await page.unmount();}
});

it('explains sign-in versus sign-up while keeping one email-code flow and preserving a sent challenge',async()=>{
 const page=await form();expect(page.getByText('登录 Lampy')).toBeTruthy();
 expect(page.getByText('登录和注册都使用邮箱验证码，无需设置密码。')).toBeTruthy();
 await fireEvent.press(page.getByTestId('email-code-entry-toggle'));expect(page.getByText('注册 Lampy')).toBeTruthy();
 expect(page.getByText('已有 Lampy 账号？登录')).toBeTruthy();expect(mockService.requestEmailCode).not.toHaveBeenCalled();
 await send(page);await fireEvent.press(page.getByTestId('email-code-entry-toggle'));
 expect(page.getByText('登录 Lampy')).toBeTruthy();expect(page.getByTestId('email-code-value')).toBeTruthy();
 expect(mockService.requestEmailCode).toHaveBeenCalledTimes(1);
 await fireEvent.changeText(page.getByTestId('email-code-value'),'123456');await fireEvent.press(page.getByTestId('email-code-verify'));
 expect(mockService.verifyEmailCode).toHaveBeenCalledWith(expect.objectContaining({intent:'login'}),expect.any(Function));
});

async function linkedDeletion() {
 mockService.getEmailCodeAccount.mockResolvedValue({signedIn:true,linked:true,appleLinked:true,userId:'a',nickname:'小禾'});
 const done=jest.fn();const page=await render(<EmailCodeScreen onCancel={jest.fn()} onDeleted={done}/>);
 await waitFor(()=>expect(page.getByTestId('email-code-delete')).toBeTruthy());
 const alert=jest.spyOn(Alert,'alert');await fireEvent.press(page.getByTestId('email-code-delete'));
 const buttons=alert.mock.calls.at(-1)![2]!;await act(async()=>buttons[1].onPress?.());
 return {page,done};
}
it('uses fresh Apple authorization for a linked account, without requesting a deletion email',async()=>{
 mockService.deleteAccount.mockImplementation(async(authorize,current,owner)=>{expect(owner).toBe('a');expect(current()).toBe(true);expect(await authorize('nonce')).toEqual({identityToken:'apple',authorizationCode:'code'});return {deleted:true,appleRevocation:'revoked',mediaCleanup:'completed'};});
 const {done}=await linkedDeletion();await waitFor(()=>expect(done).toHaveBeenCalledTimes(1));
 expect(mockApple.requestAuthorization).toHaveBeenCalledWith('nonce');expect(mockService.requestEmailCode).not.toHaveBeenCalled();
});
it('retains the account when Apple authorization is cancelled',async()=>{
 mockApple.requestAuthorization.mockRejectedValue(new ApplicationError('APPLE_SIGN_IN_CANCELLED','cancel'));
 mockService.deleteAccount.mockImplementation(async authorize=>{await authorize('nonce');throw Error('must not delete');});
 const {page,done}=await linkedDeletion();await waitFor(()=>expect(page.getByText('已取消验证，账号仍保留。')).toBeTruthy());expect(done).not.toHaveBeenCalled();expect(page.getByTestId('email-code-nickname')).toBeTruthy();
});
it('rejects a native credential returned after backgrounding',async()=>{
 mockService.deleteAccount.mockImplementation(async authorize=>{await authorize('nonce');throw Error('must not delete');});
 mockApple.requestAuthorization.mockImplementation(async()=>{changed('background');return {identityToken:'apple',authorizationCode:'code'};});
 const {done}=await linkedDeletion();await act(async()=>changed('active'));expect(done).not.toHaveBeenCalled();
});
it('allows the brief inactive state of the Apple sheet',async()=>{
 mockService.deleteAccount.mockImplementation(async authorize=>{await authorize('nonce');return {deleted:true,appleRevocation:'revoked',mediaCleanup:'completed'};});
 mockApple.requestAuthorization.mockImplementation(async()=>{changed('inactive');changed('active');return {identityToken:'apple',authorizationCode:'code'};});
 const {done}=await linkedDeletion();await waitFor(()=>expect(done).toHaveBeenCalledTimes(1));
});

it('ignores a deletion confirmation left over after leaving the screen',async()=>{
 mockService.getEmailCodeAccount.mockResolvedValue({signedIn:true,linked:true,appleLinked:true,userId:'a'});
 const page=await render(<EmailCodeScreen onCancel={jest.fn()}/>);await waitFor(()=>expect(page.getByTestId('email-code-delete')).toBeTruthy());
 const alert=jest.spyOn(Alert,'alert');await fireEvent.press(page.getByTestId('email-code-delete'));const confirm=alert.mock.calls.at(-1)![2]![1];
 await page.unmount();await act(async()=>confirm.onPress?.());expect(mockService.deleteAccount).not.toHaveBeenCalled();expect(mockApple.requestAuthorization).not.toHaveBeenCalled();
});

async function startEmailDeletion(onManageFamily=jest.fn()){
 mockService.getEmailCodeAccount.mockResolvedValue({signedIn:true,linked:true,userId:'a',maskedEmail:'a***@example.com'});
 const page=await render(<EmailCodeScreen onCancel={jest.fn()} onManageFamily={onManageFamily}/>);
 await waitFor(()=>expect(page.getByTestId('email-code-delete')).toBeTruthy());
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});await fireEvent.press(page.getByTestId('email-code-delete'));
 await act(async()=>alert.mock.calls.at(-1)![2]![1].onPress?.());
 return {page,alert,onManageFamily};
}
it('explains the managed-family block beside Send a code, without implying mail or deletion succeeded',async()=>{
 mockService.requestEmailCode.mockRejectedValue(new ApplicationError('ACCOUNT_HAS_MANAGED_FAMILY','managed'));
 const {page,onManageFamily}=await startEmailDeletion();await send(page);
 expect(page.getByTestId('email-code-feedback').props.children).toContain('本次没有发送验证码');expect(page.getByTestId('email-code-feedback').props.children).toContain('移交');
 expect(page.queryByTestId('email-code-value')).toBeNull();expect(page.getByTestId('email-code-send')).toBeDisabled();expect(mockService.verifyEmailCode).not.toHaveBeenCalled();
 await fireEvent.press(page.getByTestId('email-code-manage-family'));expect(onManageFamily).toHaveBeenCalledTimes(1);expect(mockService.deleteAccount).not.toHaveBeenCalled();
});
it('checks the account again after a family block, requiring a new explicit send rather than auto-deleting',async()=>{
 mockService.requestEmailCode.mockRejectedValueOnce(new ApplicationError('ACCOUNT_HAS_MANAGED_FAMILY','managed'));
 const {page,alert}=await startEmailDeletion();await send(page);await fireEvent.press(page.getByTestId('email-code-refresh-account'));
 await waitFor(()=>expect(page.getByTestId('email-code-delete')).toBeTruthy());expect(mockService.requestEmailCode).toHaveBeenCalledTimes(1);
 await fireEvent.press(page.getByTestId('email-code-delete'));await act(async()=>alert.mock.calls.at(-1)![2]![1].onPress?.());await send(page);
 expect(page.getByTestId('email-code-value')).toBeTruthy();expect(mockService.requestEmailCode).toHaveBeenCalledTimes(2);expect(mockService.verifyEmailCode).not.toHaveBeenCalled();
});
it('shows sending immediately and coalesces taps before the disabled state renders',async()=>{
 let finish!:(value:unknown)=>void;mockService.requestEmailCode.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const {page}=await startEmailDeletion();const press=mockSendPress;
 await act(async()=>{press();press();});expect(mockService.requestEmailCode).toHaveBeenCalledTimes(1);expect(page.getByText('正在发送验证码…')).toBeTruthy();expect(page.queryByTestId('email-code-value')).toBeNull();
 await act(async()=>finish({challengeId:'challenge',expiresAt:new Date(Date.now()+300000).toISOString(),resendAfterSeconds:60}));expect(page.getByTestId('email-code-value')).toBeTruthy();
});
it('does not leave Send disabled after leaving an in-flight request and refocusing',async()=>{
 let finish!:(value:unknown)=>void;mockService.requestEmailCode.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const {page,alert}=await startEmailDeletion();await send(page);expect(page.getByText('正在发送验证码…')).toBeTruthy();
 await act(async()=>{mockFocusStop?.();const stop=mockFocusStart?.();mockFocusStop=typeof stop==='function'?stop:undefined;});
 await waitFor(()=>expect(page.getByTestId('email-code-delete')).toBeTruthy());await fireEvent.press(page.getByTestId('email-code-delete'));await act(async()=>alert.mock.calls.at(-1)![2]![1].onPress?.());
 expect(page.getByTestId('email-code-send')).not.toBeDisabled();await act(async()=>finish({challengeId:'late',expiresAt:new Date(Date.now()+300000).toISOString(),resendAfterSeconds:60}));expect(page.queryByTestId('email-code-value')).toBeNull();
 await send(page);expect(page.getByTestId('email-code-value')).toBeTruthy();
});
it('does not claim mail delivery after a send timeout, or claim deletion after an uncertain verification response',async()=>{
 mockService.requestEmailCode.mockRejectedValueOnce(new ApplicationError('SERVER_UNREACHABLE','timeout'));
 const {page,alert}=await startEmailDeletion();await send(page);expect(page.getByTestId('email-code-feedback').props.children).toContain('无法确认邮件是否发出');expect(page.queryByTestId('email-code-value')).toBeNull();
 await send(page);await fireEvent.changeText(page.getByTestId('email-code-value'),'123456');mockService.verifyEmailCode.mockRejectedValueOnce(new ApplicationError('SERVER_UNREACHABLE','timeout'));
 await fireEvent.press(page.getByTestId('email-code-verify'));await act(async()=>alert.mock.calls.at(-1)![2]![1].onPress?.());
 expect(page.getByTestId('email-code-feedback').props.children).toContain('无法确认删除结果');expect(page.queryByTestId('email-code-value')).toBeNull();expect(page.getByTestId('email-code-refresh-account')).toBeTruthy();expect(page.getByTestId('email-code-send')).toBeDisabled();expect(mockService.verifyEmailCode).toHaveBeenCalledTimes(1);
});
