import { act, render } from '@testing-library/react-native';
import FamilyInviteLoginScreen from './family-invite-login-screen';
import { currentFamilyInvite, forgetFamilyInvite, rememberFamilyInvite } from '../infrastructure/family-invite-link';
const mockBack=jest.fn(),mockDismiss=jest.fn();
let mockParams:{returnTo:string;generation:string};
let mockProps:any;
const mockLock={snapshot:{locked:false}};
jest.mock('expo-router',()=>({useRouter:()=>({canGoBack:()=>true,back:mockBack,dismissTo:mockDismiss}),useLocalSearchParams:()=>mockParams}));
jest.mock('./device-lock-context',()=>({useDeviceLock:()=>mockLock}));
jest.mock('../infrastructure/family-config',()=>({isFamilyProductEntryOpen:()=>true}));
jest.mock('../application/personal-settings-visibility',()=>({isPersonalSettingsDiagnosticsOpen:()=>true}));
jest.mock('./account-screen',()=>({__esModule:true,default:(props:any)=>{mockProps=props;return null;}}));
jest.mock('./settings-chrome',()=>{const {View}=jest.requireActual('react-native');return {SettingsPage:({children}:any)=><View>{children}</View>};});
beforeEach(()=>{jest.clearAllMocks();mockProps=null;mockLock.snapshot.locked=false;const i=rememberFamilyInvite('a'.repeat(64));mockParams={returnTo:'/family',generation:String(i.generation)};});
afterEach(()=>forgetFamilyInvite());
it('returns on success without consuming the invite and cancel also preserves it',async()=>{
 const page=await render(<FamilyInviteLoginScreen/>);
 await act(async()=>mockProps.onAuthenticated());
 expect(mockBack).toHaveBeenCalledTimes(1);
 expect(currentFamilyInvite()).not.toBeNull();
 await act(async()=>mockProps.onCancel());
 expect(mockBack).toHaveBeenCalledTimes(2);
 await page.unmount();
});
it('a replaced invite invalidates the old authentication return',async()=>{
 await render(<FamilyInviteLoginScreen/>);
 const done=mockProps.onAuthenticated;
 rememberFamilyInvite('b'.repeat(64));
 await act(async()=>done());
 expect(mockBack).not.toHaveBeenCalled();
});
it('locked routes never render identity controls',async()=>{
 mockLock.snapshot.locked=true;
 await render(<FamilyInviteLoginScreen/>);
 expect(mockProps).toBeNull();
});
