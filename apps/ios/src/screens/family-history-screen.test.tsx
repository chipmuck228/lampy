import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, AppState, type AppStateStatus } from 'react-native';
import { FamilyHistoryScreen } from './family-history-screen';
const mockPolicy=jest.fn(),mockList=jest.fn(),mockRead=jest.fn(),mockAuthorize=jest.fn(),mockRevoke=jest.fn(),mockPush=jest.fn(),mockPlay=jest.fn();
let mockOpen=true;
let mockFocusCleanup:(()=>void)|undefined;
const mockLock={snapshot:{locked:false}};
const mockListeners:((s:AppStateStatus)=>void)[]=[];
const mockSound={status:'idle',currentTimeMs:0,failed:false,play:mockPlay};
jest.mock('expo-router',()=>{const {useEffect}=jest.requireActual('react');return {useRouter:()=>({back:jest.fn(),push:mockPush}),useFocusEffect:(fn:()=>void|(()=>void))=>useEffect(()=>{const cleanup=fn();mockFocusCleanup=typeof cleanup === 'function' ? cleanup : undefined;return cleanup;},[fn])};});
jest.mock('../application/container',()=>({getFamilyUseCases:async()=>({history:{getPolicy:mockPolicy,list:mockList,read:mockRead,authorize:mockAuthorize,revoke:mockRevoke}})}));
jest.mock('../infrastructure/family-config',()=>({isFamilyProductEntryOpen:()=>mockOpen}));
jest.mock('./device-lock-context',()=>({useDeviceLock:()=>mockLock}));
jest.mock('./use-sound-player',()=>({useSoundPlayer:()=>mockSound}));
jest.mock('./settings-chrome',()=>{const {View,Text}=jest.requireActual('react-native');return {SettingsPage:({children,title}:{children:React.ReactNode;title:string})=><View><Text>{title}</Text>{children}</View>};});
const share={shareId:'share_d2',familyId:'family_d2',authorUserId:'a',snapshot:{note:'Morning',emotion:'平静',occurredAtPrecision:'unknown',media:[]},sourceRevision:1};
const reading={userId:'b',share,media:[{objectId:'sound',mimeType:'audio/mp4',uri:'file:///family-cache/b/family_d2/share_d2/sound'}]};
beforeEach(()=>{
  jest.clearAllMocks();mockOpen=true;mockLock.snapshot.locked=false;mockListeners.length=0;mockSound.status='idle';mockSound.currentTimeMs=0;
  Object.defineProperty(AppState,'currentState',{configurable:true,writable:true,value:'active'});
  jest.spyOn(AppState,'addEventListener').mockImplementation((_event,fn)=>{mockListeners.push(fn);return {remove:()=>{const i=mockListeners.indexOf(fn);if(i>=0)mockListeners.splice(i,1);}};});
  mockPolicy.mockResolvedValue({family:{name:'Window',role:'member'},policy:'family-history-v2'});mockList.mockResolvedValue({userId:'b',shares:[share]});
  mockRead.mockResolvedValue(reading);mockAuthorize.mockResolvedValue({userId:'b',share});mockPlay.mockResolvedValue(undefined);
});
afterEach(()=>jest.restoreAllMocks());
it('keeps closed and locked entry private',async()=>{
  mockOpen=false;const page=await render(<FamilyHistoryScreen familyId="family_d2"/>);expect(mockPolicy).not.toHaveBeenCalled();await page.unmount();
  mockOpen=true;mockLock.snapshot.locked=true;await render(<FamilyHistoryScreen familyId="family_d2"/>);expect(mockPolicy).not.toHaveBeenCalled();
});
it('opens the exact share inline with its family, collapses it, and does not offer member revoke',async()=>{
  const list=await render(<FamilyHistoryScreen familyId="family_d2"/>);await waitFor(()=>expect(list.getByText('Morning')).toBeTruthy());
  await fireEvent.press(list.getByTestId('history-open-share_d2'));await waitFor(()=>expect(mockRead).toHaveBeenCalledWith('family_d2','share_d2',expect.any(Function)));expect(mockPush).not.toHaveBeenCalled();expect(list.getByTestId('history-open-share_d2').props.accessibilityState.expanded).toBe(true);
  await fireEvent.press(list.getByTestId('history-open-share_d2'));expect(list.queryByTestId('family-history-reading')).toBeNull();await list.unmount();
  const detail=await render(<FamilyHistoryScreen familyId="family_d2" shareId="share_d2"/>);await waitFor(()=>expect(detail.getByText('Morning')).toBeTruthy());
  expect(detail.queryByTestId('history-revoke')).toBeNull();expect(mockPlay).not.toHaveBeenCalled();
});
it('authorizes before explicit playback, and a denied playback hides previously read content',async()=>{
  const page=await render(<FamilyHistoryScreen familyId="family_d2" shareId="share_d2"/>);await waitFor(()=>expect(page.getByText('Morning')).toBeTruthy());
  expect(mockPlay).not.toHaveBeenCalled();await fireEvent.press(page.getByTestId('history-audio-sound'));await waitFor(()=>expect(mockPlay).toHaveBeenCalledTimes(1));
  expect(mockAuthorize).toHaveBeenCalledTimes(1);mockAuthorize.mockRejectedValueOnce({code:'SHARE_NOT_FOUND'});
  await fireEvent.press(page.getByTestId('history-audio-sound'));await waitFor(()=>expect(page.queryByText('Morning')).toBeNull());expect(mockPlay).toHaveBeenCalledTimes(1);
});
it('hides on background and reloads authority on return without autoplay',async()=>{
  const page=await render(<FamilyHistoryScreen familyId="family_d2" shareId="share_d2"/>);await waitFor(()=>expect(page.getByText('Morning')).toBeTruthy());
  await act(async()=>{AppState.currentState='background';mockListeners.slice().forEach(fn=>fn('background'));});expect(page.queryByText('Morning')).toBeNull();
  mockRead.mockRejectedValueOnce({code:'NETWORK'});
  await act(async()=>{AppState.currentState='active';mockListeners.slice().forEach(fn=>fn('active'));});
  await waitFor(()=>expect(page.getByText('再试一次')).toBeTruthy());expect(page.queryByText('Morning')).toBeNull();expect(mockPlay).not.toHaveBeenCalled();
  await fireEvent.press(page.getByText('再试一次'));await waitFor(()=>expect(page.getByText('Morning')).toBeTruthy());
});
it('does not let a late old-family reading replace a new family',async()=>{
  let resolve!:(v:typeof reading)=>void;mockRead.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
  const page=await render(<FamilyHistoryScreen familyId="family_d2" shareId="share_d2"/>);await waitFor(()=>expect(mockRead).toHaveBeenCalledTimes(1));
  mockRead.mockResolvedValueOnce({...reading,share:{...share,familyId:'other',snapshot:{...share.snapshot,note:'Other'}}});
  await page.rerender(<FamilyHistoryScreen familyId="other" shareId="other_share"/>);await waitFor(()=>expect(page.getByText('Other')).toBeTruthy());
  await act(async()=>{resolve(reading);});expect(page.queryByText('Morning')).toBeNull();expect(page.getByText('Other')).toBeTruthy();
});

