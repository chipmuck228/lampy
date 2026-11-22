import {render,waitFor,fireEvent,act} from '@testing-library/react-native';
import EmailAccountSettings from './email-account-settings';
let mockLocked=false;
const mockRead=jest.fn();
jest.mock('../application/container',()=>({getAccountUseCases:async()=>({getEmailCodeAccount:mockRead})}));
jest.mock('expo-router',()=>({useFocusEffect:(callback:()=>unknown)=>{const React=jest.requireActual('react');React.useEffect(callback,[callback]);}}));
jest.mock('./device-lock-context',()=>({useDeviceLock:()=>({snapshot:{locked:mockLocked}})}));
jest.mock('./life-icons',()=>({LifeIcon:()=>null}));
beforeEach(()=>{jest.clearAllMocks();mockLocked=false;});
it('displays the saved nickname in settings and keeps account management accessible',async()=>{
 mockRead.mockResolvedValue({signedIn:true,nickname:'窗边'});const go=jest.fn();const page=await render(<EmailAccountSettings onPress={go}/>);
 await waitFor(()=>expect(page.getByText('窗边')).toBeTruthy());await fireEvent.press(page.getByTestId('account-open-email-code'));expect(go).toHaveBeenCalledTimes(1);
});
it('shows the login entry when signed out and conceals names while locked',async()=>{
 mockRead.mockResolvedValue({signedIn:false});const page=await render(<EmailAccountSettings onPress={jest.fn()}/>);await waitFor(()=>expect(mockRead).toHaveBeenCalled());expect(page.getByText('登录与找回')).toBeTruthy();
 mockLocked=true;await page.rerender(<EmailAccountSettings onPress={jest.fn()}/>);expect(page.queryByText('窗边')).toBeNull();
});
it('does not submit a late nickname after leaving settings',async()=>{
 let finish!:(value:unknown)=>void;mockRead.mockImplementation(()=>new Promise(r=>{finish=r;}));const page=await render(<EmailAccountSettings onPress={jest.fn()}/>);
 await waitFor(()=>expect(mockRead).toHaveBeenCalled());await page.unmount();await act(async()=>finish({signedIn:true,nickname:'旧账号'}));
});
