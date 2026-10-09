import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import FamilyDirectoryScreen from './family-directory-screen';
const mockPush = jest.fn();
const mockFamilies = jest.fn();
const mockCreate = jest.fn();
const mockPreview = jest.fn();
const mockAccept = jest.fn();
const mockOpen = jest.fn(() => false);
const mockLock = { snapshot: { locked: false } };
jest.mock('../application/container', () => ({ getFamilyUseCases: async () => ({ history:{getPolicy:async()=>({policy:'family-history-v2',family:{role:'creator'}})},getFamilies: mockFamilies,createNamedFamily:mockCreate,previewInviteLink:mockPreview,inviteLinkAccount:async()=>'a',acceptInviteLink:mockAccept }) }));
jest.mock('../infrastructure/family-config', () => ({isFamilyProductEntryOpen: () => mockOpen()}));
jest.mock('./device-lock-context', () => ({ useDeviceLock: () => mockLock }));
jest.mock('./settings-chrome', () => { const { Text, View } = jest.requireActual('react-native'); return { SettingsPage: ({children,title}: {children: React.ReactNode;title:string}) => <View><Text>{title}</Text>{children}</View> }; });
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return { useRouter: () => ({ dismissTo: jest.fn(),push:mockPush }),useFocusEffect: (fn: () => void | (() => void)) => useEffect(fn,[fn]) };
});
beforeEach(() => { Object.defineProperty(AppState,'currentState',{configurable:true,value:'active',writable:true}); jest.clearAllMocks();mockOpen.mockReturnValue(false);mockLock.snapshot.locked=false;mockFamilies.mockResolvedValue({userId:'a',limit:10,families:[{familyId:'home',name:'Our home',role:'creator',memberCount:1}]}); });
it('closed entry and locked page never request private families', async () => {
  const closed=await render(<FamilyDirectoryScreen/>);
  expect(closed.getByText('敬请期待。')).toBeTruthy();
  expect(mockFamilies).not.toHaveBeenCalled();await closed.unmount();
  mockOpen.mockReturnValue(true);mockLock.snapshot.locked=true;
  await render(<FamilyDirectoryScreen/>);expect(mockFamilies).not.toHaveBeenCalled();
});
it('selects only a fresh authorized family and does not display a failure as an empty list', async () => {
  mockOpen.mockReturnValue(true);
  const page=await render(<FamilyDirectoryScreen/>);
  await waitFor(() => expect(page.getByText('Our home')).toBeTruthy());
  await fireEvent.press(page.getByTestId('family-select-home'));
  expect(page.getByTestId('family-select-home').props.accessibilityState.selected).toBe(true);
  expect(page.queryByText('已选择')).toBeNull();
  expect(page.queryByTestId('family-selected')).toBeNull();
  await page.unmount();mockFamilies.mockRejectedValue(new Error('offline'));
  const failed=await render(<FamilyDirectoryScreen/>);
  await waitFor(() => expect(failed.getByText('暂时连不上，稍后再看看。')).toBeTruthy());
  expect(failed.queryByText('现在还没有家庭。')).toBeNull();
});
it('keeps an uncertain name read-only and retries the same operation once', async () => {
  mockOpen.mockReturnValue(true);mockCreate.mockRejectedValueOnce({code:'NETWORK'}).mockResolvedValueOnce({familyId:'new'});
  const page=await render(<FamilyDirectoryScreen/>);
  await waitFor(() => expect(page.getByText('Our home')).toBeTruthy());
  await fireEvent.press(page.getByTestId('family-open-create'));
  await fireEvent.changeText(page.getByLabelText('家庭名称'),'New home');
  await fireEvent.press(page.getByTestId('family-create-submit'));
  await waitFor(() => expect(page.getByText('再试创建')).toBeTruthy());
  expect(page.getByLabelText('家庭名称').props.editable).toBe(false);
  const first=mockCreate.mock.calls[0];
  await act(async () => { await fireEvent.press(page.getByText('再试创建')); });
  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(2));
  expect(mockCreate.mock.calls[1].slice(0,2)).toEqual(first.slice(0,2));
});

