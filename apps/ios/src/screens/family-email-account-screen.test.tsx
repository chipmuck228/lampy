import { Alert, AppState } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ApplicationError } from '../application/errors';
import FamilyEmailAccountScreen from './family-email-account-screen';
const mockDelete=jest.fn(),mockAuthorization=jest.fn();let mockFormal=false;
const mockAppleAvailable=jest.fn();const mockAppleToken=jest.fn();const mockAppleStatus=jest.fn();const mockAuthenticateApple=jest.fn();
jest.mock('../infrastructure/expo-apple-auth',()=>({createExpoAppleIdentityTokenSource:()=>({isAvailable:mockAppleAvailable,requestIdentityToken:mockAppleToken,requestAuthorization:mockAuthorization})}));
jest.mock('./apple-auth-button',()=>{const {Pressable,Text}=jest.requireActual('react-native');return {AppleAuthButton:({disabled,onPress}:any)=><Pressable testID="apple-auth-button" disabled={disabled} onPress={onPress}><Text>Apple</Text></Pressable>};});
let mockInternal=false;let mockDiagnostics=true;
const mockPush=jest.fn(),mockDismiss=jest.fn(),mockBack=jest.fn();
const mockSignOut=jest.fn();
const mockHealth=jest.fn(),mockRegister=jest.fn(),mockLogin=jest.fn(),mockRead=jest.fn(),mockUpdate=jest.fn();
let mockOpen=true;const mockLock={snapshot:{locked:false}};
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush,dismissTo:mockDismiss,back:mockBack,canGoBack:()=>true}),useFocusEffect:(callback:()=>unknown)=>{const React=jest.requireActual('react');React.useEffect(callback,[callback]);}}));
jest.mock('../application/container',()=>({getFamilyUseCases:async()=>({deleteAccount:mockDelete,getAppleLink:mockAppleStatus,authenticateApple:mockAuthenticateApple,signOut:mockSignOut,getControlledEmailAvailability:mockHealth,registerControlledEmail:mockRegister,signInWithControlledEmail:mockLogin,getMyProfile:mockRead,updateMyProfile:mockUpdate})}));
jest.mock('../infrastructure/family-config',()=>({isFamilyV1ReleaseBuild:()=>mockFormal,isFamilyInternalTestBuild:()=>mockInternal,isControlledEmailAccountsOpen:()=>mockOpen,isFamilyProductEntryOpen:()=>true}));
jest.mock('../application/personal-settings-visibility',()=>({isPersonalSettingsDiagnosticsOpen:()=>mockDiagnostics}));
jest.mock('./device-lock-context',()=>({useDeviceLock:()=>mockLock}));
jest.mock('./settings-chrome',()=>{const {View}=jest.requireActual('react-native');return {SettingsPage:({children}:any)=><View>{children}</View>};});
jest.mock('./life-icons',()=>({LifeIcon:()=>null}));
beforeEach(()=>{jest.clearAllMocks();jest.spyOn(AppState,'addEventListener').mockImplementation(()=>({remove:jest.fn()}));mockFormal=false;mockInternal=false;mockDiagnostics=true;mockOpen=true;mockLock.snapshot.locked=false;Object.defineProperty(AppState,'currentState',{configurable:true,value:'active'});mockHealth.mockResolvedValue({controlledEmailAccounts:true,emailRegistration:true});mockRegister.mockResolvedValue({userId:'a'});mockLogin.mockResolvedValue({userId:'a'});mockRead.mockResolvedValue({userId:'a',nickname:'原昵称',avatar:'system',updatedAt:'now'});mockUpdate.mockImplementation(async(nickname:string)=>({userId:'a',nickname,avatar:'system',updatedAt:'now'}));});
it('closed and locked routes never read service or show identity controls',async()=>{
 mockOpen=false;const page=await render(<FamilyEmailAccountScreen/>);expect(mockHealth).not.toHaveBeenCalled();expect(page.queryByTestId('email-account-email')).toBeNull();await page.unmount();mockOpen=true;mockLock.snapshot.locked=true;await render(<FamilyEmailAccountScreen/>);expect(mockHealth).not.toHaveBeenCalled();
});
it('registers with explicit nickname then returns once, without accepting any family',async()=>{
 const done=jest.fn();const page=await render(<FamilyEmailAccountScreen onAuthenticated={done}/>);await waitFor(()=>expect(page.getByTestId('email-account-toggle')).toBeTruthy());
 await fireEvent.press(page.getByTestId('email-account-toggle'));await fireEvent.changeText(page.getByTestId('email-account-email'),'a@example.com');await fireEvent.changeText(page.getByTestId('email-account-password'),'safe-password');await fireEvent.changeText(page.getByTestId('email-account-nickname'),'小禾');await fireEvent.press(page.getByTestId('email-account-submit'));
 expect(mockRegister).toHaveBeenCalledWith({email:'a@example.com',password:'safe-password',nickname:'小禾'},expect.any(Function));expect(done).toHaveBeenCalledTimes(1);
});
it('busy submission cannot create twice and an unmounted late result never navigates',async()=>{
 let finish!:(value:unknown)=>void;mockLogin.mockReturnValue(new Promise(r=>{finish=r;}));const done=jest.fn();const page=await render(<FamilyEmailAccountScreen onAuthenticated={done}/>);await waitFor(()=>expect(page.getByTestId('email-account-email')).toBeTruthy());
 await fireEvent.changeText(page.getByTestId('email-account-email'),'a@example.com');await fireEvent.changeText(page.getByTestId('email-account-password'),'safe-password');await fireEvent.press(page.getByTestId('email-account-submit'));await fireEvent.press(page.getByTestId('email-account-submit'));expect(mockLogin).toHaveBeenCalledTimes(1);
 const eligibility=mockLogin.mock.calls[0][1];await page.unmount();expect(eligibility()).toBe(false);await act(async()=>finish({userId:'a'}));expect(done).not.toHaveBeenCalled();expect(mockDismiss).not.toHaveBeenCalled();
});
it('profile saves nickname and errors preserve form for retry',async()=>{
 const page=await render(<FamilyEmailAccountScreen profileMode/>);await waitFor(()=>expect(page.getByTestId('email-account-nickname').props.value).toBe('原昵称'));await fireEvent.changeText(page.getByTestId('email-account-nickname'),'新昵称');mockUpdate.mockRejectedValueOnce(new Error('offline'));await fireEvent.press(page.getByTestId('email-account-submit'));expect(page.getByTestId('email-account-nickname').props.value).toBe('新昵称');await fireEvent.press(page.getByTestId('email-account-submit'));expect(mockUpdate).toHaveBeenLastCalledWith('新昵称',expect.any(Function));expect(page.getByText('昵称已保存。')).toBeTruthy();
});
it('a server-disabled or failed availability check never shows registration fields',async()=>{
 mockHealth.mockRejectedValue(new Error('offline'));const page=await render(<FamilyEmailAccountScreen/>);await waitFor(()=>expect(page.getByText('现在没有完成，请再试一次。')).toBeTruthy());expect(page.queryByTestId('email-account-email')).toBeNull();await page.unmount();mockHealth.mockResolvedValue({controlledEmailAccounts:false});const closed=await render(<FamilyEmailAccountScreen/>);await waitFor(()=>expect(closed.getByText('测试账号入口暂未开放。')).toBeTruthy());expect(closed.queryByTestId('email-account-email')).toBeNull();
});
it('internal Release allows login with diagnostics closed, without registration or alternatives',async()=>{
 mockInternal=true;mockDiagnostics=false;mockHealth.mockResolvedValue({controlledEmailAccounts:true,publicTestLogin:true,emailRegistration:false});
 const done=jest.fn();const page=await render(<FamilyEmailAccountScreen onAuthenticated={done}/>);await waitFor(()=>expect(page.getByTestId('email-account-email')).toBeTruthy());
 expect(page.queryByTestId('email-account-toggle')).toBeNull();expect(page.queryByText('其他登录方式')).toBeNull();
 await fireEvent.changeText(page.getByTestId('email-account-email'),'invited@example.com');await fireEvent.changeText(page.getByTestId('email-account-password'),'safe-password');await fireEvent.press(page.getByTestId('email-account-submit'));expect(mockLogin).toHaveBeenCalledTimes(1);expect(mockRegister).not.toHaveBeenCalled();expect(done).toHaveBeenCalledTimes(1);
});
it('internal capability mismatch fails closed',async()=>{
 mockInternal=true;mockDiagnostics=false;mockHealth.mockResolvedValue({controlledEmailAccounts:true,emailRegistration:true});const page=await render(<FamilyEmailAccountScreen/>);await waitFor(()=>expect(page.getByText('测试账号入口暂未开放。')).toBeTruthy());expect(page.queryByTestId('email-account-email')).toBeNull();
});

