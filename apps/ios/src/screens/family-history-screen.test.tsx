import {invalidateFamilySafety} from '../application/family-safety-events';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, AppState, type AppStateStatus } from 'react-native';
import { FamilyHistoryScreen } from './family-history-screen';
const mockScrollTo=jest.fn();
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
jest.mock('./settings-chrome',()=>{const {View,Text}=jest.requireActual('react-native');return {SettingsPage:({children,title,scrollRef}:{children:React.ReactNode;title:string;scrollRef?:{current:unknown}})=>{if(scrollRef)scrollRef.current={scrollTo:mockScrollTo};return <View><Text>{title}</Text>{children}</View>;}};});
const share={shareId:'share_d2',familyId:'family_d2',authorUserId:'a',snapshot:{note:'Morning',emotion:'平静',occurredAtPrecision:'unknown',media:[{objectId:'sound',mimeType:'audio/mp4',byteLength:12}]},sourceRevision:1};
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
  await fireEvent.press(list.getByTestId('history-open-share_d2'));await waitFor(()=>expect(mockRead).toHaveBeenCalledWith('family_d2','share_d2',expect.any(Function),undefined,expect.any(Function)));expect(mockPush).not.toHaveBeenCalled();expect(list.getByTestId('history-open-share_d2').props.accessibilityState.expanded).toBe(true);
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
  await waitFor(()=>expect(mockRead).toHaveBeenCalledWith('family_d2','second',expect.any(Function),undefined,expect.any(Function)));
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

it('uses a recipient read error when shared media cannot load',async()=>{
  mockRead.mockRejectedValueOnce({code:'SHARE_MEDIA_UNAVAILABLE'});
  const page=await render(<FamilyHistoryScreen familyId="family_d2" shareId="share_d2"/>);
  await waitFor(()=>expect(page.getByText('这份分享的照片或声音暂时读不出来，请再试一次。')).toBeTruthy());
  expect(page.queryByText('照片或声音暂时无法分享，原记录还在。')).toBeNull();
});

it('E3 refresh after dissolution drops the old family title and does not autoplay cached sound',async()=>{
 const page=await render(<FamilyHistoryScreen familyId="family_d2" shareId="share_d2"/>);await waitFor(()=>expect(page.getByText('Morning')).toBeTruthy());
 mockPolicy.mockRejectedValueOnce({code:'FAMILY_DISSOLVED'});
 await act(async()=>{AppState.currentState='background';mockListeners.slice().forEach(fn=>fn('background'));});
 await act(async()=>{AppState.currentState='active';mockListeners.slice().forEach(fn=>fn('active'));});
 await waitFor(()=>expect(page.getByText('这个家庭已解散，个人记录还在。')).toBeTruthy());
 expect(page.queryByText('Window')).toBeNull();expect(page.queryByText('Morning')).toBeNull();expect(mockPlay).not.toHaveBeenCalled();
});

it('E3 missing membership after remote dissolution clears private content without claiming a cause',async()=>{
 const page=await render(<FamilyHistoryScreen familyId="family_d2" shareId="share_d2"/>);await waitFor(()=>expect(page.getByText('Morning')).toBeTruthy());
 mockPolicy.mockRejectedValueOnce({code:'NOT_IN_FAMILY'});
 await act(async()=>{AppState.currentState='background';mockListeners.slice().forEach(fn=>fn('background'));});
 await act(async()=>{AppState.currentState='active';mockListeners.slice().forEach(fn=>fn('active'));});
 await waitFor(()=>expect(page.getByText('现在无法访问这个家庭，个人记录还在。')).toBeTruthy());
 expect(page.queryByText('这个家庭已解散，个人记录还在。')).toBeNull();
 expect(page.queryByText('Window')).toBeNull();expect(page.queryByText('Morning')).toBeNull();expect(mockPlay).not.toHaveBeenCalled();
});

it('shows a live author name and keeps withdrawal bound to author id rather than nickname',async()=>{
 mockList.mockResolvedValue({userId:'b',shares:[{...share,authorNickname:'小禾'}]});
 const page=await render(<FamilyHistoryScreen familyId="family_d2"/>);
 await waitFor(()=>expect(page.getByText('小禾 分享的')).toBeTruthy());
 expect(page.queryByTestId('history-revoke')).toBeNull();
});

it('offers report and block only for another author and hides immediately on safety changes',async()=>{
 const page=await render(<FamilyHistoryScreen familyId="family_d2" shareId="share_d2"/>);
 await waitFor(()=>expect(page.getByTestId('family-safety-menu')).toBeTruthy());
 await fireEvent.press(page.getByTestId('family-safety-menu'));
 expect(page.getByText('举报这条内容')).toBeTruthy();expect(page.getByText('不再看这位家人的内容')).toBeTruthy();
 await act(async()=>invalidateFamilySafety());expect(page.queryByText('Morning')).toBeNull();
});
it('renewal removes restricted content without redownloading photos or automatically playing audio',async()=>{
 jest.useFakeTimers();
 try {
  const page=await render(<FamilyHistoryScreen familyId="family_d2" shareId="share_d2"/>);await waitFor(()=>expect(page.getByText('Morning')).toBeTruthy());
  mockAuthorize.mockRejectedValueOnce({code:'FORBIDDEN'});
  await act(async()=>{jest.advanceTimersByTime(5100);});
  expect(page.queryByText('Morning')).toBeNull();expect(mockRead).toHaveBeenCalledTimes(1);expect(mockPlay).not.toHaveBeenCalled();
 } finally {jest.useRealTimers();}
});

