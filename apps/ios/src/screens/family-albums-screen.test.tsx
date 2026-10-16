import {FAMILY_ALBUM_LEASE_MS,FAMILY_ALBUM_RENEW_MS} from '../application/family-album';
import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
import {AppState,type AppStateStatus} from 'react-native';
import FamilyAlbumsScreen from './family-albums-screen';
const mockReplace=jest.fn(),mockCreate=jest.fn(),mockSources=jest.fn(),mockMutate=jest.fn();
const mockDirectory=jest.fn(),mockAccess=jest.fn(),mockList=jest.fn(),mockRead=jest.fn(),mockValidate=jest.fn(),mockPause=jest.fn();
const mockLock={snapshot:{locked:false}};let mockOpen=true;
let mockParams:Record<string,string>={};
let mockAlbumFocusCleanup:(()=>void)|undefined;
const mockListeners:((s:AppStateStatus)=>void)[]=[];
jest.mock('expo-router',()=>{const {useEffect}=jest.requireActual('react');return {useLocalSearchParams:()=>mockParams,useRouter:()=>({back:jest.fn(),push:jest.fn(),replace:mockReplace}),useFocusEffect:(fn:()=>void|(()=>void))=>useEffect(()=>{const cleanup=fn();mockAlbumFocusCleanup=typeof cleanup==='function'?cleanup:undefined;return cleanup;},[fn])};});
jest.mock('../application/container',()=>({getFamilyUseCases:async()=>({getFamilies:mockDirectory,albums:{sources:mockSources,mutate:mockMutate,create:mockCreate,access:mockAccess,list:mockList,read:mockRead,validate:mockValidate}})}));
jest.mock('../application/foreground-audio',()=>({pauseForegroundAudio:()=>mockPause()}));
jest.mock('../infrastructure/family-config',()=>({isFamilyProductEntryOpen:()=>mockOpen}));
jest.mock('./device-lock-context',()=>({useDeviceLock:()=>mockLock}));
jest.mock('./settings-chrome',()=>{const {View}=jest.requireActual('react-native');return {SettingsPage:({children}:{children:React.ReactNode})=><View>{children}</View>};});
const permission={familyId:'f',userId:'a',membershipId:'m',role:'member',authority:'current',rulesAcknowledged:true,rulesVersion:1,canManage:false,canExport:false};
const book={albumId:'book',familyId:'f',name:'Family book',opening:null,revision:1,access:permission,validation:'v',items:[{shareId:'s',status:'active',share:{authorNickname:'Author',snapshot:{note:'Private original',media:[]}}},{shareId:'old',status:'withdrawn'}]};
beforeEach(()=>{
 jest.clearAllMocks();mockParams={};mockOpen=true;mockLock.snapshot.locked=false;mockListeners.length=0;process.env.EXPO_PUBLIC_FAMILY_ALBUM_EVAL='1';
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
 mockAccess.mockResolvedValue(permission);const reading=await openBook();expect(reading.getByText('这条分享已不可用。')).toBeTruthy();expect(reading.queryByText('移出这一册')).toBeNull();expect(reading.queryByText('新建一册')).toBeNull();expect(reading.queryByText('编辑册子')).toBeNull();expect(reading.queryByText('生成 PDF')).toBeNull();
});
it('clears on background and prevents a late read from restoring private content',async()=>{
 let finish!:(value:unknown)=>void;mockRead.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const page=await render(<FamilyAlbumsScreen/>);await waitFor(()=>expect(page.getByText('Family')).toBeTruthy());await fireEvent.press(page.getByText('Family'));await waitFor(()=>expect(page.getByText('Family book · 2')).toBeTruthy());await fireEvent.press(page.getByText('Family book · 2'));await waitFor(()=>expect(mockRead).toHaveBeenCalled());
 await act(async()=>{AppState.currentState='background';mockListeners.slice().forEach(fn=>fn('background'));finish(book);});expect(page.queryByText('Private original')).toBeNull();expect(page.queryByText('Family')).toBeNull();expect(mockPause).toHaveBeenCalled();
});
it('expires locally while the authority request hangs',async()=>{
 jest.useFakeTimers();const page=await openBook();mockValidate.mockImplementation(()=>new Promise(()=>{}));mockDirectory.mockImplementation(()=>new Promise(()=>{}));
 await act(async()=>{jest.advanceTimersByTime(FAMILY_ALBUM_LEASE_MS+1000);});expect(page.queryByText('Private original')).toBeNull();expect(page.getByText('正在重新核对家庭内容，请稍候。')).toBeTruthy();
});

