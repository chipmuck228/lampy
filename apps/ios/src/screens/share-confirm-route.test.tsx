import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import ShareConfirmRoute from '../app/share/[id]';
const mockFamilies=jest.fn(),mockPrepare=jest.fn(),mockShare=jest.fn(),mockPolicy=jest.fn(),mockUpgrade=jest.fn();
let mockOpen=true;
const mockLock={snapshot:{locked:false}};
const mockListeners: ((s:AppStateStatus)=>void)[]=[];
jest.mock('expo-router',()=>{const {useEffect}=jest.requireActual('react');return {useRouter:()=>({back:jest.fn()}),useLocalSearchParams:()=>({id:'moment_d2'}),useFocusEffect:(fn:()=>void)=>useEffect(fn,[fn])};});
jest.mock('../application/container',()=>({getFamilyUseCases:async()=>({getFamilies:mockFamilies,history:{prepare:mockPrepare,share:mockShare,getPolicy:mockPolicy,confirmPolicy:mockUpgrade}})}));
jest.mock('../infrastructure/family-config',()=>({isFamilyProductEntryOpen:()=>mockOpen}));
jest.mock('./device-lock-context',()=>({useDeviceLock:()=>mockLock}));
jest.mock('./settings-chrome',()=>{const {View,Text}=jest.requireActual('react-native');return {SettingsPage:({children,title}:{children:React.ReactNode;title:string})=><View><Text>{title}</Text>{children}</View>};});
const family={familyId:'fam_d2',name:'Window',role:'creator',memberCount:2};
const preview={userId:'a',family,sourceMomentId:'moment_d2',sourceRevision:1,note:'Morning',emotion:'平静',occurredAtPrecision:'unknown',availableMedia:[],media:[]};
beforeEach(()=>{
  jest.clearAllMocks();mockOpen=true;mockLock.snapshot.locked=false;mockListeners.length=0;
  Object.defineProperty(AppState,'currentState',{configurable:true,writable:true,value:'active'});
  jest.spyOn(AppState,'addEventListener').mockImplementation((_event,fn)=>{mockListeners.push(fn);return {remove:()=>{const i=mockListeners.indexOf(fn);if(i>=0)mockListeners.splice(i,1);}};});
  mockFamilies.mockResolvedValue({families:[family]});mockPolicy.mockResolvedValue({userId:'a',family,policy:'family-history-v2'});
  mockPrepare.mockResolvedValue(preview);mockShare.mockResolvedValue({shareId:'stored'});mockUpgrade.mockResolvedValue({policy:'family-history-v2'});
});
afterEach(()=>jest.restoreAllMocks());
it('closed and locked routes never read private sources',async()=>{
  mockOpen=false;const page=await render(<ShareConfirmRoute/>);
  expect(page.getByText('家庭分享暂未开放。')).toBeTruthy();expect(mockFamilies).not.toHaveBeenCalled();await page.unmount();
  mockOpen=true;mockLock.snapshot.locked=true;await render(<ShareConfirmRoute/>);expect(mockFamilies).not.toHaveBeenCalled();
});
it('requires family selection and explicit history consent; a test param cannot auto-share',async()=>{
  const page=await render(<ShareConfirmRoute/>);await waitFor(()=>expect(page.getByText('Window')).toBeTruthy());
  expect(mockPrepare).not.toHaveBeenCalled();await fireEvent.press(page.getByTestId('share-family-fam_d2'));
  await waitFor(()=>expect(page.getByText('Morning')).toBeTruthy());
  expect(page.getByTestId('share-confirm')).toBeDisabled();expect(mockShare).not.toHaveBeenCalled();
  await fireEvent.press(page.getByTestId('share-history-consent'));await fireEvent.press(page.getByTestId('share-confirm'));
  await waitFor(()=>expect(mockShare).toHaveBeenCalledTimes(1));expect(mockShare.mock.calls[0][1]).toBe('new-members-can-read-active-history');
  expect(page.getByText('分享已保存，家人可以在家庭记录中查看。')).toBeTruthy();expect(page.queryByText('家人已收到')).toBeNull();
});
it('shows creator confirmation before upgrading a legacy family and never upgrades on selection',async()=>{
  mockPolicy.mockResolvedValueOnce({family,policy:'legacy'}).mockResolvedValue({family,policy:'family-history-v2'});
  const page=await render(<ShareConfirmRoute/>);await waitFor(()=>expect(page.getByText('Window')).toBeTruthy());await fireEvent.press(page.getByText('Window'));
  await waitFor(()=>expect(page.getByTestId('share-upgrade')).toBeTruthy());expect(mockUpgrade).not.toHaveBeenCalled();
  await fireEvent.press(page.getByTestId('share-upgrade'));await waitFor(()=>expect(mockPrepare).toHaveBeenCalled());expect(mockUpgrade).toHaveBeenCalledTimes(1);
});
it('does not accept a preview that arrives after backgrounding and requires a fresh load on return',async()=>{
  let resolve!: (v:typeof preview)=>void;mockPrepare.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
  const page=await render(<ShareConfirmRoute/>);await waitFor(()=>expect(page.getByText('Window')).toBeTruthy());await fireEvent.press(page.getByText('Window'));
  await waitFor(()=>expect(mockPrepare).toHaveBeenCalled());
  await act(async()=>{AppState.currentState='background';mockListeners.slice().forEach(fn=>fn('background'));resolve(preview);});
  expect(page.queryByText('Morning')).toBeNull();expect(mockShare).not.toHaveBeenCalled();
  await act(async()=>{AppState.currentState='active';mockListeners.slice().forEach(fn=>fn('active'));});
  await waitFor(()=>expect(mockFamilies).toHaveBeenCalledTimes(2));expect(page.queryByTestId('history-share-preview')).toBeNull();
});
