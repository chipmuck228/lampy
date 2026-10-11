import { AppState } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import FamilyEmailAccountScreen from './family-email-account-screen';
const mockPush=jest.fn(),mockDismiss=jest.fn(),mockBack=jest.fn();
const mockHealth=jest.fn(),mockRegister=jest.fn(),mockLogin=jest.fn(),mockRead=jest.fn(),mockUpdate=jest.fn();
let mockOpen=true;const mockLock={snapshot:{locked:false}};
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush,dismissTo:mockDismiss,back:mockBack,canGoBack:()=>true}),useFocusEffect:(callback:()=>unknown)=>{const React=jest.requireActual('react');React.useEffect(callback,[callback]);}}));
jest.mock('../application/container',()=>({getFamilyUseCases:async()=>({getControlledEmailAvailability:mockHealth,registerControlledEmail:mockRegister,signInWithControlledEmail:mockLogin,getMyProfile:mockRead,updateMyProfile:mockUpdate})}));
jest.mock('../infrastructure/family-config',()=>({isControlledEmailAccountsOpen:()=>mockOpen,isFamilyProductEntryOpen:()=>true}));
jest.mock('../application/personal-settings-visibility',()=>({isPersonalSettingsDiagnosticsOpen:()=>true}));
jest.mock('./device-lock-context',()=>({useDeviceLock:()=>mockLock}));
jest.mock('./settings-chrome',()=>{const {View}=jest.requireActual('react-native');return {SettingsPage:({children}:any)=><View>{children}</View>};});
jest.mock('./life-icons',()=>({LifeIcon:()=>null}));
beforeEach(()=>{jest.clearAllMocks();mockOpen=true;mockLock.snapshot.locked=false;Object.defineProperty(AppState,'currentState',{configurable:true,value:'active'});mockHealth.mockResolvedValue({controlledEmailAccounts:true});mockRegister.mockResolvedValue({userId:'a'});mockLogin.mockResolvedValue({userId:'a'});mockRead.mockResolvedValue({userId:'a',nickname:'原昵称',avatar:'system',updatedAt:'now'});mockUpdate.mockImplementation(async(nickname:string)=>({userId:'a',nickname,avatar:'system',updatedAt:'now'}));});
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
