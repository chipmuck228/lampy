import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
import {AppState,type AppStateStatus} from 'react-native';
import FamilyAlbumsScreen from './family-albums-screen';
const mockDirectory=jest.fn(),mockAccess=jest.fn(),mockList=jest.fn(),mockRead=jest.fn(),mockValidate=jest.fn(),mockPause=jest.fn();
const mockLock={snapshot:{locked:false}};let mockOpen=true;
const mockListeners:((s:AppStateStatus)=>void)[]=[];
jest.mock('expo-router',()=>{const {useEffect}=jest.requireActual('react');return {useRouter:()=>({back:jest.fn(),push:jest.fn()}),useFocusEffect:(fn:()=>void|(()=>void))=>useEffect(fn,[fn])};});
jest.mock('../application/container',()=>({getFamilyUseCases:async()=>({getFamilies:mockDirectory,albums:{access:mockAccess,list:mockList,read:mockRead,validate:mockValidate}})}));
jest.mock('../application/foreground-audio',()=>({pauseForegroundAudio:()=>mockPause()}));
jest.mock('../infrastructure/family-config',()=>({isFamilyProductEntryOpen:()=>mockOpen}));
jest.mock('./device-lock-context',()=>({useDeviceLock:()=>mockLock}));
jest.mock('./settings-chrome',()=>{const {View}=jest.requireActual('react-native');return {SettingsPage:({children}:{children:React.ReactNode})=><View>{children}</View>};});
const permission={familyId:'f',userId:'a',membershipId:'m',role:'member',authority:'current',rulesAcknowledged:true,rulesVersion:1,canManage:false,canExport:false};
const book={albumId:'book',familyId:'f',name:'Family book',opening:null,revision:1,access:permission,validation:'v',items:[{shareId:'s',status:'active',share:{authorNickname:'Author',snapshot:{note:'Private original',media:[]}}},{shareId:'old',status:'withdrawn'}]};
beforeEach(()=>{
 jest.clearAllMocks();mockOpen=true;mockLock.snapshot.locked=false;mockListeners.length=0;process.env.EXPO_PUBLIC_FAMILY_ALBUM_EVAL='1';
 Object.defineProperty(AppState,'currentState',{configurable:true,writable:true,value:'active'});
 jest.spyOn(AppState,'addEventListener').mockImplementation((_event,fn)=>{mockListeners.push(fn);return {remove:()=>{const i=mockListeners.indexOf(fn);if(i>=0)mockListeners.splice(i,1);}};});
 mockDirectory.mockResolvedValue({userId:'a',families:[{familyId:'f',name:'Family'}]});mockAccess.mockResolvedValue(permission);mockList.mockResolvedValue({access:permission,albums:[{albumId:'book',name:'Family book',entryCount:2}]});mockRead.mockResolvedValue(book);mockValidate.mockResolvedValue({valid:true});
});
afterEach(()=>{jest.restoreAllMocks();jest.useRealTimers();delete process.env.EXPO_PUBLIC_FAMILY_ALBUM_EVAL;});
async function openBook(){const page=await render(<FamilyAlbumsScreen/>);await waitFor(()=>expect(page.getByText('Family')).toBeTruthy());await fireEvent.press(page.getByText('Family'));await waitFor(()=>expect(page.getByText('Family book · 2')).toBeTruthy());await fireEvent.press(page.getByText('Family book · 2'));await waitFor(()=>expect(page.getByText('Private original')).toBeTruthy());return page;}
it('does not request private data when default gate or device lock is closed',async()=>{
 delete process.env.EXPO_PUBLIC_FAMILY_ALBUM_EVAL;const page=await render(<FamilyAlbumsScreen/>);expect(mockDirectory).not.toHaveBeenCalled();await page.unmount();
 process.env.EXPO_PUBLIC_FAMILY_ALBUM_EVAL='1';mockLock.snapshot.locked=true;await render(<FamilyAlbumsScreen/>);expect(mockDirectory).not.toHaveBeenCalled();
});
it('requires the rule notice before listing and gives ordinary members no write or export controls',async()=>{
 mockAccess.mockResolvedValue({...permission,rulesAcknowledged:false});const page=await render(<FamilyAlbumsScreen/>);await waitFor(()=>expect(page.getByText('Family')).toBeTruthy());await fireEvent.press(page.getByText('Family'));await waitFor(()=>expect(page.getByText('我知道了')).toBeTruthy());expect(mockList).not.toHaveBeenCalled();await page.unmount();
 mockAccess.mockResolvedValue(permission);const reading=await openBook();expect(reading.getByText('这条分享已不可用。')).toBeTruthy();expect(reading.queryByText('移出这一册')).toBeNull();expect(reading.queryByText('新建一册')).toBeNull();expect(reading.queryByText('生成 PDF')).toBeNull();
});
it('clears on background and prevents a late read from restoring private content',async()=>{
 let finish!:(value:unknown)=>void;mockRead.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const page=await render(<FamilyAlbumsScreen/>);await waitFor(()=>expect(page.getByText('Family')).toBeTruthy());await fireEvent.press(page.getByText('Family'));await waitFor(()=>expect(page.getByText('Family book · 2')).toBeTruthy());await fireEvent.press(page.getByText('Family book · 2'));await waitFor(()=>expect(mockRead).toHaveBeenCalled());
 await act(async()=>{AppState.currentState='background';mockListeners.slice().forEach(fn=>fn('background'));finish(book);});expect(page.queryByText('Private original')).toBeNull();expect(page.queryByText('Family')).toBeNull();expect(mockPause).toHaveBeenCalled();
});
it('expires locally while the authority request hangs',async()=>{
 jest.useFakeTimers();const page=await openBook();mockValidate.mockImplementation(()=>new Promise(()=>{}));mockDirectory.mockImplementation(()=>new Promise(()=>{}));
 await act(async()=>{jest.advanceTimersByTime(4000);});expect(page.queryByText('Private original')).toBeNull();expect(page.getByText('家庭内容或资格已变化，请重新核对。')).toBeTruthy();
});