it('requires explicit confirmation to withdraw and discards confirmation after background', async()=>{
  mockRead.mockResolvedValue({...reading,userId:'a'});
  const alert=jest.spyOn(Alert,'alert');
  const page=await render(<FamilyHistoryScreen familyId="family_d2" shareId="share_d2"/>);
  await waitFor(()=>expect(page.getByTestId('history-revoke')).toBeTruthy());
  await fireEvent.press(page.getByTestId('history-revoke'));
  expect(mockRevoke).not.toHaveBeenCalled();
  const confirm=alert.mock.calls[0][2]![1].onPress!;
  await act(async()=>{AppState.currentState='background';mockListeners.slice().forEach(fn=>fn('background'));});
  await act(async()=>{confirm();});expect(mockRevoke).not.toHaveBeenCalled();
});
it('withdraws only after confirmation, keeps cancel harmless', async()=>{
  mockRead.mockResolvedValue({...reading,userId:'a'});
  const alert=jest.spyOn(Alert,'alert');
  const page=await render(<FamilyHistoryScreen familyId="family_d2" shareId="share_d2"/>);
  await waitFor(()=>expect(page.getByTestId('history-revoke')).toBeTruthy());
  await fireEvent.press(page.getByTestId('history-revoke'));expect(mockRevoke).not.toHaveBeenCalled();
  await act(async()=>{alert.mock.calls[0][2]![1].onPress!();});
  expect(mockRevoke).toHaveBeenCalledTimes(1);
});
it('shows an inviting empty state with navigation instead of a record list', async()=>{
  mockList.mockResolvedValue({userId:'b',shares:[]});
  const page=await render(<FamilyHistoryScreen familyId="family_d2"/>);
  await waitFor(()=>expect(page.getByTestId('history-empty')).toBeTruthy());
  expect(page.getByText('去最近')).toBeTruthy();expect(page.getByText('去回看')).toBeTruthy();
});