it('internal profile sign out is explicit and failed local revocation keeps identity',async()=>{
 mockInternal=true;mockDiagnostics=false;mockHealth.mockResolvedValue({controlledEmailAccounts:true,publicTestLogin:true,emailRegistration:false});
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});const page=await render(<FamilyEmailAccountScreen profileMode/>);await waitFor(()=>expect(page.getByTestId('email-account-sign-out')).toBeTruthy());
 await fireEvent.press(page.getByTestId('email-account-sign-out'));expect(mockSignOut).not.toHaveBeenCalled();
 const actions=alert.mock.calls[0][2]!;expect(actions[0].style).toBe('cancel');mockSignOut.mockResolvedValueOnce({local:'still-signed-in'});await act(async()=>actions[1].onPress!());expect(page.getByTestId('email-account-sign-out')).toBeTruthy();
 mockSignOut.mockResolvedValueOnce({local:'signed-out',server:'unconfirmed'});await fireEvent.press(page.getByTestId('email-account-sign-out'));await act(async()=>alert.mock.calls[1][2]![1].onPress!());expect(page.queryByTestId('email-account-sign-out')).toBeNull();expect(page.getByText('已退出这台设备，联网后会继续撤销会话。')).toBeTruthy();alert.mockRestore();
});

it('embedded settings saves and signs out in place without navigation', async () => {
 mockInternal=true;mockDiagnostics=false;mockHealth.mockResolvedValue({controlledEmailAccounts:true,publicTestLogin:true,emailRegistration:false});
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 const page=await render(<FamilyEmailAccountScreen profileMode embedded/>);
 await waitFor(()=>expect(page.getByTestId('email-account-nickname').props.value).toBe('原昵称'));
 expect(page.getByTestId('settings-profile')).toBeTruthy();
 expect(page.getByTestId('settings-profile-avatar')).toBeTruthy();
 expect(page.queryByTestId('settings-profile-login')).toBeNull();
 await fireEvent.changeText(page.getByTestId('email-account-nickname'),'新名字');
 await fireEvent.press(page.getByTestId('email-account-submit'));
 expect(mockUpdate).toHaveBeenCalledWith('新名字',expect.any(Function));
 mockSignOut.mockResolvedValue({local:'signed-out',server:'confirmed'});
 await fireEvent.press(page.getByTestId('email-account-sign-out'));
 await act(async()=>alert.mock.calls[0][2]![1].onPress!());
 expect(page.queryByTestId('email-account-nickname')).toBeNull();
 expect(page.getByTestId('settings-profile-login')).toBeTruthy();
 expect(page.queryByTestId('settings-profile-avatar')).toBeNull();
 expect(page.queryByText('请先登录。')).toBeNull();
 expect(mockPush).not.toHaveBeenCalled();expect(mockDismiss).not.toHaveBeenCalled();
 alert.mockRestore();
});
it('signed out settings offers login returning to settings, not an editable empty nickname', async () => {
 mockRead.mockRejectedValue(new ApplicationError('UNAUTHENTICATED','Sign in required'));
 const page=await render(<FamilyEmailAccountScreen profileMode embedded/>);
 await waitFor(()=>expect(page.getByTestId('settings-profile-login')).toBeTruthy());
 expect(page.queryByTestId('settings-profile-avatar')).toBeNull();
 expect(page.queryByText('请先登录。')).toBeNull();
 expect(page.queryByTestId('email-account-nickname')).toBeNull();
 await fireEvent.press(page.getByTestId('settings-profile-login'));
 expect(mockPush).toHaveBeenCalledWith({pathname:'/family-email-account',params:{returnTo:'settings'}});
});
it('settings network failure remains a retry, not a signed-out result', async () => {
 mockRead.mockRejectedValue(new Error('offline'));
 const page=await render(<FamilyEmailAccountScreen profileMode embedded/>);
 await waitFor(()=>expect(page.getByText('再试一次')).toBeTruthy());
 expect(page.queryByTestId('settings-profile-login')).toBeNull();
});


