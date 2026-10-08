import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, AppState, Share } from 'react-native';
import FamilyInvitationsScreen from './family-invitations-screen';
const mockCreate=jest.fn();
const mockList=jest.fn();
const mockRevoke=jest.fn();
beforeEach(()=>{jest.clearAllMocks();mockList.mockResolvedValue([]);mockRevoke.mockResolvedValue({});});
jest.mock('../application/container',()=>({getFamilyUseCases:async()=>({listInviteLinks:mockList,createInviteLink:mockCreate,revokeInviteLink:mockRevoke})}));
jest.mock('../infrastructure/family-config',()=>({isFamilyProductEntryOpen:()=>true}));
jest.mock('./device-lock-context',()=>({useDeviceLock:()=>({snapshot:{locked:false}})}));
jest.mock('./settings-chrome',()=>{const {View}=jest.requireActual('react-native');return {SettingsPage:({children}:any)=><View>{children}</View>};});
jest.mock('expo-router',()=>{const {useEffect}=jest.requireActual('react');return {useRouter:()=>({dismissTo:jest.fn()}),useLocalSearchParams:()=>({familyId:'f'}),useFocusEffect:(fn:()=>void)=>useEffect(fn,[fn])};});
it('shares one link item so iOS Copy cannot concatenate message and URL copies',async()=>{
  Object.defineProperty(AppState,'currentState',{configurable:true,value:'active',writable:true});
  const link=`http://127.0.0.1:8787/invite#${'a'.repeat(64)}`;
  mockCreate.mockResolvedValue({invitationId:'i',familyId:'f',status:'pending',expiresAt:'2026-10-15T00:00:00Z',token:'a'.repeat(64),link,qr:'data:image/png;base64,AA=='});
  const share=jest.spyOn(Share,'share').mockResolvedValue({action:Share.sharedAction});
  try {
    const page=await render(<FamilyInvitationsScreen/>);
    await waitFor(()=>expect(page.getByTestId('invite-create')).toBeEnabled());
    await fireEvent.press(page.getByTestId('invite-create'));
    await waitFor(()=>expect(page.getByTestId('created-invitation')).toBeTruthy());
    await fireEvent.press(page.getByText('分享邀请'));
    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({message:link});
    await page.unmount();
  } finally {share.mockRestore();}
});

it('revokes before replacement and shares only after confirmation',async()=>{
 mockList.mockResolvedValue([{invitationId:'old',familyId:'f',status:'pending',expiresAt:'2026-10-15T00:00:00Z'}]);
 const link='http://127.0.0.1:8787/invite#'+'b'.repeat(64);
 mockCreate.mockImplementation(async()=>{expect(mockRevoke).toHaveBeenCalledWith('old',expect.any(Function));return {invitationId:'new',status:'pending',expiresAt:'2026-10-15T00:00:00Z',link,qr:'data:image/png;base64,AA=='};});
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 const share=jest.spyOn(Share,'share').mockResolvedValue({action:Share.sharedAction});
 const page=await render(<FamilyInvitationsScreen/>);
 await waitFor(()=>expect(page.getByText('重新生成并分享')).toBeEnabled());
 await fireEvent.press(page.getByText('重新生成并分享'));
 expect(mockCreate).not.toHaveBeenCalled();
 await act(async()=>{alert.mock.calls[0][2]![1].onPress!();});
 await waitFor(()=>expect(share).toHaveBeenCalledWith({message:link}));
 expect(page.getByText('已撤销')).toBeTruthy();
 await page.unmount();alert.mockRestore();share.mockRestore();
});
it('shows reload only for list failure and refresh after recovery',async()=>{
 mockList.mockRejectedValueOnce(new Error('offline'));
 const page=await render(<FamilyInvitationsScreen/>);
 await waitFor(()=>expect(page.getByText('重新加载')).toBeTruthy());
 expect(page.queryByText('再试一次')).toBeNull();
 await fireEvent.press(page.getByText('重新加载'));
 await waitFor(()=>expect(page.getByText('刷新')).toBeTruthy());
 await page.unmount();
});
it('does not create or share after failed revocation',async()=>{
 mockList.mockResolvedValue([{invitationId:'old',familyId:'f',status:'pending',expiresAt:'2026-10-15T00:00:00Z'}]);
 mockRevoke.mockRejectedValueOnce(new Error('offline'));
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 const share=jest.spyOn(Share,'share').mockResolvedValue({action:Share.sharedAction});
 const page=await render(<FamilyInvitationsScreen/>);
 await waitFor(()=>expect(page.getByText('重新生成并分享')).toBeEnabled());
 await fireEvent.press(page.getByText('重新生成并分享'));
 await act(async()=>{alert.mock.calls[0][2]![1].onPress!();});
 await waitFor(()=>expect(page.getByText('新邀请未确认生成。请刷新查看，原邀请可能已经失效。')).toBeTruthy());
 expect(mockCreate).not.toHaveBeenCalled();expect(share).not.toHaveBeenCalled();
 await page.unmount();alert.mockRestore();share.mockRestore();
});
