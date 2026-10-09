import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import FamilyInviteScreen, { FamilyInvitePanel } from './family-invite-screen';
import { forgetFamilyInvite, rememberFamilyInvite } from '../infrastructure/family-invite-link';
const mockPreview=jest.fn(),mockAccount=jest.fn(),mockAccept=jest.fn(),mockPush=jest.fn();
const mockOpen=jest.fn(()=>true);const mockLock={snapshot:{locked:false}};
let mockStateListener: ((state:string)=>void) | null=null;
jest.mock('../application/container',()=>({getFamilyUseCases:async()=>({previewInviteLink:mockPreview,inviteLinkAccount:mockAccount,acceptInviteLink:mockAccept})}));
jest.mock('../infrastructure/family-config',()=>({isFamilyProductEntryOpen:()=>mockOpen(),isSafeFamilyApiBaseUrl:()=>true}));
jest.mock('./device-lock-context',()=>({useDeviceLock:()=>mockLock}));
jest.mock('./settings-chrome',()=>{const {Text,View}=jest.requireActual('react-native');return {SettingsPage:({children,title,onBack}:any)=><View><Text>{title}</Text><Text onPress={onBack}>Back</Text>{children}</View>};});
jest.mock('expo-router',()=>{const {useEffect}=jest.requireActual('react');return {useRouter:()=>({push:mockPush,dismissTo:jest.fn()}),useFocusEffect:(fn:()=>void)=>useEffect(fn,[fn])};});
beforeEach(()=>{
  jest.clearAllMocks();forgetFamilyInvite();mockOpen.mockReturnValue(true);mockLock.snapshot.locked=false;
  Object.defineProperty(AppState,'currentState',{configurable:true,value:'active',writable:true});
  jest.spyOn(AppState,'addEventListener').mockImplementation((_event,listener)=>{mockStateListener=listener as any;return {remove:jest.fn()};});
  mockPreview.mockResolvedValue({name:'Home',expiresAt:'2026-10-15T00:00:00Z',status:'pending'});mockAccount.mockResolvedValue('a');mockAccept.mockResolvedValue({familyId:'f'});
});
afterEach(()=>{jest.restoreAllMocks();forgetFamilyInvite();});
it('closed/locked screens never preview or join; opening a link only previews',async()=>{
  rememberFamilyInvite('a'.repeat(64));mockOpen.mockReturnValue(false);const closed=await render(<FamilyInviteScreen/>);expect(mockPreview).not.toHaveBeenCalled();await closed.unmount();
  mockOpen.mockReturnValue(true);mockLock.snapshot.locked=true;const locked=await render(<FamilyInviteScreen/>);expect(mockPreview).not.toHaveBeenCalled();await locked.unmount();
  mockLock.snapshot.locked=false;const page=await render(<FamilyInviteScreen/>);await waitFor(()=>expect(page.getByTestId('invite-confirm')).toBeTruthy());expect(mockAccept).not.toHaveBeenCalled();
  await fireEvent.press(page.getByTestId('invite-confirm'));await waitFor(()=>expect(page.getByText('已加入这个家。')).toBeTruthy());expect(mockAccept).toHaveBeenCalledTimes(1);
});
it('late account/preview after background cannot reveal a confirm button or join',async()=>{
  rememberFamilyInvite('a'.repeat(64));let done!: (v:unknown)=>void;mockPreview.mockImplementation(()=>new Promise(r=>{done=r;}));
  const page=await render(<FamilyInviteScreen/>);await waitFor(()=>expect(mockPreview).toHaveBeenCalledTimes(1));
  await act(async()=>{(AppState as any).currentState='background';mockStateListener?.('background');done({name:'Home',status:'pending',expiresAt:'2026-10-15T00:00:00Z'});});
  expect(page.queryByTestId('invite-confirm')).toBeNull();expect(mockAccept).not.toHaveBeenCalled();
});
it('signed-out invitation offers login, not an automatic acceptance',async()=>{
  rememberFamilyInvite('a'.repeat(64));mockAccount.mockRejectedValue({code:'UNAUTHENTICATED'});const page=await render(<FamilyInviteScreen/>);
  await waitFor(()=>expect(page.getByText('先登录家庭')).toBeTruthy());await fireEvent.press(page.getByText('先登录家庭'));expect(mockPush).toHaveBeenCalledWith('/account-diagnostics');expect(mockAccept).not.toHaveBeenCalled();
});

it('previews inline, joins only on confirmation, and reports completion without navigation',async()=>{
 const joined=jest.fn();
 const page=await render(<FamilyInvitePanel onJoined={joined}/>);
 await fireEvent.changeText(page.getByLabelText('邀请链接'),'lampy:///family-invite#'+'a'.repeat(64));
 await fireEvent.press(page.getByText('查看邀请'));
 await waitFor(()=>expect(page.getByText('Home')).toBeTruthy());
 expect(mockAccept).not.toHaveBeenCalled();
 await fireEvent.press(page.getByTestId('invite-confirm'));
 await waitFor(()=>expect(joined).toHaveBeenCalledTimes(1));
 expect(page.getByText('已加入这个家。')).toBeTruthy();
 expect(mockPush).not.toHaveBeenCalled();
});
it('clearing input invalidates a late preview and permits a fresh link',async()=>{
 let done!:(value:unknown)=>void;
 mockPreview.mockImplementationOnce(()=>new Promise(r=>{done=r;}));
 const page=await render(<FamilyInvitePanel/>);
 await fireEvent.changeText(page.getByLabelText('邀请链接'),'lampy:///family-invite#'+'a'.repeat(64));
 await fireEvent.press(page.getByText('查看邀请'));
 await waitFor(()=>expect(mockPreview).toHaveBeenCalledTimes(1));
 await fireEvent.press(page.getByText('清除输入'));
 await act(async()=>{done({name:'Old home',status:'pending',expiresAt:'2026-10-15T00:00:00Z'});});
 expect(page.queryByText('Old home')).toBeNull();
 expect(page.getByLabelText('邀请链接').props.value).toBe('');
 await fireEvent.changeText(page.getByLabelText('邀请链接'),'lampy:///family-invite#'+'b'.repeat(64));
 await fireEvent.press(page.getByText('查看邀请'));
 await waitFor(()=>expect(page.getByTestId('invite-confirm')).toBeTruthy());
});
