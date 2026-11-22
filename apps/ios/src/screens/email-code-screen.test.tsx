import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
import {Alert,AppState,type AppStateStatus} from 'react-native';
import EmailCodeScreen from './email-code-screen';
import {ApplicationError} from '../application/errors';

let mockOpen=true;const mockLock={snapshot:{locked:false}};
const mockService={getEmailCodeAvailability:jest.fn(),getEmailCodeAccount:jest.fn(),requestEmailCode:jest.fn(),verifyEmailCode:jest.fn(),finishEmailProfile:jest.fn(),signOutEmailAccount:jest.fn()};
jest.mock('../application/container',()=>({getAccountUseCases:async()=>mockService}));
jest.mock('../infrastructure/account-config',()=>({emailCodeEntryOpen:()=>mockOpen}));
jest.mock('./device-lock-context',()=>({useDeviceLock:()=>mockLock}));
jest.mock('expo-router',()=>({useFocusEffect:(callback:()=>unknown)=>{const React=jest.requireActual('react');React.useEffect(callback,[callback]);}}));
jest.mock('./settings-chrome',()=>{const {View}=jest.requireActual('react-native');return {SettingsPage:({children}:any)=><View>{children}</View>};});
let changed:(state:AppStateStatus)=>void;
beforeEach(()=>{
  jest.clearAllMocks();mockOpen=true;mockLock.snapshot.locked=false;
  Object.defineProperty(AppState,'currentState',{configurable:true,value:'active'});
  jest.spyOn(AppState,'addEventListener').mockImplementation((event,listener)=>{if(event==='change')changed=listener;return {remove:jest.fn()};});
  mockService.getEmailCodeAvailability.mockResolvedValue(true);mockService.getEmailCodeAccount.mockResolvedValue({signedIn:false,linked:false});
  mockService.requestEmailCode.mockResolvedValue({challengeId:'challenge',expiresAt:'later',resendAfterSeconds:60});
  mockService.verifyEmailCode.mockResolvedValue({signedIn:true,userId:'a',needsProfile:false});
  mockService.finishEmailProfile.mockResolvedValue({userId:'a',nickname:'小禾'});
});
async function form(){const page=await render(<EmailCodeScreen onCancel={jest.fn()} onAuthenticated={jest.fn()}/>);await waitFor(()=>expect(page.getByTestId('email-code-address')).toBeTruthy());return page;}
async function send(page:Awaited<ReturnType<typeof form>>){await fireEvent.changeText(page.getByTestId('email-code-address'),' Person@Example.com ');await fireEvent.press(page.getByTestId('email-code-send'));}

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
 mockService.getEmailCodeAccount.mockResolvedValue({signedIn:true,linked:true,userId:'a',maskedEmail:'p***@example.com'});
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
