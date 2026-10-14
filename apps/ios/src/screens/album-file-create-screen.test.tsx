import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppState } from 'react-native';
import AlbumFileCreateScreen from './album-file-create-screen';
const mockCreate=jest.fn();const mockSave=jest.fn();const mockClose=jest.fn(async(..._args:unknown[])=>undefined);
const mockRouter={back:jest.fn()};
jest.mock('expo-router',()=>({useRouter:()=>mockRouter,useLocalSearchParams:()=>({edition:'print_one'})}));
jest.mock('./device-lock-context',()=>({useDeviceLock:()=>({snapshot:{locked:false}})}));
jest.mock('../../modules/lampy-album-layout',()=>({albumArchiveNative:()=>({saveAlbumArchive:mockSave})}));
jest.mock('../infrastructure/album-file-store',()=>({saveAlbumFileArtifact:(...args:unknown[])=>mockSave(...args),createAlbumFileEdition:(...args:unknown[])=>mockCreate(...args),closeAlbumFileSession:(...args:unknown[])=>mockClose(...args)}));
function wrap(){return <SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:844},insets:{top:0,bottom:0,left:0,right:0}}}><AlbumFileCreateScreen/></SafeAreaProvider>;}
beforeEach(()=>{jest.clearAllMocks();process.env.EXPO_PUBLIC_ALBUM_FILE_EVAL='1';AppState.currentState='active';mockCreate.mockResolvedValue({id:'session',name:'一册',uri:'file:///temp/book.lampy',bytes:100});});
afterEach(async()=>{delete process.env.EXPO_PUBLIC_ALBUM_FILE_EVAL;await cleanup();});
it('generation is not called saved until the system confirms export',async()=>{
 const view=await render(wrap());await fireEvent.press(view.getByText('生成生活册文件'));
 await waitFor(()=>expect(view.getByText('保存成品')).toBeTruthy());expect(mockSave).not.toHaveBeenCalled();
 mockSave.mockResolvedValueOnce(false);await fireEvent.press(view.getByText('保存成品'));
 await waitFor(()=>expect(mockSave).toHaveBeenCalledTimes(1));expect(view.queryByText('成品已保存到你选择的位置。')).toBeNull();
 mockSave.mockResolvedValueOnce(true);await fireEvent.press(view.getByText('保存成品'));
 await waitFor(()=>expect(view.getByText('成品已保存到你选择的位置。')).toBeTruthy());
});
it('leaving during the document picker waits for its completion before clearing the artifact',async()=>{
 const view=await render(wrap());await fireEvent.press(view.getByText('生成生活册文件'));await waitFor(()=>expect(view.getByText('保存成品')).toBeTruthy());
 let finish!:(saved:boolean)=>void;mockSave.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 await fireEvent.press(view.getByText('保存成品'));await waitFor(()=>expect(finish).toBeDefined());await view.unmount();
 expect(mockClose).not.toHaveBeenCalled();await act(async()=>finish(false));await waitFor(()=>expect(mockClose).toHaveBeenCalledWith('session'));
});
it('a cancelled late result is cleared and never displayed',async()=>{
 let finish!:(value:unknown)=>void;mockCreate.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const view=await render(wrap());await fireEvent.press(view.getByText('生成生活册文件'));await waitFor(()=>expect(finish).toBeDefined());
 await fireEvent.press(view.getByText('取消'));await act(async()=>finish({id:'late',name:'Late',uri:'file:///tmp/late.lampy',bytes:10}));
 await waitFor(()=>expect(mockClose).toHaveBeenCalledWith('late'));expect(view.queryByText('保存成品')).toBeNull();
});