it('opens a routed book immediately without a family or album picker',async()=>{
 mockParams={familyId:'f',albumId:'book',mode:'read'};const page=await render(<FamilyAlbumsScreen/>);await waitFor(()=>expect(page.getByText('Private original')).toBeTruthy());expect(page.queryByText('Family book · 2')).toBeNull();expect(page.queryByText('选择这册所属的家庭')).toBeNull();
});
it('new flow skips family selection for a single eligible creator and opens the created book',async()=>{
 mockParams={mode:'new'};mockDirectory.mockResolvedValue({userId:'a',families:[{familyId:'f',name:'Family',role:'creator'}]});mockAccess.mockResolvedValue({...permission,role:'creator',canManage:true});mockCreate.mockResolvedValue(book);
 const page=await render(<FamilyAlbumsScreen/>);await waitFor(()=>expect(page.getByLabelText('册名')).toBeTruthy());expect(page.queryByText('Family book · 2')).toBeNull();
 await fireEvent.changeText(page.getByLabelText('册名'),'Our days');await fireEvent.press(page.getByText('创建这一册'));await waitFor(()=>expect(mockReplace).toHaveBeenCalledWith({pathname:'/family-albums',params:{familyId:'f',albumId:'book',mode:'read'}}));expect(mockCreate).toHaveBeenCalledWith('f',expect.objectContaining({name:'Our days',authority:'current'}));
});
it('collect entry stays within its routed family and offers existing books',async()=>{
 mockParams={familyId:'f',mode:'collect'};const page=await render(<FamilyAlbumsScreen/>);await waitFor(()=>expect(page.getByText('Family book · 2')).toBeTruthy());expect(page.queryByText('选择这册所属的家庭')).toBeNull();expect(mockAccess).toHaveBeenCalledWith('f');
});

it('collects selected shares into an existing routed-family album without creating another book',async()=>{
 mockParams={familyId:'f',mode:'collect'};const creator={...permission,role:'creator',canManage:true};const currentBook={...book,access:creator};mockAccess.mockResolvedValue(creator);mockRead.mockResolvedValue(currentBook);mockSources.mockResolvedValue({access:creator,shares:[{shareId:'chosen',authorNickname:'Author',snapshot:{note:'Shared choice',media:[]}}]});mockMutate.mockResolvedValue(currentBook);
 const page=await render(<FamilyAlbumsScreen/>);await waitFor(()=>expect(page.getByText('Family book · 2')).toBeTruthy());await fireEvent.press(page.getByText('Family book · 2'));await waitFor(()=>expect(page.getByText('Author · Shared choice')).toBeTruthy());await fireEvent.press(page.getByText('Author · Shared choice'));await fireEvent.press(page.getByText('收入选中的分享'));
 await waitFor(()=>expect(mockMutate).toHaveBeenCalledWith('f',currentBook,{kind:'collect',shareIds:['chosen']}));expect(mockCreate).not.toHaveBeenCalled();
});
it('keeps editing usable across slow renewals without redundant directory requests or overlapping checks',async()=>{
 jest.useFakeTimers();mockParams={familyId:'f',albumId:'book',mode:'read'};
 const creator={...permission,role:'creator',canManage:true};mockAccess.mockResolvedValue(creator);mockRead.mockResolvedValue({...book,access:creator});
 mockValidate.mockImplementation(()=>new Promise(resolve=>setTimeout(()=>resolve({valid:true}),1000)));
 const page=await render(<FamilyAlbumsScreen/>);await waitFor(()=>expect(page.getByText('编辑册子')).toBeTruthy());await fireEvent.press(page.getByText('编辑册子'));await fireEvent.changeText(page.getByLabelText('册名'),'Unsaved draft');
 const directoryCalls=mockDirectory.mock.calls.length;
 for(let i=0;i<24;i++)await act(async()=>{jest.advanceTimersByTime(FAMILY_ALBUM_RENEW_MS);});
 expect(page.getByLabelText('册名').props.value).toBe('Unsaved draft');expect(page.queryByText('家庭内容或资格已变化，请重新核对。')).toBeNull();expect(mockDirectory).toHaveBeenCalledTimes(directoryCalls);expect(mockValidate.mock.calls.length).toBeLessThanOrEqual(14);
});
it('retry reloads a routed book after a failed validation',async()=>{
 jest.useFakeTimers();mockParams={familyId:'f',albumId:'book',mode:'read'};const page=await render(<FamilyAlbumsScreen/>);await waitFor(()=>expect(page.getByText('Private original')).toBeTruthy());
 mockValidate.mockRejectedValueOnce(new Error('offline'));await act(async()=>{jest.advanceTimersByTime(FAMILY_ALBUM_RENEW_MS);});expect(page.queryByText('Private original')).toBeNull();
 mockValidate.mockResolvedValue({valid:true});await fireEvent.press(page.getByText('再试一次'));await waitFor(()=>expect(page.getByText('Private original')).toBeTruthy());expect(page.queryByText('家庭内容或资格已变化，请重新核对。')).toBeNull();
});