it('shows capacity before creation and explains the full limit without a request', async () => {
  mockOpen.mockReturnValue(true);
  mockFamilies.mockResolvedValue({userId:'a',limit:10,families:Array.from({length:10},(_,i)=>({familyId:`h${i}`,name:`Home ${i}`,role:'creator',memberCount:1}))});
  const page=await render(<FamilyDirectoryScreen/>);
  await waitFor(() => expect(page.getByText('10 / 10')).toBeTruthy());
  expect(page.getByTestId('family-limit-hint')).toBeTruthy();
  expect(page.getByTestId('family-open-create').props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(page.getByTestId('family-open-create'));
  expect(page.queryByTestId('family-create-form')).toBeNull();
  expect(mockCreate).not.toHaveBeenCalled();
  expect(page.getByTestId('family-cover-wall')).toBeTruthy();
});
it('opens and cancels the name form without creating a family', async () => {
  mockOpen.mockReturnValue(true);
  const page=await render(<FamilyDirectoryScreen/>);
  await waitFor(() => expect(page.getByText('1 / 10')).toBeTruthy());
  expect(page.queryByLabelText('家庭名称')).toBeNull();
  await fireEvent.press(page.getByTestId('family-open-create'));
  expect(page.getByLabelText('家庭名称')).toBeTruthy();
  await fireEvent.press(page.getByText('取消'));
  expect(page.queryByTestId('family-create-form')).toBeNull();
  expect(mockCreate).not.toHaveBeenCalled();
});

it('welcomes signed-out users without presenting a connection error or private tiles', async () => {
  mockOpen.mockReturnValue(true);mockFamilies.mockRejectedValue({code:'UNAUTHENTICATED'});
  const page=await render(<FamilyDirectoryScreen/>);
  await waitFor(() => expect(page.getByTestId('family-signed-out')).toBeTruthy());
  expect(page.queryByTestId('family-connection-failed')).toBeNull();
  expect(page.queryByTestId('family-cover-wall')).toBeNull();
  expect(page.queryByText('再试一次')).toBeNull();
  await fireEvent.press(page.getByTestId('family-sign-in'));
  expect(mockPush).toHaveBeenCalledWith('/account-diagnostics');
});

it('places invite actions only in creator tiles and opens joining inline',async()=>{
 mockOpen.mockReturnValue(true);
 mockFamilies.mockResolvedValue({userId:'a',limit:10,families:[{familyId:'owned',name:'Owned',role:'creator',memberCount:1},{familyId:'joined',name:'Joined',role:'member',memberCount:2}]});
 const page=await render(<FamilyDirectoryScreen/>);
 await waitFor(()=>expect(page.getByTestId('family-select-owned')).toBeTruthy());
 await fireEvent.press(page.getByTestId('family-select-owned'));
 expect(page.queryByTestId('family-invite-joined')).toBeNull();
 await fireEvent.press(page.getByTestId('family-invite-owned'));
 expect(mockPush).toHaveBeenCalledWith({pathname:'/family-invitations',params:{familyId:'owned'}});
 mockPush.mockClear();
 await fireEvent.press(page.getByTestId('family-open-invite'));
 expect(page.getByLabelText('邀请链接')).toBeTruthy();
 expect(mockPush).not.toHaveBeenCalled();
 await fireEvent.changeText(page.getByLabelText('邀请链接'),'bad link');
 await fireEvent.press(page.getByText('查看邀请'));
 expect(page.getByText('请粘贴一份完整的家庭邀请链接。')).toBeTruthy();
 await fireEvent.press(page.getByLabelText('清除输入'));
 expect(page.getByLabelText('邀请链接').props.value).toBe('');
});

it('refreshes families after inline confirmation without pushing a join route',async()=>{
 mockOpen.mockReturnValue(true);
 mockPreview.mockResolvedValue({name:'New family',status:'pending',expiresAt:'2026-10-15T00:00:00Z'});
 mockAccept.mockImplementation(async()=>{mockFamilies.mockResolvedValue({userId:'a',limit:10,families:[{familyId:'new',name:'New family',role:'member',memberCount:2}]});return {familyId:'new'};});
 const page=await render(<FamilyDirectoryScreen/>);
 await waitFor(()=>expect(page.getByText('Our home')).toBeTruthy());
 await fireEvent.press(page.getByTestId('family-open-invite'));
 await fireEvent.changeText(page.getByLabelText('邀请链接'),'lampy:///family-invite#'+'a'.repeat(64));
 await fireEvent.press(page.getByText('查看邀请'));
 await waitFor(()=>expect(page.getByTestId('invite-confirm')).toBeTruthy());
 expect(mockAccept).not.toHaveBeenCalled();
 await fireEvent.press(page.getByTestId('invite-confirm'));
 await waitFor(()=>expect(page.getByTestId('family-select-new')).toBeTruthy());
 expect(page.getByText('已加入这个家。')).toBeTruthy();
 expect(mockPush).not.toHaveBeenCalled();
});

it('shows invite only on the selected creator family and never on a selected member',async()=>{
 mockOpen.mockReturnValue(true);
 mockFamilies.mockResolvedValue({userId:'a',limit:10,families:[{familyId:'one',name:'One',role:'creator',memberCount:1},{familyId:'two',name:'Two',role:'creator',memberCount:1},{familyId:'member',name:'Member',role:'member',memberCount:2}]});
 const page=await render(<FamilyDirectoryScreen/>);
 await waitFor(()=>expect(page.getByTestId('family-select-one')).toBeTruthy());
 await fireEvent.press(page.getByTestId('family-select-one'));
 expect(page.getByTestId('family-invite-one')).toBeTruthy();
 expect(page.queryByTestId('family-invite-two')).toBeNull();
 await fireEvent.press(page.getByTestId('family-select-two'));
 expect(page.queryByTestId('family-invite-one')).toBeNull();
 expect(page.getByTestId('family-invite-two')).toBeTruthy();
 await fireEvent.press(page.getByTestId('family-select-member'));
 expect(page.queryByTestId('family-invite-member')).toBeNull();
 expect(page.queryByTestId('family-invite-two')).toBeNull();
 expect(page.getByTestId('family-open-invite')).toBeTruthy();
});

it('cannot collapse the inline panel during acceptance and refreshes families when it succeeds',async()=>{
 mockOpen.mockReturnValue(true);
 mockPreview.mockResolvedValue({name:'Invited',status:'pending',expiresAt:'2026-10-15T00:00:00Z'});
 let done!:(v:unknown)=>void;
 mockAccept.mockImplementationOnce(()=>new Promise(r=>{done=r;}));
 const page=await render(<FamilyDirectoryScreen/>);
 await waitFor(()=>expect(page.getByText('Our home')).toBeTruthy());
 await fireEvent.press(page.getByTestId('family-open-invite'));
 await fireEvent.changeText(page.getByLabelText('邀请链接'),'lampy:///family-invite#'+'a'.repeat(64));
 await fireEvent.press(page.getByText('查看邀请'));
 await waitFor(()=>expect(page.getByTestId('invite-confirm')).toBeTruthy());
 await fireEvent.press(page.getByTestId('invite-confirm'));
 expect(page.getByTestId('family-open-invite')).toBeDisabled();
 await fireEvent.press(page.getByTestId('family-open-invite'));
 expect(page.getByTestId('invite-confirm')).toBeTruthy();
 await act(async()=>{done({familyId:'new'});});
 await waitFor(()=>expect(mockFamilies).toHaveBeenCalledTimes(2));
 expect(page.getByText('已加入这个家。')).toBeTruthy();
 expect(page.getByTestId('family-open-invite')).toBeEnabled();
});