it('Apple capability is server-gated and a successful login uses invitation return callback',async()=>{
 mockHealth.mockResolvedValue({controlledEmailAccounts:true,appleLogin:true});mockAppleAvailable.mockResolvedValue(true);mockAppleToken.mockResolvedValue('native-token');
 mockAuthenticateApple.mockImplementation(async(intent,authorize,current)=>{expect(intent).toBe('login');expect(current()).toBe(true);expect(await authorize('server-nonce')).toBe('native-token');});
 const done=jest.fn();const page=await render(<FamilyEmailAccountScreen onAuthenticated={done}/>);await waitFor(()=>expect(page.getByTestId('apple-auth-button')).toBeTruthy());
 await fireEvent.press(page.getByTestId('apple-auth-button'));expect(mockAppleToken).toHaveBeenCalledWith('server-nonce');expect(done).toHaveBeenCalledTimes(1);expect(mockRegister).not.toHaveBeenCalled();
});
it('profile linking requires confirmation and remains in settings',async()=>{
 mockHealth.mockResolvedValue({controlledEmailAccounts:true,appleLogin:true});mockAppleAvailable.mockResolvedValue(true);mockAppleStatus.mockResolvedValue({linked:false});
 mockAuthenticateApple.mockResolvedValue({linked:true,userId:'a'});const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 const page=await render(<FamilyEmailAccountScreen profileMode embedded/>);await waitFor(()=>expect(page.getByTestId('apple-auth-button')).toBeTruthy());
 await fireEvent.press(page.getByTestId('apple-auth-button'));expect(mockAuthenticateApple).not.toHaveBeenCalled();await act(async()=>alert.mock.calls[0][2]![1].onPress!());
 expect(mockAuthenticateApple.mock.calls[0][0]).toBe('link');expect(page.getByText('Apple账号已关联。')).toBeTruthy();expect(page.queryByTestId('apple-auth-button')).toBeNull();expect(mockDismiss).not.toHaveBeenCalled();alert.mockRestore();
});
it('late service acquisition cannot authorize Apple after leaving the screen',async()=>{
 mockHealth.mockResolvedValue({controlledEmailAccounts:true,appleLogin:true});mockAppleAvailable.mockResolvedValue(true);
 let finish!:(v:unknown)=>void;mockAuthenticateApple.mockImplementation((intent,authorize,current)=>new Promise(resolve=>{finish=async()=>{expect(current()).toBe(false);resolve(null);};}));
 const done=jest.fn();const page=await render(<FamilyEmailAccountScreen onAuthenticated={done}/>);await waitFor(()=>expect(page.getByTestId('apple-auth-button')).toBeTruthy());
 await fireEvent.press(page.getByTestId('apple-auth-button'));await page.unmount();await act(async()=>finish(null));expect(done).not.toHaveBeenCalled();
});
it('native inactive does not consume authorization; real background cancels it',async()=>{
 mockHealth.mockResolvedValue({controlledEmailAccounts:true,appleLogin:true});mockAppleAvailable.mockResolvedValue(true);
 let returnToken!:(v:string)=>void;mockAppleToken.mockImplementation(()=>new Promise<string>(r=>{returnToken=r;}));
 mockAuthenticateApple.mockImplementation(async(_intent,authorize,current)=>{await authorize('nonce');expect(current()).toBe(true);});
 let changed!:(state:any)=>void;const subscription=jest.spyOn(AppState,'addEventListener').mockImplementation((_type,listener)=>{changed=listener;return {remove:jest.fn()};});
 const done=jest.fn();const page=await render(<FamilyEmailAccountScreen onAuthenticated={done}/>);await waitFor(()=>expect(page.getByTestId('apple-auth-button')).toBeTruthy());await fireEvent.press(page.getByTestId('apple-auth-button'));
 await waitFor(()=>expect(mockAppleToken).toHaveBeenCalled());
 await act(async()=>{Object.defineProperty(AppState,'currentState',{configurable:true,value:'inactive'});changed('inactive');});
 expect(mockAuthenticateApple.mock.calls[0][2]()).toBe(false);
 await act(async()=>{Object.defineProperty(AppState,'currentState',{configurable:true,value:'active'});changed('active');returnToken('token');});expect(done).toHaveBeenCalledTimes(1);
 await page.unmount();jest.clearAllMocks();Object.defineProperty(AppState,'currentState',{configurable:true,value:'active'});
 mockHealth.mockResolvedValue({controlledEmailAccounts:true,appleLogin:true});mockAppleAvailable.mockResolvedValue(true);
 const other=await render(<FamilyEmailAccountScreen onAuthenticated={done}/>);await waitFor(()=>expect(other.getByTestId('apple-auth-button')).toBeTruthy());await fireEvent.press(other.getByTestId('apple-auth-button'));await waitFor(()=>expect(mockAppleToken).toHaveBeenCalled());
 await act(async()=>{Object.defineProperty(AppState,'currentState',{configurable:true,value:'background'});changed('background');returnToken('late');});expect(done).not.toHaveBeenCalled();subscription.mockRestore();
});