it('distinguishes a server access rejection from local expiry without exposing private errors',async()=>{
 jest.useFakeTimers();mockParams={familyId:'f',albumId:'book',mode:'read'};const page=await render(<FamilyAlbumsScreen/>);await waitFor(()=>expect(page.getByText('Private original')).toBeTruthy());
 mockValidate.mockRejectedValueOnce({code:'NOT_IN_FAMILY',message:'secret body'});await act(async()=>{jest.advanceTimersByTime(FAMILY_ALBUM_RENEW_MS);});
 expect(page.getByTestId('family-album-diagnostic').props.children).toMatch(/^开发诊断：VALIDATE\/NOT_IN_FAMILY\/\d+ms$/);expect(page.queryByText(/secret body/)).toBeNull();
});
it('hides an expired editor while a check hangs and restores the draft only after a fresh check',async()=>{
 jest.useFakeTimers();mockParams={familyId:'f',albumId:'book',mode:'read'};const creator={...permission,role:'creator',canManage:true};mockAccess.mockResolvedValue(creator);mockRead.mockResolvedValue({...book,access:creator});
 const page=await render(<FamilyAlbumsScreen/>);await waitFor(()=>expect(page.getByText('编辑册子')).toBeTruthy());await fireEvent.press(page.getByText('编辑册子'));await fireEvent.changeText(page.getByLabelText('册名'),'Kept draft');
 let finish!:(value:unknown)=>void;mockValidate.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));await act(async()=>{jest.advanceTimersByTime(FAMILY_ALBUM_RENEW_MS);});await act(async()=>{jest.advanceTimersByTime(FAMILY_ALBUM_LEASE_MS+500);});
 expect(page.queryByLabelText('册名')).toBeNull();expect(page.getByText('正在重新核对家庭内容，请稍候。')).toBeTruthy();expect(page.queryByText('家庭内容或资格已变化，请重新核对。')).toBeNull();
 await act(async()=>{finish({valid:true});});expect(page.queryByLabelText('册名')).toBeNull();
 await act(async()=>{jest.advanceTimersByTime(FAMILY_ALBUM_RENEW_MS);});await act(async()=>{jest.advanceTimersByTime(250);});expect(page.getByLabelText('册名').props.value).toBe('Kept draft');expect(page.queryByTestId('family-album-checking')).toBeNull();
});
it('never restores a hidden draft if the fresh server check reports withdrawal',async()=>{
 jest.useFakeTimers();mockParams={familyId:'f',albumId:'book',mode:'read'};const page=await render(<FamilyAlbumsScreen/>);await waitFor(()=>expect(page.getByText('Private original')).toBeTruthy());
 let finish!:(value:unknown)=>void;mockValidate.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));await act(async()=>{jest.advanceTimersByTime(FAMILY_ALBUM_RENEW_MS);});await act(async()=>{jest.advanceTimersByTime(FAMILY_ALBUM_LEASE_MS+500);});expect(page.queryByText('Private original')).toBeNull();
 mockRead.mockRejectedValueOnce({code:'NOT_IN_FAMILY'});mockValidate.mockRejectedValueOnce({code:'FAMILY_ALBUM_CHANGED'});await act(async()=>{finish({valid:true});});await act(async()=>{jest.advanceTimersByTime(FAMILY_ALBUM_RENEW_MS);});expect(page.queryByText('Private original')).toBeNull();expect(page.getByText('家庭内容或资格已变化，请重新核对。')).toBeTruthy();
});
it('keeps the editor visible for a minute of four-second renewals',async()=>{
 jest.useFakeTimers();mockParams={familyId:'f',albumId:'book',mode:'read'};const creator={...permission,role:'creator',canManage:true};mockAccess.mockResolvedValue(creator);mockRead.mockResolvedValue({...book,access:creator});mockValidate.mockImplementation(()=>new Promise(resolve=>setTimeout(()=>resolve({valid:true}),4000)));
 const page=await render(<FamilyAlbumsScreen/>);await waitFor(()=>expect(page.getByText('编辑册子')).toBeTruthy());await fireEvent.press(page.getByText('编辑册子'));await fireEvent.changeText(page.getByLabelText('册名'),'Stable draft');
 for(let i=0;i<60;i++){await act(async()=>{jest.advanceTimersByTime(1000);});expect(page.queryByTestId('family-album-checking')).toBeNull();expect(page.getByLabelText('册名').props.value).toBe('Stable draft');}
});
it('uses organize/done with bounded up/down/remove controls and preserves organizing after a move',async()=>{
 mockParams={familyId:'f',albumId:'book',mode:'read'};const creator={...permission,role:'creator',canManage:true};const currentBook={...book,access:creator};mockAccess.mockResolvedValue(creator);mockRead.mockResolvedValue(currentBook);mockMutate.mockResolvedValue(currentBook);
 const page=await render(<FamilyAlbumsScreen/>);await waitFor(()=>expect(page.getByText('整理')).toBeTruthy());expect(page.queryByTestId('family-album-move-down-s')).toBeNull();await fireEvent.press(page.getByText('整理'));
 expect(page.getByTestId('family-album-move-up-s').props.accessibilityState.disabled).toBe(true);expect(page.getByTestId('family-album-move-down-old').props.accessibilityState.disabled).toBe(true);
 mockRead.mockResolvedValue({...currentBook,revision:2,items:[currentBook.items[1],currentBook.items[0]]});await fireEvent.press(page.getByTestId('family-album-move-down-s'));await waitFor(()=>expect(mockMutate).toHaveBeenCalledWith('f',currentBook,{kind:'reorder',shareIds:['old','s']}));await waitFor(()=>expect(page.getByTestId('family-album-move-down-s').props.accessibilityState.disabled).toBe(true));
 expect(page.getByText('完成')).toBeTruthy();await fireEvent.press(page.getByText('完成'));expect(page.queryByTestId('family-album-move-up-s')).toBeNull();expect(page.getByText('整理')).toBeTruthy();
});
it('saves individual fields without closing the editor or discarding the other field draft',async()=>{
 mockParams={familyId:'f',albumId:'book',mode:'read'};const creator={...permission,role:'creator',canManage:true};const currentBook={...book,access:creator};mockAccess.mockResolvedValue(creator);mockRead.mockResolvedValue(currentBook);
 mockMutate.mockImplementation(async(_family,view,change)=>{const next={...view,name:change.name,opening:change.opening,revision:view.revision+1};mockRead.mockResolvedValue(next);return next;});
 const page=await render(<FamilyAlbumsScreen/>);await waitFor(()=>expect(page.getByText('编辑册子')).toBeTruthy());await fireEvent.press(page.getByText('编辑册子'));await fireEvent.changeText(page.getByLabelText('册名'),'Saved name');await fireEvent.changeText(page.getByLabelText('开篇'),'Opening draft');await fireEvent.press(page.getByText('保存册名'));
 await waitFor(()=>expect(page.getByLabelText('册名').props.editable).toBe(true));expect(page.getByLabelText('开篇').props.value).toBe('Opening draft');expect(page.getByText('取消')).toBeTruthy();await fireEvent.press(page.getByText('保存开篇'));await waitFor(()=>expect(mockMutate).toHaveBeenLastCalledWith('f',expect.objectContaining({revision:2,name:'Saved name'}),{kind:'rename',name:'Saved name',opening:'Opening draft'}));
});