it('keeps the inline download open while the parent list renews beyond fifteen seconds',async()=>{
 jest.useFakeTimers();
 try {
  let finish!:(value:typeof reading)=>void;
  mockRead.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const page=await render(<FamilyHistoryScreen familyId="family_d2"/>);
  await waitFor(()=>expect(page.getByTestId('history-open-share_d2')).toBeTruthy());
  await fireEvent.press(page.getByTestId('history-open-share_d2'));
  await waitFor(()=>expect(mockRead).toHaveBeenCalledTimes(1));
  for(let i=0;i<5;i++)await act(async()=>{jest.advanceTimersByTime(5000);});
  expect(page.getByTestId('history-open-share_d2').props.accessibilityState.expanded).toBe(true);
  expect(page.queryByText('这份家庭记录现在不可读。')).toBeNull();
  expect(mockList.mock.calls.length).toBeGreaterThan(3);
  await act(async()=>{finish(reading);});
  expect(page.getByTestId('family-history-reading')).toBeTruthy();
  await page.unmount();
 }finally{jest.useRealTimers();}
});
it('hides on a real renewal timeout without presenting it as a server denial',async()=>{
 jest.useFakeTimers();
 try {
  const page=await render(<FamilyHistoryScreen familyId="family_d2" shareId="share_d2"/>);
  await waitFor(()=>expect(page.getByText('Morning')).toBeTruthy());
  mockAuthorize.mockReturnValueOnce(new Promise(()=>{}));
  await act(async()=>{jest.advanceTimersByTime(16000);});
  expect(page.queryByText('Morning')).toBeNull();
  expect(page.getByText('暂时无法确认阅读资格，请再试一次。')).toBeTruthy();
  expect(page.queryByText('这份家庭记录现在不可读。')).toBeNull();
  await page.unmount();
 }finally{jest.useRealTimers();}
});

it('shows authorized text and each photo before the whole record finishes',async()=>{
 const photos=[1,2,3].map(n=>({objectId:`p${n}`,mimeType:'image/jpeg',byteLength:10}));
 const partial={...reading,share:{...share,snapshot:{...share.snapshot,media:photos}},media:[]};
 let publish!:(value:unknown)=>void,finish!:(value:unknown)=>void;
 mockRead.mockImplementationOnce((_f,_s,_c,_o,callback)=>{publish=callback;return new Promise(resolve=>{finish=resolve;});});
 const page=await render(<FamilyHistoryScreen familyId="family_d2" shareId="share_d2"/>);
 await waitFor(()=>expect(mockRead).toHaveBeenCalled());
 await act(async()=>{publish(partial);});
 expect(page.getByText('Morning')).toBeTruthy();expect(page.getByText('正在载入照片和声音（0/3）')).toBeTruthy();
 await act(async()=>{publish({...partial,media:[{objectId:'p2',mimeType:'image/jpeg',uri:'file:///verified/p2'}]});});
 expect(page.getByText('正在载入照片和声音（1/3）')).toBeTruthy();expect(page.getByTestId('history-pending-p1')).toBeTruthy();expect(page.queryByTestId('history-pending-p2')).toBeNull();
 await act(async()=>{finish({...partial,media:photos.map(m=>({...m,uri:`file:///verified/${m.objectId}`}))});});
 expect(page.queryByText('正在载入照片和声音（1/3）')).toBeNull();await page.unmount();
});
it('anchors the newly selected row after the previous expanded row collapses, then lets the user scroll freely',async()=>{
 const second={...share,shareId:'second'};mockList.mockResolvedValue({userId:'b',shares:[share,second]});
 const page=await render(<FamilyHistoryScreen familyId="family_d2"/>);
 await waitFor(()=>expect(page.getByTestId('history-open-share_d2')).toBeTruthy());
 await fireEvent.press(page.getByTestId('history-open-share_d2'));
 await fireEvent(page.getByTestId('history-row-share_d2'),'layout',{nativeEvent:{layout:{y:20,height:1200,width:300,x:0}}});
 mockScrollTo.mockClear();await fireEvent.press(page.getByTestId('history-open-second'));
 await fireEvent(page.getByTestId('history-row-second'),'layout',{nativeEvent:{layout:{y:240,height:200,width:300,x:0}}});
 expect(mockScrollTo).toHaveBeenLastCalledWith({y:228,animated:false});
 await fireEvent(page.getByTestId('history-row-second'),'layout',{nativeEvent:{layout:{y:240,height:1400,width:300,x:0}}});
 expect(mockScrollTo).toHaveBeenCalledTimes(1);await page.unmount();
});
it('ignores incremental media arriving after background protection takes over',async()=>{
 let publish!:(value:unknown)=>void,finish!:(value:unknown)=>void;
 mockRead.mockImplementationOnce((_f,_s,_c,_o,callback)=>{publish=callback;return new Promise(resolve=>{finish=resolve;});});
 const page=await render(<FamilyHistoryScreen familyId="family_d2" shareId="share_d2"/>);
 await waitFor(()=>expect(mockRead).toHaveBeenCalled());await act(async()=>{publish({...reading,media:[]});});
 expect(page.getByText('Morning')).toBeTruthy();
 await act(async()=>{AppState.currentState='background';mockListeners.slice().forEach(fn=>fn('background'));});
 await act(async()=>{publish(reading);finish(reading);});
 expect(page.queryByText('Morning')).toBeNull();expect(mockPlay).not.toHaveBeenCalled();await page.unmount();
});