it('Apple foreground timeout drops the old token and re-enables login without leaving the page',async()=>{
 mockHealth.mockResolvedValue({controlledEmailAccounts:true,appleLogin:true});mockAppleAvailable.mockResolvedValue(true);
 let resolveToken!:(v:string)=>void;mockAppleToken.mockImplementation(()=>new Promise<string>(r=>{resolveToken=r;}));
 const complete=jest.fn();mockAuthenticateApple.mockImplementation(async(_intent,authorize)=>{complete(await authorize('nonce'));});
 let changed!:(state:any)=>void;const subscription=jest.spyOn(AppState,'addEventListener').mockImplementation((_type,listener)=>{changed=listener;return {remove:jest.fn()};});
 const done=jest.fn();const page=await render(<FamilyEmailAccountScreen onAuthenticated={done}/>);
 await waitFor(()=>expect(page.getByTestId('apple-auth-button')).toBeTruthy());
 jest.useFakeTimers();
 try {
  await fireEvent.press(page.getByTestId('apple-auth-button'));
  await act(async()=>{Object.defineProperty(AppState,'currentState',{configurable:true,value:'inactive'});changed('inactive');resolveToken('expired-native-token');});
  expect(page.getByTestId('email-account-submit')).toBeDisabled();
  await act(async()=>{await jest.advanceTimersByTimeAsync(30_000);});
  expect(page.getByTestId('email-account-submit')).toBeEnabled();
  expect(complete).not.toHaveBeenCalled();expect(done).not.toHaveBeenCalled();
  await act(async()=>{Object.defineProperty(AppState,'currentState',{configurable:true,value:'active'});changed('active');});
  await waitFor(()=>expect(page.getByTestId('apple-auth-button')).toBeEnabled());
  expect(page.getByText('Apple授权等待已结束，请重新试一次。')).toBeTruthy();
  mockAppleToken.mockResolvedValue('fresh-native-token');await fireEvent.press(page.getByTestId('apple-auth-button'));
  expect(complete).toHaveBeenCalledTimes(1);expect(complete).toHaveBeenCalledWith('fresh-native-token');expect(done).toHaveBeenCalledTimes(1);
 } finally {await page.unmount();jest.useRealTimers();subscription.mockRestore();}
});