it('never treats a detail with a temporarily missing route id as an empty family',async()=>{
  const page=await render(<FamilyHistoryScreen familyId="family_d2" shareId=""/>);
  await waitFor(()=>expect(page.getByText('再试一次')).toBeTruthy());
  expect(page.queryByTestId('history-empty')).toBeNull();expect(mockList).not.toHaveBeenCalled();
});
it('keeps pending detail reading out of the empty-family state',async()=>{
  let resolve!:(v:typeof reading)=>void;mockRead.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
  const page=await render(<FamilyHistoryScreen familyId="family_d2" shareId="share_d2"/>);
  await waitFor(()=>expect(mockRead).toHaveBeenCalledTimes(1));
  expect(page.getByText('正在读取家庭记录。')).toBeTruthy();expect(page.queryByTestId('history-empty')).toBeNull();
  await act(async()=>{resolve(reading);});expect(page.getByText('Morning')).toBeTruthy();expect(page.queryByTestId('history-empty')).toBeNull();
});

it('does not flash empty-family content when the populated list loses focus',async()=>{
  const page=await render(<FamilyHistoryScreen familyId="family_d2"/>);
  await waitFor(()=>expect(page.getByText('Morning')).toBeTruthy());
  await act(async()=>{mockFocusCleanup?.();});
  expect(page.queryByTestId('history-empty')).toBeNull();expect(page.queryByText('Morning')).toBeNull();
});

it('does not resurrect an inline reading that finishes after collapse',async()=>{
  let resolve!:(v:typeof reading)=>void;mockRead.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
  const page=await render(<FamilyHistoryScreen familyId="family_d2"/>);
  await waitFor(()=>expect(page.getByTestId('history-open-share_d2')).toBeTruthy());
  await fireEvent.press(page.getByTestId('history-open-share_d2'));
  await waitFor(()=>expect(mockRead).toHaveBeenCalledTimes(1));
  await fireEvent.press(page.getByTestId('history-open-share_d2'));
  await act(async()=>{resolve(reading);});expect(page.queryByTestId('family-history-reading')).toBeNull();
  expect(page.getByTestId('history-open-share_d2').props.accessibilityState.expanded).toBe(false);
});

it('keeps only one record expanded and reads the new exact share',async()=>{
  mockList.mockResolvedValue({userId:'b',shares:[share,{...share,shareId:'second',snapshot:{...share.snapshot,note:'Second'}}]});
  const page=await render(<FamilyHistoryScreen familyId="family_d2"/>);
  await waitFor(()=>expect(page.getByTestId('history-open-second')).toBeTruthy());
  await fireEvent.press(page.getByTestId('history-open-share_d2'));
  await waitFor(()=>expect(mockRead).toHaveBeenCalledTimes(1));
  await fireEvent.press(page.getByTestId('history-open-second'));
  await waitFor(()=>expect(mockRead).toHaveBeenCalledWith('family_d2','second',expect.any(Function)));
  expect(page.getByTestId('history-open-share_d2').props.accessibilityState.expanded).toBe(false);
  expect(page.getByTestId('history-open-second').props.accessibilityState.expanded).toBe(true);
  expect(mockPush).not.toHaveBeenCalled();
});
it('withdraws inline and refreshes the list without navigating away',async()=>{
  mockRead.mockResolvedValue({...reading,userId:'a'});const alert=jest.spyOn(Alert,'alert');
  const page=await render(<FamilyHistoryScreen familyId="family_d2"/>);
  await waitFor(()=>expect(page.getByTestId('history-open-share_d2')).toBeTruthy());
  await fireEvent.press(page.getByTestId('history-open-share_d2'));
  await waitFor(()=>expect(page.getByTestId('history-revoke')).toBeTruthy());
  mockList.mockResolvedValue({userId:'a',shares:[]});
  await fireEvent.press(page.getByTestId('history-revoke'));
  await act(async()=>{alert.mock.calls[0][2]![1].onPress!();});
  await waitFor(()=>expect(page.getByTestId('history-empty')).toBeTruthy());
  expect(mockRevoke).toHaveBeenCalledTimes(1);expect(mockPush).not.toHaveBeenCalled();
});
