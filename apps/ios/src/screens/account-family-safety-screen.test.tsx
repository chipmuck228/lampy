import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, AppState } from 'react-native';
import AccountFamilySafetyScreen from './account-family-safety-screen';
const mockBlocks=jest.fn(),mockReports=jest.fn(),mockUnblock=jest.fn(),mockLock={snapshot:{locked:false}};
jest.mock('../application/container',()=>({getFamilyUseCases:async()=>({safety:{blocks:mockBlocks,reports:mockReports,unblock:mockUnblock}})}));
jest.mock('../infrastructure/family-config',()=>({isFamilyProductEntryOpen:()=>true}));
jest.mock('./device-lock-context',()=>({useDeviceLock:()=>mockLock}));
jest.mock('expo-router',()=>{const {useEffect}=jest.requireActual('react');return {useRouter:()=>({dismissTo:jest.fn()}),useFocusEffect:(fn:()=>void|(()=>void))=>useEffect(fn,[fn])};});
jest.mock('./settings-chrome',()=>{const {View}=jest.requireActual('react-native');return {SettingsPage:({children}:{children:React.ReactNode})=><View>{children}</View>};});
beforeEach(()=>{jest.clearAllMocks();mockLock.snapshot.locked=false;Object.defineProperty(AppState,'currentState',{configurable:true,value:'active'});mockBlocks.mockResolvedValue({blocks:[{userId:'a',targetUserId:'b',nickname:'Family B',createdAt:'2026-10-18'}]});mockReports.mockResolvedValue({reports:[{reportId:'receipt',reason:'privacy',status:'pending',createdAt:'2026-10-18'}]});mockUnblock.mockResolvedValue(undefined);jest.spyOn(Alert,'alert').mockImplementation(()=>{});});
afterEach(()=>jest.restoreAllMocks());
it('shows own receipts without private content and confirms before unblocking',async()=>{
 const page=await render(<AccountFamilySafetyScreen/>);await waitFor(()=>expect(page.getByText('Family B')).toBeTruthy());expect(page.getByText('receipt')).toBeTruthy();
 await fireEvent.press(page.getByText('解除屏蔽'));expect(mockUnblock).not.toHaveBeenCalled();
 mockBlocks.mockResolvedValue({blocks:[]});const buttons=(Alert.alert as jest.Mock).mock.calls[0][2];await act(async()=>buttons[1].onPress());
 await waitFor(()=>expect(page.getByText('没有屏蔽任何家人。')).toBeTruthy());expect(mockUnblock).toHaveBeenCalledWith('b',expect.any(Function));
});
it('does not load or reveal safety metadata while locked',async()=>{
 mockLock.snapshot.locked=true;const page=await render(<AccountFamilySafetyScreen/>);expect(mockBlocks).not.toHaveBeenCalled();expect(page.queryByText('Family B')).toBeNull();
});
