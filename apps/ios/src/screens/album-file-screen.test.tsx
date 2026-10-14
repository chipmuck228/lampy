import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text as MockTextComponent } from 'react-native';
import AlbumFileScreen from './album-file-screen';
const mockOpen=jest.fn();const mockClose=jest.fn(async(..._args:unknown[])=>undefined);let mockCount=0;
const mockRoute={token:'1'};const mockRouter={replace:jest.fn()};
jest.mock('expo-router',()=>({useRouter:()=>mockRouter,useLocalSearchParams:()=>mockRoute}));
jest.mock('./device-lock-context',()=>({useDeviceLock:()=>({snapshot:{locked:false}})}));
jest.mock('../application/album-file-open',()=>({pendingAlbumFile:()=> 'file:///received/book.lampy',forgetAlbumFile:jest.fn()}));
jest.mock('../infrastructure/album-file-store',()=>({newAlbumFileSessionId:()=> `session-${++mockCount}`,openAlbumFile:(...args:unknown[])=>mockOpen(...args),closeAlbumFileSession:(...args:unknown[])=>mockClose(...args)}));
jest.mock('./life-album-reading-screen',()=>({__esModule:true,default:({external}:{external:{input:{album:{name:string}};onClose():void}})=> <MockTextComponent onPress={external.onClose}>{external.input.album.name}</MockTextComponent>}));
function wrap(){return <SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:844},insets:{top:0,bottom:0,left:0,right:0}}}><AlbumFileScreen/></SafeAreaProvider>;}
function result(id:string,name:string){return {id,book:{style:'plain',fonts:{serif:'serif',ui:'ui'}},input:{album:{id,name}}};}
beforeEach(()=>{jest.clearAllMocks();mockCount=0;mockRoute.token='1';});
afterEach(async()=>{await cleanup();});
it('changing file waits for the old load, clears it and cannot display its late title',async()=>{
 let finish!:(value:unknown)=>void;mockOpen.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));mockOpen.mockResolvedValueOnce(result('session-2','New album'));
 const view=await render(wrap());await waitFor(()=>expect(finish).toBeDefined());mockRoute.token='2';await view.rerender(wrap());
 expect(mockOpen).toHaveBeenCalledTimes(1);await act(async()=>finish(result('session-1','Old private title')));
 await waitFor(()=>expect(view.getByText('New album')).toBeTruthy());expect(view.queryByText('Old private title')).toBeNull();expect(mockClose).toHaveBeenCalledWith('session-1');
});
it('explicit close reports cleanup failure and can retry without deleting the external original',async()=>{
 mockOpen.mockResolvedValueOnce(result('session-1','Current album'));mockClose.mockRejectedValueOnce(new Error('FILE_CLEANUP_FAILED'));
 const view=await render(wrap());await waitFor(()=>expect(view.getByText('Current album')).toBeTruthy());await fireEvent.press(view.getByText('Current album'));
 await waitFor(()=>expect(view.getByText('临时文件尚未清理，请再试一次。')).toBeTruthy());expect(mockRouter.replace).not.toHaveBeenCalled();
 await fireEvent.press(view.getAllByText('关闭')[0]);await waitFor(()=>expect(mockRouter.replace).toHaveBeenCalledWith('/'));
 expect(mockClose).toHaveBeenCalledWith('session-1');
});