it('Apple timeout while protected stays concealed, then unlock permits explicit linking retry',async()=>{
 mockHealth.mockResolvedValue({controlledEmailAccounts:true,appleLogin:true});mockAppleAvailable.mockResolvedValue(true);mockAppleStatus.mockResolvedValue({linked:false});
 let resolveToken!:(v:string)=>void;mockAppleToken.mockImplementation(()=>new Promise<string>(r=>{resolveToken=r;}));
 const complete=jest.fn();mockAuthenticateApple.mockImplementation(async(_intent,authorize)=>{complete(await authorize('nonce'));});
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 const subscription=jest.spyOn(AppState,'addEventListener').mockImplementation(()=>({remove:jest.fn()}));
 const page=await render(<FamilyEmailAccountScreen profileMode embedded/>);await waitFor(()=>expect(page.getByTestId('apple-auth-button')).toBeTruthy());jest.useFakeTimers();
 try {
  await fireEvent.press(page.getByTestId('apple-auth-button'));await act(async()=>alert.mock.calls[0][2]![1].onPress!());
  mockLock.snapshot.locked=true;await page.rerender(<FamilyEmailAccountScreen profileMode embedded/>);
  await act(async()=>resolveToken('expired-native-token'));
  await act(async()=>{await jest.advanceTimersByTimeAsync(30_000);});
  expect(page.queryByTestId('apple-auth-button')).toBeNull();expect(page.queryByTestId('email-account-nickname')).toBeNull();expect(complete).not.toHaveBeenCalled();
  mockLock.snapshot.locked=false;await page.rerender(<FamilyEmailAccountScreen profileMode embedded/>);
  await waitFor(()=>expect(page.getByTestId('apple-auth-button')).toBeEnabled());
  expect(page.getByText('Apple授权等待已结束，请重新试一次。')).toBeTruthy();expect(page.getByTestId('email-account-nickname').props.editable).toBe(true);
  mockAppleToken.mockResolvedValue('fresh-native-token');await fireEvent.press(page.getByTestId('apple-auth-button'));expect(complete).not.toHaveBeenCalled();
  await act(async()=>alert.mock.calls[1][2]![1].onPress!());
  expect(complete).toHaveBeenCalledWith('fresh-native-token');expect(page.getByText('Apple账号已关联。')).toBeTruthy();expect(mockDismiss).not.toHaveBeenCalled();
 } finally {await page.unmount();mockLock.snapshot.locked=false;jest.useRealTimers();alert.mockRestore();subscription.mockRestore();}
});

