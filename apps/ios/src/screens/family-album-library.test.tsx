import {FAMILY_ALBUM_LEASE_MS} from '../application/family-album';
import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
import {AppState,type AppStateStatus} from 'react-native';
import {FamilyAlbumLibrary} from './family-album-library';
const mockPush=jest.fn(),mockDirectory=jest.fn(),mockAccess=jest.fn(),mockList=jest.fn();
const mockLock={snapshot:{locked:false}};const mockListeners:((s:AppStateStatus)=>void)[]=[];
jest.mock('expo-router',()=>{const {useEffect}=jest.requireActual('react');return {useRouter:()=>({push:mockPush}),useFocusEffect:(fn:()=>void|(()=>void))=>useEffect(fn,[fn])};});
jest.mock('../application/container',()=>({getFamilyUseCases:async()=>({getFamilies:mockDirectory,albums:{access:mockAccess,list:mockList}})}));
jest.mock('./device-lock-context',()=>({useDeviceLock:()=>mockLock}));
jest.mock('./album-cover-tile',()=>({...jest.requireActual('./album-cover-tile'),AlbumCoverFace:()=>null}));
beforeEach(()=>{jest.clearAllMocks();mockLock.snapshot.locked=false;mockListeners.length=0;
 Object.defineProperty(AppState,'currentState',{configurable:true,writable:true,value:'active'});
 jest.spyOn(AppState,'addEventListener').mockImplementation((_event,fn)=>{mockListeners.push(fn);return {remove:()=>{const i=mockListeners.indexOf(fn);if(i>=0)mockListeners.splice(i,1);}};});
 mockDirectory.mockResolvedValue({userId:'a',families:[{familyId:'f',name:'Home',role:'creator'}]});mockAccess.mockResolvedValue({userId:'a',rulesAcknowledged:true});mockList.mockResolvedValue({access:{userId:'a'},albums:[{albumId:'b',familyId:'f',name:'Our days',entryCount:3}]});
});
afterEach(()=>{jest.restoreAllMocks();jest.useRealTimers();});
it('shows books directly and opens the exact book without another family picker',async()=>{
 const page=await render(<FamilyAlbumLibrary/>);await waitFor(()=>expect(page.getByText('Our days')).toBeTruthy());expect(page.queryByText('选择这册所属的家庭')).toBeNull();
 await fireEvent.press(page.getByText('Our days'));expect(mockPush).toHaveBeenLastCalledWith({pathname:'/family-albums',params:{familyId:'f',albumId:'b',mode:'read'}});
 await fireEvent.press(page.getByLabelText('新建家庭册'));expect(mockPush).toHaveBeenLastCalledWith({pathname:'/family-albums',params:{mode:'new'}});
});
it('shows an empty state, keeps notices per family, and never fetches unacknowledged books',async()=>{
 mockAccess.mockResolvedValue({userId:'a',rulesAcknowledged:false});const page=await render(<FamilyAlbumLibrary/>);await waitFor(()=>expect(page.getByText('确认 Home 的家庭册说明')).toBeTruthy());expect(mockList).not.toHaveBeenCalled();expect(page.getByLabelText('新建家庭册')).toBeTruthy();
});
it('offers no creation to ordinary members and hides content on background or lock',async()=>{
 mockDirectory.mockResolvedValue({userId:'a',families:[{familyId:'f',name:'Home',role:'member'}]});const page=await render(<FamilyAlbumLibrary/>);await waitFor(()=>expect(page.getByText('Our days')).toBeTruthy());expect(page.queryByLabelText('新建家庭册')).toBeNull();
 await act(async()=>{AppState.currentState='background';mockListeners.slice().forEach(fn=>fn('background'));});expect(page.queryByText('Our days')).toBeNull();
});
it('expires the library even if renewal hangs and ignores late responses',async()=>{
 jest.useFakeTimers();const page=await render(<FamilyAlbumLibrary/>);await waitFor(()=>expect(page.getByText('Our days')).toBeTruthy());const finishes:((value:unknown)=>void)[]=[];
 mockDirectory.mockImplementation(()=>new Promise(resolve=>{finishes.push(resolve);}));await act(async()=>{jest.advanceTimersByTime(FAMILY_ALBUM_LEASE_MS+1000);});expect(page.queryByText('Our days')).toBeNull();
 await act(async()=>{finishes[0]({userId:'a',families:[{familyId:'f',name:'Home',role:'creator'}]});});expect(page.queryByText('Our days')).toBeNull();
});

