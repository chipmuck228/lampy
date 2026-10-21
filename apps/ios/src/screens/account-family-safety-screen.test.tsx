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
 const page=await render(<AccountFamilySafetyScreen/>);await waitFor(()=>expect(page.getByText('Family B')).toBeTruthy());expect(page.queryByText('receipt')).toBeNull();expect(page.getByText('家庭记录（目前不可用）')).toBeTruthy();
 await fireEvent.press(page.getByText('Family B'));await fireEvent.press(page.getByText('解除所选家人的屏蔽'));expect(mockUnblock).not.toHaveBeenCalled();
 mockBlocks.mockResolvedValue({blocks:[]});const buttons=(Alert.alert as jest.Mock).mock.calls[0][2];await act(async()=>buttons[1].onPress());
 await waitFor(()=>expect(page.getByText('没有屏蔽任何家人。')).toBeTruthy());expect(mockUnblock).toHaveBeenCalledWith('b',expect.any(Function));
});
it('does not load or reveal safety metadata while locked',async()=>{
 mockLock.snapshot.locked=true;const page=await render(<AccountFamilySafetyScreen/>);expect(mockBlocks).not.toHaveBeenCalled();expect(page.queryByText('Family B')).toBeNull();
});

it('shows author notices and the confirmed support address without reporter details',async()=>{
 mockReports.mockResolvedValue({reports:[],sharingRestricted:true,restrictedShares:['share_hidden']});
 const page=await render(<AccountFamilySafetyScreen/>);
 await waitFor(()=>expect(page.getByText(/有1条家庭分享因内容规则被限制/)).toBeTruthy());expect(page.queryByText('share_hidden')).toBeNull();
 expect(page.getByText('dev@yunpura.com')).toBeTruthy();
 expect(page.getByText(/此账号暂时不能新增家庭分享/)).toBeTruthy();
});

it('unblocks only the selected chip and keeps the other member blocked',async()=>{
 mockBlocks.mockResolvedValue({blocks:[{userId:'a',targetUserId:'b',nickname:'Family B'},{userId:'a',targetUserId:'c',nickname:'Family C'}]});
 const page=await render(<AccountFamilySafetyScreen/>);await waitFor(()=>expect(page.getByText('Family C')).toBeTruthy());expect(page.getByTestId('blocked-family-count').props.children).toBe(2);
 expect(page.queryByText('解除所选家人的屏蔽')).toBeNull();
 await fireEvent.press(page.getByText('Family C'));await fireEvent.press(page.getByText('解除所选家人的屏蔽'));
 expect(Alert.alert).toHaveBeenCalledWith('解除对Family C的屏蔽？',expect.any(String),expect.any(Array));
 mockBlocks.mockResolvedValue({blocks:[{userId:'a',targetUserId:'b',nickname:'Family B'}]});
 await act(async()=>(Alert.alert as jest.Mock).mock.calls[0][2][1].onPress());
 expect(mockUnblock).toHaveBeenCalledTimes(1);expect(mockUnblock).toHaveBeenCalledWith('c',expect.any(Function));
 await waitFor(()=>expect(page.queryByText('Family C')).toBeNull());expect(page.getByText('Family B')).toBeTruthy();
});
it('renders coarse report metadata without ids, content, photos or playable sounds',async()=>{
 mockReports.mockResolvedValue({reports:[{reportId:'raw_report_secret',reason:'privacy',status:'pending',createdAt:'2026-10-21T04:29:21Z',summary:{familyName:'Test home',authorNickname:'B',occurredAtPrecision:'unknown',photoCount:2,soundCount:1}}]});
 const page=await render(<AccountFamilySafetyScreen/>);await waitFor(()=>expect(page.getByText('B分享的记录')).toBeTruthy());
 expect(page.getByText('照片2张 · 声音1段')).toBeTruthy();expect(page.queryByText('raw_report_secret')).toBeNull();
 expect(page.queryByRole('image')).toBeNull();expect(page.queryByText('播放')).toBeNull();
});
