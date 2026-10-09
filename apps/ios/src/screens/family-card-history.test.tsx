import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, AppState, type AppStateStatus } from 'react-native';
import { FamilyCardHistory } from './family-card-history';
const mockConfirm=jest.fn(),mockPolicy=jest.fn(),mockList=jest.fn(),mockRead=jest.fn(),mockAuthorize=jest.fn(),mockRevoke=jest.fn(),mockPush=jest.fn(),mockPlay=jest.fn();
let mockOpen=true;
const mockLock={snapshot:{locked:false}};
const mockListeners:((s:AppStateStatus)=>void)[]=[];
const mockSound={status:'idle',currentTimeMs:0,failed:false,play:mockPlay};
jest.mock('expo-router',()=>{const {useEffect}=jest.requireActual('react');return {useRouter:()=>({back:jest.fn(),push:mockPush}),useFocusEffect:(fn:()=>void)=>useEffect(fn,[fn])};});
jest.mock('../application/container',()=>({getFamilyUseCases:async()=>({history:{getPolicy:mockPolicy,confirmPolicy:mockConfirm,list:mockList,read:mockRead,authorize:mockAuthorize,revoke:mockRevoke}})}));
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

it('enables legacy sharing in the card only after confirmation',async()=>{
  mockPolicy.mockResolvedValueOnce({family:{role:'creator'},policy:'legacy'});
  const alert=jest.spyOn(Alert,'alert');
  const page=await render(<FamilyCardHistory familyId="family_d2"/>);
  await waitFor(()=>expect(page.getByTestId('family-history-enable-family_d2')).toBeTruthy());
  await fireEvent.press(page.getByTestId('family-history-enable-family_d2'));
  expect(mockConfirm).not.toHaveBeenCalled();
  await act(async()=>{alert.mock.calls[0][2]![1].onPress!();});
  expect(mockConfirm).toHaveBeenCalledTimes(1);
  await waitFor(()=>expect(page.getByTestId('family-records-family_d2')).toBeTruthy());
});
it('does not grant a member an enable button',async()=>{
  mockPolicy.mockResolvedValue({family:{role:'member'},policy:'legacy'});
  const page=await render(<FamilyCardHistory familyId="family_d2"/>);
  await waitFor(()=>expect(page.getByText('等创建者开启，一起留下家里的片段。')).toBeTruthy());
  expect(page.queryByTestId('family-history-enable-family_d2')).toBeNull();
});
it('drops a delayed confirmation after the card is removed',async()=>{
  mockPolicy.mockResolvedValue({family:{role:'creator'},policy:'legacy'});
  const alert=jest.spyOn(Alert,'alert');
  const page=await render(<FamilyCardHistory familyId="family_d2"/>);
  await waitFor(()=>expect(page.getByTestId('family-history-enable-family_d2')).toBeTruthy());
  await fireEvent.press(page.getByTestId('family-history-enable-family_d2'));
  const confirm=alert.mock.calls[0][2]![1].onPress!;
  await page.unmount();await act(async()=>{confirm();});expect(mockConfirm).not.toHaveBeenCalled();
});
