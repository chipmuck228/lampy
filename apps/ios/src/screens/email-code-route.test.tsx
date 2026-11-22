import {render,fireEvent} from '@testing-library/react-native';
import Route from '../app/account/email-code';
const mockDismiss=jest.fn();
jest.mock('expo-router',()=>({useRouter:()=>({dismissTo:mockDismiss,canGoBack:()=>false}),useLocalSearchParams:()=>({returnTo:'family'})}));
jest.mock('../infrastructure/family-config',()=>({isFamilyProductEntryOpen:()=>true}));
jest.mock('./email-code-screen',()=>{
 const {Pressable,Text}=jest.requireActual('react-native');
 return {__esModule:true,default:({onDeleted,onAuthenticated}:any)=><><Pressable testID="deleted" onPress={onDeleted}><Text>Deleted</Text></Pressable><Pressable testID="authenticated" onPress={onAuthenticated}><Text>Signed in</Text></Pressable></>};
});
beforeEach(()=>jest.clearAllMocks());
it('returns deletion to settings even when authentication originally targeted family',async()=>{
 const page=await render(<Route/>);await fireEvent.press(page.getByTestId('deleted'));expect(mockDismiss).toHaveBeenCalledWith('/account');
});
it('preserves the original family destination for successful sign-in',async()=>{
 const page=await render(<Route/>);await fireEvent.press(page.getByTestId('authenticated'));expect(mockDismiss).toHaveBeenCalledWith('/family');
});