it('late Apple A completion cannot clear the newer B submission lock',async()=>{
 mockHealth.mockResolvedValue({controlledEmailAccounts:true,appleLogin:true});mockAppleAvailable.mockResolvedValue(true);mockAppleToken.mockResolvedValue('native-token');
 let finishA!:(v:unknown)=>void,finishB!:(v:unknown)=>void;let calls=0;
 mockAuthenticateApple.mockImplementation(async(_intent,authorize)=>{await authorize('nonce');return new Promise(r=>{if(++calls===1)finishA=r;else finishB=r;});});
 let changed!:(state:any)=>void;const subscription=jest.spyOn(AppState,'addEventListener').mockImplementation((_type,listener)=>{changed=listener;return {remove:jest.fn()};});
 const done=jest.fn();const page=await render(<FamilyEmailAccountScreen onAuthenticated={done}/>);
 try {
  await waitFor(()=>expect(page.getByTestId('apple-auth-button')).toBeTruthy());await fireEvent.press(page.getByTestId('apple-auth-button'));await waitFor(()=>expect(calls).toBe(1));
  await act(async()=>{Object.defineProperty(AppState,'currentState',{configurable:true,value:'background'});changed('background');});
  await act(async()=>{Object.defineProperty(AppState,'currentState',{configurable:true,value:'active'});changed('active');});
  await waitFor(()=>expect(page.getByTestId('apple-auth-button')).toBeEnabled());await fireEvent.press(page.getByTestId('apple-auth-button'));await waitFor(()=>expect(calls).toBe(2));
  await act(async()=>finishA({userId:'a'}));expect(page.getByTestId('apple-auth-button')).toBeDisabled();expect(done).not.toHaveBeenCalled();
  await fireEvent.press(page.getByTestId('apple-auth-button'));expect(mockAuthenticateApple).toHaveBeenCalledTimes(2);
  await act(async()=>finishB({userId:'b'}));expect(done).toHaveBeenCalledTimes(1);
 } finally {await page.unmount();subscription.mockRestore();}
});

