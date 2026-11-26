import {render,fireEvent} from '@testing-library/react-native';
import Route from '../app/account/email-code';
const mockDismiss=jest.fn();let mockReturnTo='family';
jest.mock('expo-router',()=>({useRouter:()=>({dismissTo:mockDismiss,canGoBack:()=>false}),useLocalSearchParams:()=>({returnTo:mockReturnTo})}));
jest.mock('../infrastructure/family-config',()=>({isFamilyProductEntryOpen:()=>true}));
jest.mock('./email-code-screen',()=>{
 const {Pressable,Text}=jest.requireActual('react-native');
 return {__esModule:true,default:({onDeleted,onAuthenticated,backLabel,onManageFamily}:any)=><><Text>{backLabel}</Text><Pressable testID="manage-family" onPress={onManageFamily}><Text>Family</Text></Pressable><Pressable testID="deleted" onPress={onDeleted}><Text>Deleted</Text></Pressable><Pressable testID="authenticated" onPress={onAuthenticated}><Text>Signed in</Text></Pressable></>};
});
beforeEach(()=>{jest.clearAllMocks();mockReturnTo='family';});
it('returns deletion to settings even when authentication originally targeted family',async()=>{
 const page=await render(<Route/>);await fireEvent.press(page.getByTestId('deleted'));expect(mockDismiss).toHaveBeenCalledWith('/account');
});
it('preserves the original family destination for successful sign-in',async()=>{
 const page=await render(<Route/>);await fireEvent.press(page.getByTestId('authenticated'));expect(mockDismiss).toHaveBeenCalledWith('/family');
});

it('names settings as the return destination only when opened from settings',async()=>{
 mockReturnTo='settings';const settings=await render(<Route/>);expect(settings.getByText('本机设置')).toBeTruthy();await settings.unmount();
 mockReturnTo='family';const family=await render(<Route/>);expect(family.getByText('返回')).toBeTruthy();expect(family.queryByText('本机设置')).toBeNull();
});

it('offers family management without deleting or signing out through that navigation',async()=>{
 const page=await render(<Route/>);await fireEvent.press(page.getByTestId('manage-family'));expect(mockDismiss).toHaveBeenCalledWith('/family');
});
