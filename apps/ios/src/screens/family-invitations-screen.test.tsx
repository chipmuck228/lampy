import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState, Share } from 'react-native';
import FamilyInvitationsScreen from './family-invitations-screen';
const mockCreate=jest.fn();
jest.mock('../application/container',()=>({getFamilyUseCases:async()=>({listInviteLinks:async()=>[],createInviteLink:mockCreate})}));
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