it('formal Apple-only login works without controlled email or diagnostics',async()=>{
 mockFormal=true;mockOpen=false;mockDiagnostics=false;mockAppleAvailable.mockResolvedValue(true);mockAppleToken.mockResolvedValue('fresh');
 mockHealth.mockResolvedValue({controlledEmailAccounts:false,appleLogin:true,accountDeletion:true});
 mockAuthenticateApple.mockImplementation(async(_intent,authorize)=>authorize('nonce'));
 const done=jest.fn();const page=await render(<FamilyEmailAccountScreen onAuthenticated={done}/>);
 await waitFor(()=>expect(page.getByTestId('apple-auth-button')).toBeTruthy());
 expect(page.queryByTestId('email-account-email')).toBeNull();expect(page.queryByTestId('email-account-password')).toBeNull();expect(page.queryByTestId('email-account-submit')).toBeNull();
 expect(page.queryByText('其他登录方式')).toBeNull();
 await fireEvent.press(page.getByTestId('apple-auth-button'));expect(done).toHaveBeenCalledTimes(1);
 expect(mockLogin).not.toHaveBeenCalled();expect(mockRegister).not.toHaveBeenCalled();
});
it('formal deletion is explicitly confirmed and requests fresh native Apple authorization',async()=>{
 mockFormal=true;mockOpen=false;mockDiagnostics=false;mockAppleAvailable.mockResolvedValue(true);
 mockHealth.mockResolvedValue({controlledEmailAccounts:false,appleLogin:true,accountDeletion:true});
 mockAuthorization.mockResolvedValue({identityToken:'fresh',authorizationCode:'code'});
 mockDelete.mockImplementation(async authorize=>{await authorize('delete-nonce');return {deleted:true,appleRevocation:'revoked',mediaCleanup:'completed'};});
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 try {
 const page=await render(<FamilyEmailAccountScreen profileMode embedded/>);await waitFor(()=>expect(page.getByTestId('account-delete')).toBeTruthy());
 await fireEvent.press(page.getByTestId('account-delete'));expect(mockDelete).not.toHaveBeenCalled();expect(alert.mock.calls[0][2]![0].style).toBe('cancel');
 await act(async()=>alert.mock.calls[0][2]![1].onPress!());expect(mockAuthorization).toHaveBeenCalledWith('delete-nonce');
 expect(page.getByText('账号已删除。本机私人记录保留。')).toBeTruthy();expect(page.queryByTestId('account-delete')).toBeNull();
 }finally{alert.mockRestore();}
});
it('formal deletion failure keeps profile for retry and shows creator resolution',async()=>{
 mockFormal=true;mockOpen=false;mockDiagnostics=false;mockAppleAvailable.mockResolvedValue(true);
 mockHealth.mockResolvedValue({appleLogin:true,accountDeletion:true});mockDelete.mockRejectedValue(new ApplicationError('ACCOUNT_HAS_MANAGED_FAMILY','Transfer first'));
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 try {
 const page=await render(<FamilyEmailAccountScreen profileMode/>);await waitFor(()=>expect(page.getByTestId('account-delete')).toBeTruthy());
 await fireEvent.press(page.getByTestId('account-delete'));await act(async()=>alert.mock.calls[0][2]![1].onPress!());
 expect(page.getByText('请先转交或解散仍有其他成员的家庭，再删除账号。')).toBeTruthy();expect(page.getByTestId('account-delete')).toBeTruthy();
 }finally{alert.mockRestore();}
});
