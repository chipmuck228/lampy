import {act,cleanup,fireEvent,render,waitFor} from '@testing-library/react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import AlbumEpubPreviewScreen from './album-epub-preview-screen';
const mockCreate=jest.fn(),mockDispose=jest.fn(),mockBack=jest.fn(),mockLock={locked:false};
jest.mock('expo-router',()=>({useRouter:()=>({back:mockBack}),useLocalSearchParams:()=>({id:'book'}),useFocusEffect:(fn:()=>unknown)=>jest.requireActual('react').useEffect(fn,[fn])}));
jest.mock('expo-status-bar',()=>({StatusBar:()=>null}));
jest.mock('./device-lock-context',()=>({useDeviceLock:()=>({snapshot:mockLock})}));
jest.mock('../infrastructure/album-epub-preview',()=>({createAlbumEpubPreview:(...a:unknown[])=>mockCreate(...a)}));
jest.mock('../../modules/lampy-album-layout',()=>({requireAlbumNativePageView:()=>null,requireAlbumEpubView:()=>{const React=jest.requireActual('react'),{View}=jest.requireActual('react-native');return(props:Record<string,unknown>)=>React.createElement(View,{...props,testID:'native-epub-reader'});}}));
const book={name:'Our days',rootUri:'file:///cache/album-epub-preview/preview_test/',pages:[{name:'cover',uri:'file:///cover.xhtml'},{name:'archive',uri:'file:///archive.xhtml'}],dispose:mockDispose};
function wrap(){return <SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:844},insets:{top:0,bottom:0,left:0,right:0}}}><AlbumEpubPreviewScreen/></SafeAreaProvider>;}
beforeEach(()=>{Object.defineProperty(jest.requireActual('react-native').AppState,'currentState',{configurable:true,writable:true,value:'active'});jest.clearAllMocks();mockLock.locked=false;mockDispose.mockResolvedValue(undefined);mockCreate.mockResolvedValue(book);});
afterEach(async()=>{await cleanup();});
it('opens cover and navigates the actual publication pages full-screen',async()=>{
 const v=await render(wrap());await waitFor(()=>expect(v.getByTestId('native-epub-reader')).toBeTruthy());expect(v.getByTestId('native-epub-reader').props.documentUri).toBe(book.pages[0].uri);
 await fireEvent.press(v.getByRole('button',{name:'下一页'}));expect(v.getByTestId('native-epub-reader').props.documentUri).toBe(book.pages[1].uri);
 await fireEvent(v.getByTestId('native-epub-reader'),'onPageTurn',{nativeEvent:{direction:-1}});expect(v.getByTestId('native-epub-reader').props.documentUri).toBe(book.pages[0].uri);
 await fireEvent.press(v.getByRole('button',{name:'关闭预览'}));expect(mockBack).toHaveBeenCalled();
});
it('removes the private reader and disposes cache on lock',async()=>{
 const v=await render(wrap());await waitFor(()=>expect(v.getByTestId('native-epub-reader')).toBeTruthy());mockLock.locked=true;await v.rerender(wrap());await waitFor(()=>expect(v.queryByTestId('native-epub-reader')).toBeNull());expect(mockDispose).toHaveBeenCalled();expect(v.queryByText('Our days')).toBeNull();
});
it('cleans a delayed result after leaving instead of mounting a stale preview',async()=>{
 let finish:((b:typeof book)=>void)|undefined;mockCreate.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));const v=await render(wrap());await waitFor(()=>expect(mockCreate).toHaveBeenCalled());await v.unmount();await act(async()=>finish?.(book));expect(mockDispose).toHaveBeenCalledTimes(1);
});