it('stops renewal timers on blur and never pauses audio on the next screen from late work',async()=>{
 jest.useFakeTimers();mockParams={familyId:'f',albumId:'book',mode:'read'};const page=await render(<FamilyAlbumsScreen/>);await waitFor(()=>expect(page.getByText('Private original')).toBeTruthy());
 let finish!:(value:unknown)=>void;mockValidate.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));await act(async()=>{jest.advanceTimersByTime(FAMILY_ALBUM_RENEW_MS);});
 await act(async()=>{mockAlbumFocusCleanup?.();});const calls=mockValidate.mock.calls.length;mockPause.mockClear();await act(async()=>{jest.advanceTimersByTime(FAMILY_ALBUM_LEASE_MS+1000);finish({valid:true});});
 expect(mockPause).not.toHaveBeenCalled();expect(mockValidate).toHaveBeenCalledTimes(calls);expect(page.queryByText('Private original')).toBeNull();
});

it('uses compact summaries for organizing and expands the same qualified book for reading',async()=>{
 mockParams={familyId:'f',albumId:'book',mode:'read'};
 const creator={...permission,role:'creator',canManage:true};mockAccess.mockResolvedValue(creator);mockRead.mockResolvedValue({...book,access:creator,opening:'An opening'});
 const page=await render(<FamilyAlbumsScreen/>);await waitFor(()=>expect(page.getByText('Private original')).toBeTruthy());
 expect(page.getByText('Private original').props.numberOfLines).toBe(3);expect(page.getByText('编辑册子')).toBeTruthy();expect(page.queryByText('An opening')).toBeNull();
 await fireEvent.press(page.getByText('看看这一册'));
 expect(page.getByText('Private original').props.numberOfLines).toBeUndefined();expect(page.getByText('An opening')).toBeTruthy();expect(page.queryByText('整理')).toBeNull();expect(page.queryByText('编辑册子')).toBeNull();
 await fireEvent.press(page.getByText('返回整理'));expect(page.getByText('Private original').props.numberOfLines).toBe(3);expect(page.getByText('整理')).toBeTruthy();
});

