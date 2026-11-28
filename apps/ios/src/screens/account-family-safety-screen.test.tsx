import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, AppState } from 'react-native';
import AccountFamilySafetyScreen from './account-family-safety-screen';
const mockBlocks=jest.fn(),mockReports=jest.fn(),mockUnblock=jest.fn(),mockLock={snapshot:{locked:false}};
jest.mock('../application/container',()=>({getFamilyUseCases:async()=>({safety:{blocks:mockBlocks,reports:mockReports,unblock:mockUnblock}})}));
jest.mock('../infrastructure/family-config',()=>({isFamilyProductEntryOpen:()=>true}));
jest.mock('./device-lock-context',()=>({useDeviceLock:()=>mockLock}));
jest.mock('expo-router',()=>{const {useEffect}=jest.requireActual('react');return {useRouter:()=>({dismissTo:jest.fn()}),useFocusEffect:(fn:()=>void|(()=>void))=>useEffect(fn,[fn])};});
jest.mock('./settings-chrome',()=>{const {View,Text}=jest.requireActual('react-native');return {SettingsPage:({children,title,backLabel}:any)=><View><Text>{title}</Text><Text>{backLabel}</Text>{children}</View>};});
beforeEach(()=>{jest.clearAllMocks();mockLock.snapshot.locked=false;Object.defineProperty(AppState,'currentState',{configurable:true,value:'active'});mockBlocks.mockResolvedValue({blocks:[{userId:'a',targetUserId:'b',nickname:'Family B',createdAt:'2026-10-18'}]});mockReports.mockResolvedValue({reports:[{reportId:'receipt',reason:'privacy',status:'pending',createdAt:'2026-10-18'}]});mockUnblock.mockResolvedValue(undefined);jest.spyOn(Alert,'alert').mockImplementation(()=>{});});
afterEach(()=>jest.restoreAllMocks());
it('shows own receipts without private content and confirms before unblocking',async()=>{
 const page=await render(<AccountFamilySafetyScreen/>);await waitFor(()=>expect(page.getByText('Family B')).toBeTruthy());expect(page.queryByText('receipt')).toBeNull();expect(page.getByText('家庭记录（目前不可用）')).toBeTruthy();
 await fireEvent.press(page.getByTestId('blocked-family-b'));expect(mockUnblock).not.toHaveBeenCalled();
 mockBlocks.mockResolvedValue({blocks:[]});const buttons=(Alert.alert as jest.Mock).mock.calls[0][2];await act(async()=>buttons[1].onPress());
 await waitFor(()=>expect(page.getByText('没有屏蔽任何家人。')).toBeTruthy());expect(mockUnblock).toHaveBeenCalledWith('b',expect.any(Function));
});
it('does not load or reveal safety metadata while locked',async()=>{
 mockLock.snapshot.locked=true;const page=await render(<AccountFamilySafetyScreen/>);expect(mockBlocks).not.toHaveBeenCalled();expect(page.queryByText('Family B')).toBeNull();
});

it('shows author notices and the confirmed support address without reporter details',async()=>{
 mockReports.mockResolvedValue({reports:[],sharingRestricted:true,restrictedShares:['share_hidden']});
 const page=await render(<AccountFamilySafetyScreen/>);
 await waitFor(()=>expect(page.getByText(/有1条分享暂不可见/)).toBeTruthy());expect(page.queryByText('share_hidden')).toBeNull();
 expect(page.getByText('support@5sparks.ai')).toBeTruthy();
 expect(page.getByText(/家庭分享暂不可用/)).toBeTruthy();
});

it('unblocks only the chosen member and keeps the other member blocked',async()=>{
 mockBlocks.mockResolvedValue({blocks:[{userId:'a',targetUserId:'b',nickname:'Family B'},{userId:'a',targetUserId:'c',nickname:'Family C'}]});
 const page=await render(<AccountFamilySafetyScreen/>);await waitFor(()=>expect(page.getByText('Family C')).toBeTruthy());expect(page.getByTestId('blocked-family-count').props.children).toBe(2);
 expect(page.getAllByText('解除屏蔽')).toHaveLength(2);
 await fireEvent.press(page.getByTestId('blocked-family-c'));
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

it('shows a quiet empty state with an actionable support link',async()=>{
 mockBlocks.mockResolvedValue({blocks:[]});mockReports.mockResolvedValue({reports:[]});
 const page=await render(<AccountFamilySafetyScreen/>);
 await waitFor(()=>expect(page.getByText('没有屏蔽任何家人。')).toBeTruthy());
 expect(page.getByText('屏蔽与举报')).toBeTruthy();expect(page.getByText('本机设置')).toBeTruthy();
 expect(page.getByText('没有提交过举报。')).toBeTruthy();expect(page.getByText('联系 Lampy')).toBeTruthy();
 expect(page.queryByText(/开发者每天/)).toBeNull();
});
