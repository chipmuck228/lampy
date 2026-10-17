import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import FamilyAlbumPaperScreen from './family-album-paper-screen';
const mockRead=jest.fn(),mockValidate=jest.fn(),mockLayout=jest.fn(),mockPause=jest.fn(async()=>{}),mockPush=jest.fn();
const listeners:((s:AppStateStatus)=>void)[]=[];
const mockBook={albumId:'book',familyId:'f',name:'Family',opening:null,createdAt:'2026-10-01',updatedAt:'2026-10-17',revision:1,validation:'v',cover:null,
 access:{userId:'a',canManage:false,rulesAcknowledged:true},items:[{shareId:'s',status:'active',share:{shareId:'s',familyId:'f',sourceRevision:1,authorNickname:'Dad',snapshot:{note:'Family note',emotion:'',occurredAtPrecision:'unknown',media:[]}}}]};
jest.mock('expo-router',()=>{const React=jest.requireActual('react');return {useLocalSearchParams:()=>({familyId:'f',albumId:'book'}),useRouter:()=>({back:jest.fn(),push:mockPush}),useFocusEffect:(fn:()=>void|(()=>void))=>React.useEffect(fn,[fn])};});
jest.mock('./device-lock-context',()=>({useDeviceLock:()=>null}));
jest.mock('./use-recent-clip-playback',()=>({useRecentClipPlayback:()=>({pause:mockPause,card:()=>({status:'idle'}),play:jest.fn()})}));
jest.mock('../application/container',()=>({getUseCases:jest.fn(()=>{throw Error('Personal store must not be read.');})}));
jest.mock('../infrastructure/family-album-paper',()=>({familyPaperReader:async()=>({albums:{read:mockRead,validate:mockValidate},readMedia:jest.fn(),imageSize:jest.fn()})}));
jest.mock('../infrastructure/album-print-files',()=>({layoutAlbumPrint:(...args:unknown[])=>mockLayout(...args)}));
jest.mock('../../modules/lampy-album-layout',()=>({requireAlbumNativePageView:()=>null,diagnoseAlbumFonts:()=>({serif:{fontName:'serif'},ui:{fontName:'ui'}})}));
function wrap(){return <SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:844},insets:{top:47,left:0,right:0,bottom:34}}}><FamilyAlbumPaperScreen/></SafeAreaProvider>;}
beforeEach(()=>{
 jest.clearAllMocks();process.env.EXPO_PUBLIC_FAMILY_ENTRY_OPEN='1';process.env.EXPO_PUBLIC_FAMILY_ALBUM_EVAL='1';delete process.env.EXPO_PUBLIC_FAMILY_ALBUM_EXPORT_ENABLED;
 Object.defineProperty(AppState,'currentState',{value:'active',writable:true,configurable:true});listeners.length=0;
 jest.spyOn(AppState,'addEventListener').mockImplementation((_event,fn)=>{listeners.push(fn);return {remove:()=>{}};});
 mockRead.mockResolvedValue(mockBook);mockValidate.mockResolvedValue({valid:true});mockLayout.mockImplementation(async input=>({albumId:input.album.id,sourceFingerprint:{entryOrder:[]},pages:[{blocks:[]},{blocks:[]}]}));
});
afterEach(()=>{jest.restoreAllMocks();jest.useRealTimers();delete process.env.EXPO_PUBLIC_FAMILY_ENTRY_OPEN;delete process.env.EXPO_PUBLIC_FAMILY_ALBUM_EVAL;});
it('uses the personal paper controls and two-times zoom for ordinary members',async()=>{
 const page=await render(wrap());await waitFor(()=>expect(page.getByTestId('life-album-preview-page')).toBeTruthy());
 expect(page.queryByText('手作')).toBeNull();
 const before=page.getByTestId('life-album-preview-page').props.style.width;
 await fireEvent.press(page.getByTestId('life-album-preview-next'));
 expect(page.getByTestId('life-album-preview-prev')).toBeEnabled();
 await fireEvent.press(page.getByTestId('life-album-preview-zoom'));
 expect(page.getByTestId('life-album-preview-page').props.style.width).toBe(before*2);
 expect(page.queryByTestId('life-album-preview-next')).toBeNull();
 await fireEvent.press(page.getByTestId('life-album-preview-zoom-restore'));
 expect(page.getByTestId('life-album-preview-page').props.style.width).toBe(before);
 expect(page.queryByText('导出这一册')).toBeNull();expect(mockPush).not.toHaveBeenCalled();
});
it('hides a paper layout and pauses audio after membership denial',async()=>{
 jest.useFakeTimers();const page=await render(wrap());await waitFor(()=>expect(page.getByTestId('life-album-preview-page')).toBeTruthy());
 mockValidate.mockRejectedValue({code:'NOT_IN_FAMILY'});
 await act(async()=>{jest.advanceTimersByTime(3000);});
 expect(page.queryByTestId('life-album-preview-page')).toBeNull();expect(page.getByText('再试一次')).toBeTruthy();expect(mockPause).toHaveBeenCalled();
});
it('removes the page immediately on background and does not resume audio',async()=>{
 const page=await render(wrap());await waitFor(()=>expect(page.getByTestId('life-album-preview-page')).toBeTruthy());
 await act(async()=>{AppState.currentState='background';listeners.forEach(fn=>fn('background'));});
 expect(page.queryByTestId('life-album-preview-page')).toBeNull();expect(mockPause).toHaveBeenCalled();
});
it('expires a hung renewal and ignores its late successful response',async()=>{
 jest.useFakeTimers();const page=await render(wrap());await waitFor(()=>expect(page.getByTestId('life-album-preview-page')).toBeTruthy());
 let finish:(value:unknown)=>void=()=>{};
 mockValidate.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 await act(async()=>{jest.advanceTimersByTime(3000);});
 await act(async()=>{jest.advanceTimersByTime(13_000);});
 expect(page.queryByTestId('life-album-preview-page')).toBeNull();expect(page.getByText('再试一次')).toBeTruthy();
 await act(async()=>{finish({valid:true});});expect(page.queryByTestId('life-album-preview-page')).toBeNull();
});