it('uses the personal cover-wall geometry and the same title/count metadata',async()=>{
 const page=await render(<FamilyAlbumLibrary/>);await waitFor(()=>expect(page.getByText('Our days')).toBeTruthy());
 await fireEvent(page.getByTestId('family-album-cover-wall'),'layout',{nativeEvent:{layout:{width:340}}});
 expect(page.getByText('Our days')).toBeTruthy();expect(page.getByText('3条')).toBeTruthy();expect(page.getByText('Home')).toBeTruthy();
 const tile=page.getByRole('button',{name:'Our days，3条记录，Home'});
 expect(tile.props.style).toMatchObject({width:164,gap:6});
 expect(page.getByTestId('family-album-new').props.style).toMatchObject({width:164});expect(page.queryByText('新建家庭册')).toBeNull();
});

it('retains the qualified list through a transient failure and renews without a retry page',async()=>{
 jest.useFakeTimers();const page=await render(<FamilyAlbumLibrary/>);await waitFor(()=>expect(page.getByText('Our days')).toBeTruthy());
 mockList.mockRejectedValueOnce({code:'NETWORK',message:'private name/token'});
 await act(async()=>{jest.advanceTimersByTime(3000);});expect(page.getByText('Our days')).toBeTruthy();expect(page.queryByText('再试一次')).toBeNull();expect(page.getByTestId('family-album-library-diagnostic').props.children).toMatch(/^开发诊断：LIBRARY\/ALBUM_LIST\/NETWORK elapsedMs=/);expect(page.queryByText(/private name\/token/)).toBeNull();
 await act(async()=>{jest.advanceTimersByTime(3000);});expect(page.getByText('Our days')).toBeTruthy();expect(page.queryByTestId('family-album-library-diagnostic')).toBeNull();
});
it('hides on sustained network failure at the lease boundary and automatically recovers with fresh data',async()=>{
 jest.useFakeTimers();const page=await render(<FamilyAlbumLibrary/>);await waitFor(()=>expect(page.getByText('Our days')).toBeTruthy());mockDirectory.mockRejectedValue({code:'SERVER_UNREACHABLE'});
 for(let i=0;i<6;i++)await act(async()=>{jest.advanceTimersByTime(3000);});
 expect(page.queryByText('Our days')).toBeNull();expect(page.getByText('正在重新核对家庭内容，请稍候。')).toBeTruthy();expect(page.queryByText('再试一次')).toBeNull();expect(page.getByTestId('family-album-library-diagnostic').props.children).toContain('SERVER_UNREACHABLE');
 mockDirectory.mockResolvedValue({userId:'a',families:[{familyId:'f',name:'Home',role:'creator'}]});mockList.mockResolvedValue({access:{userId:'a'},albums:[{albumId:'new',familyId:'f',name:'Fresh book',entryCount:1}]});
 await act(async()=>{jest.advanceTimersByTime(3000);});expect(page.getByText('Fresh book')).toBeTruthy();expect(page.queryByText('Our days')).toBeNull();expect(page.queryByText('正在重新核对家庭内容，请稍候。')).toBeNull();
});
it('shows a safe stage diagnostic and immediately hides on an explicit access denial',async()=>{
 jest.useFakeTimers();const page=await render(<FamilyAlbumLibrary/>);await waitFor(()=>expect(page.getByText('Our days')).toBeTruthy());
 mockAccess.mockRejectedValueOnce({code:'NOT_IN_FAMILY',message:'private name'});await act(async()=>{jest.advanceTimersByTime(3000);});
 expect(page.queryByText('Our days')).toBeNull();expect(page.getByText('再试一次')).toBeTruthy();expect(page.getByTestId('family-album-library-diagnostic').props.children).toMatch(/^开发诊断：LIBRARY\/ALBUM_ACCESS\/NOT_IN_FAMILY elapsedMs=/);expect(page.queryByText('private name')).toBeNull();
 await fireEvent.press(page.getByText('再试一次'));await waitFor(()=>expect(page.getByText('Our days')).toBeTruthy());
});
it('does not expire a healthy library during several minutes of serial refreshes',async()=>{
 jest.useFakeTimers();const page=await render(<FamilyAlbumLibrary/>);await waitFor(()=>expect(page.getByText('Our days')).toBeTruthy());
 for(let i=0;i<65;i++){await act(async()=>{jest.advanceTimersByTime(3000);});expect(page.getByText('Our days')).toBeTruthy();expect(page.queryByText('再试一次')).toBeNull();}
});

it('retries a superseded shared directory request without clearing a valid list',async()=>{
 jest.useFakeTimers();const page=await render(<FamilyAlbumLibrary/>);await waitFor(()=>expect(page.getByText('Our days')).toBeTruthy());
 mockDirectory.mockRejectedValueOnce({code:'STALE_FAMILY_REQUEST'});await act(async()=>{jest.advanceTimersByTime(3000);});expect(page.getByText('Our days')).toBeTruthy();expect(page.queryByText('再试一次')).toBeNull();
 await act(async()=>{jest.advanceTimersByTime(3000);});expect(page.getByText('Our days')).toBeTruthy();expect(page.queryByTestId('family-album-library-diagnostic')).toBeNull();
});
