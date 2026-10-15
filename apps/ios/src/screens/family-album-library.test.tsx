import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
import {AppState,type AppStateStatus} from 'react-native';
import {FamilyAlbumLibrary} from './family-album-library';
const mockPush=jest.fn(),mockDirectory=jest.fn(),mockAccess=jest.fn(),mockList=jest.fn();
const mockLock={snapshot:{locked:false}};const mockListeners:((s:AppStateStatus)=>void)[]=[];
jest.mock('expo-router',()=>{const {useEffect}=jest.requireActual('react');return {useRouter:()=>({push:mockPush}),useFocusEffect:(fn:()=>void|(()=>void))=>useEffect(fn,[fn])};});
jest.mock('../application/container',()=>({getFamilyUseCases:async()=>({getFamilies:mockDirectory,albums:{access:mockAccess,list:mockList}})}));
jest.mock('./device-lock-context',()=>({useDeviceLock:()=>mockLock}));
jest.mock('./album-cover-tile',()=>({AlbumCoverFace:()=>null}));
beforeEach(()=>{jest.clearAllMocks();mockLock.snapshot.locked=false;mockListeners.length=0;
 Object.defineProperty(AppState,'currentState',{configurable:true,writable:true,value:'active'});
 jest.spyOn(AppState,'addEventListener').mockImplementation((_event,fn)=>{mockListeners.push(fn);return {remove:()=>{const i=mockListeners.indexOf(fn);if(i>=0)mockListeners.splice(i,1);}};});
 mockDirectory.mockResolvedValue({userId:'a',families:[{familyId:'f',name:'Home',role:'creator'}]});mockAccess.mockResolvedValue({userId:'a',rulesAcknowledged:true});mockList.mockResolvedValue({access:{userId:'a'},albums:[{albumId:'b',familyId:'f',name:'Our days',entryCount:3}]});
});
afterEach(()=>{jest.restoreAllMocks();jest.useRealTimers();});
it('shows books directly and opens the exact book without another family picker',async()=>{
 const page=await render(<FamilyAlbumLibrary/>);await waitFor(()=>expect(page.getByText('Our days')).toBeTruthy());expect(page.queryByText('选择这册所属的家庭')).toBeNull();
 await fireEvent.press(page.getByText('Our days'));expect(mockPush).toHaveBeenLastCalledWith({pathname:'/family-albums',params:{familyId:'f',albumId:'b',mode:'read'}});
 await fireEvent.press(page.getByText('新建家庭册'));expect(mockPush).toHaveBeenLastCalledWith({pathname:'/family-albums',params:{mode:'new'}});
});
it('shows an empty state, keeps notices per family, and never fetches unacknowledged books',async()=>{
 mockAccess.mockResolvedValue({userId:'a',rulesAcknowledged:false});const page=await render(<FamilyAlbumLibrary/>);await waitFor(()=>expect(page.getByText('确认 Home 的家庭册说明')).toBeTruthy());expect(mockList).not.toHaveBeenCalled();expect(page.getByText('新建家庭册')).toBeTruthy();
});
it('offers no creation to ordinary members and hides content on background or lock',async()=>{
 mockDirectory.mockResolvedValue({userId:'a',families:[{familyId:'f',name:'Home',role:'member'}]});const page=await render(<FamilyAlbumLibrary/>);await waitFor(()=>expect(page.getByText('Our days')).toBeTruthy());expect(page.queryByText('新建家庭册')).toBeNull();
 await act(async()=>{AppState.currentState='background';mockListeners.slice().forEach(fn=>fn('background'));});expect(page.queryByText('Our days')).toBeNull();
});
it('expires the library even if renewal hangs and ignores late responses',async()=>{
 jest.useFakeTimers();const page=await render(<FamilyAlbumLibrary/>);await waitFor(()=>expect(page.getByText('Our days')).toBeTruthy());let finish!:(value:unknown)=>void;
 mockDirectory.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));await act(async()=>{jest.advanceTimersByTime(4000);});expect(page.queryByText('Our days')).toBeNull();
 await act(async()=>{finish({userId:'a',families:[{familyId:'f',name:'Home',role:'creator'}]});});expect(page.queryByText('Our days')).toBeNull();
});