it('refreshes changed content automatically, preserving unsaved editing fields',async()=>{
 jest.useFakeTimers();mockParams={familyId:'f',albumId:'book',mode:'read'};const creator={...permission,role:'creator',canManage:true};mockAccess.mockResolvedValue(creator);mockRead.mockResolvedValue({...book,access:creator});
 const page=await render(<FamilyAlbumsScreen/>);await waitFor(()=>expect(page.getByText('编辑册子')).toBeTruthy());await fireEvent.press(page.getByText('编辑册子'));await fireEvent.changeText(page.getByLabelText('册名'),'Unsaved name');
 mockRead.mockResolvedValue({...book,access:creator,validation:'v2',items:[{shareId:'s',status:'withdrawn'}]});mockValidate.mockRejectedValueOnce({code:'FAMILY_ALBUM_CHANGED'});
 await act(async()=>{jest.advanceTimersByTime(FAMILY_ALBUM_RENEW_MS);});
 expect(page.queryByText('Private original')).toBeNull();expect(page.getByLabelText('册名').props.value).toBe('Unsaved name');expect(page.queryByText('再试一次')).toBeNull();expect(mockRead.mock.calls.length).toBeGreaterThanOrEqual(2);
});
it('keeps old content hidden and retries a transient failure during automatic refresh',async()=>{
 jest.useFakeTimers();mockParams={familyId:'f',albumId:'book',mode:'read'};const page=await render(<FamilyAlbumsScreen/>);await waitFor(()=>expect(page.getByText('Private original')).toBeTruthy());
 mockValidate.mockRejectedValueOnce({code:'FAMILY_ALBUM_CHANGED'});mockRead.mockRejectedValueOnce({code:'SERVER_UNREACHABLE'});
 await act(async()=>{jest.advanceTimersByTime(FAMILY_ALBUM_RENEW_MS);});expect(page.queryByText('Private original')).toBeNull();expect(page.getByTestId('family-album-checking')).toBeTruthy();
 mockRead.mockResolvedValue({...book,validation:'v2',items:[{shareId:'s',status:'withdrawn'}]});await act(async()=>{jest.advanceTimersByTime(FAMILY_ALBUM_RENEW_MS);});expect(page.queryByText('Private original')).toBeNull();expect(page.queryByTestId('family-album-checking')).toBeNull();expect(page.queryByText('再试一次')).toBeNull();
});

it('does not publish a late automatic refresh after leaving the album',async()=>{
 jest.useFakeTimers();mockParams={familyId:'f',albumId:'book',mode:'read'};const page=await render(<FamilyAlbumsScreen/>);await waitFor(()=>expect(page.getByText('Private original')).toBeTruthy());
 let finish!:(value:unknown)=>void;mockRead.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));mockValidate.mockRejectedValueOnce({code:'FAMILY_ALBUM_CHANGED'});
 await act(async()=>{jest.advanceTimersByTime(FAMILY_ALBUM_RENEW_MS);});expect(page.queryByText('Private original')).toBeNull();
 await act(async()=>{mockAlbumFocusCleanup?.();});const pauses=mockPause.mock.calls.length;
 await act(async()=>{finish({...book,validation:'v2'});});expect(page.queryByText('Private original')).toBeNull();expect(mockPause).toHaveBeenCalledTimes(pauses);
});
