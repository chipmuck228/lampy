import {act,cleanup,fireEvent,render,waitFor} from '@testing-library/react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import AlbumPrintScreen from './album-print-screen';
const mockPush=jest.fn(),mockPurchase=jest.fn(),mockStatus=jest.fn(),mockSnapshot=jest.fn(),mockEpub=jest.fn(),mockDelete=jest.fn(),mockPdfShare=jest.fn(),mockPdfList=jest.fn(),mockEpubList=jest.fn(),mockRead=jest.fn();
const mockLock={locked:false};
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush,back:jest.fn()}),useLocalSearchParams:()=>({id:'book'}),useFocusEffect:(fn:()=>unknown)=>jest.requireActual('react').useEffect(fn,[fn])}));
jest.mock('./device-lock-context',()=>({useDeviceLock:()=>({snapshot:mockLock})}));
jest.mock('../application/container',()=>({getUseCases:async()=>({readAlbumForContinuousReading:mockRead})}));
jest.mock('../infrastructure/album-epub-snapshots',()=>({createPersonalEpubSnapshot:(...a:unknown[])=>mockSnapshot(...a),listEpubSnapshots:(...a:unknown[])=>mockEpubList(...a),discardUnfinishedEpubSnapshot:async()=>{}}));
jest.mock('../infrastructure/album-epub-files',()=>({shareAlbumEpub:(...a:unknown[])=>mockEpub(...a)}));
jest.mock('../infrastructure/album-edition-delete',()=>({deleteSavedAlbumEdition:(...a:unknown[])=>mockDelete(...a)}));
jest.mock('../infrastructure/album-print-files',()=>({listSavedAlbumPrints:(...a:unknown[])=>mockPdfList(...a),shareSavedAlbumPrint:(...a:unknown[])=>mockPdfShare(...a),createExpoAlbumPrint:()=>{throw Error('PDF must never be generated');},previewAlbumPrint:()=>{throw Error('PDF must never be previewed');}}));
jest.mock('../infrastructure/album-export-purchases',()=>({albumExportAccess:{status:(...a:unknown[])=>mockStatus(...a),purchase:(...a:unknown[])=>mockPurchase(...a),restore:async()=>({owned:true,product:null})},observeExportEntitlements:()=>()=>{}}));
const input={album:{id:'book',name:'Our days',cover:{kind:'words'},opening:null,entries:[],createdAt:'',updatedAt:''},entries:[{momentId:'m',presence:'ready',revision:1,note:'完整文字',feeling:'',recordedAt:'2026-11-25',occurredAtPrecision:'day',media:[]}]};
const edition={id:'epub_old',name:'Old edition',createdAt:'2026-11-01',style:'plain',design:'imagebook'};
const pdf={id:'print_old',name:'Old PDF',createdAt:'2026-11-01',pdf:{bytes:100000,pageCount:3}};
const status=(owned:boolean)=>({owned,product:{id:'app.lampy.export',name:'Export',price:'¥18.00'}});
function wrap(){return <SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:844},insets:{top:0,bottom:0,left:0,right:0}}}><AlbumPrintScreen/></SafeAreaProvider>;}
beforeEach(()=>{Object.defineProperty(jest.requireActual('react-native').AppState,'currentState',{configurable:true,writable:true,value:'active'});jest.clearAllMocks();mockLock.locked=false;process.env.EXPO_PUBLIC_ALBUM_EXPORT_ENABLED='1';process.env.EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED='1';process.env.EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID='app.lampy.export';mockRead.mockResolvedValue({input});mockStatus.mockResolvedValue(status(false));mockPdfList.mockResolvedValue([]);mockEpubList.mockResolvedValue([]);mockEpub.mockResolvedValue(true);mockSnapshot.mockResolvedValue({id:'epub_new'});mockDelete.mockResolvedValue(undefined);mockPurchase.mockResolvedValue({status:'purchased'});});
afterEach(async()=>{await cleanup();delete process.env.EXPO_PUBLIC_ALBUM_EXPORT_ENABLED;delete process.env.EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED;delete process.env.EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID;});
it('lets unpaid users preview the complete electronic album without purchasing or creating a file',async()=>{
 const v=await render(wrap());await waitFor(()=>expect(v.getByText('Our days')).toBeTruthy());
 await fireEvent.press(v.getByTestId('album-export-preview'));
 expect(mockPush).toHaveBeenCalledWith('/albums/book/preview');expect(mockPurchase).not.toHaveBeenCalled();expect(mockSnapshot).not.toHaveBeenCalled();expect(mockEpub).not.toHaveBeenCalled();
 expect(v.queryByText('生成PDF')).toBeNull();expect(v.queryByText('看看纸页')).toBeNull();expect(v.queryByRole('tab',{name:'PDF'})).toBeNull();
});
it('keeps preview available when export is not configured',async()=>{
 delete process.env.EXPO_PUBLIC_ALBUM_EXPORT_ENABLED;
 const v=await render(wrap());await waitFor(()=>expect(v.getByText('Our days')).toBeTruthy());await fireEvent.press(v.getByTestId('album-export-preview'));
 expect(mockPush).toHaveBeenCalled();expect(mockStatus).not.toHaveBeenCalled();expect(v.queryByTestId('album-export-purchase')).toBeNull();
});
it('purchase is an explicit separate action and never automatically exports',async()=>{
 const v=await render(wrap());await waitFor(()=>expect(v.getByTestId('album-export-purchase')).toBeTruthy());
 mockStatus.mockResolvedValue(status(true));await fireEvent.press(v.getByTestId('album-export-purchase'));
 await waitFor(()=>expect(v.getByTestId('album-export-create-epub')).toBeTruthy());expect(mockPurchase).toHaveBeenCalledTimes(1);expect(mockSnapshot).not.toHaveBeenCalled();expect(mockEpub).not.toHaveBeenCalled();
});
it('owned users save/share EPUB and distinguish the newly created immutable edition',async()=>{
 mockStatus.mockResolvedValue(status(true));mockEpubList.mockResolvedValueOnce([edition]).mockResolvedValue([{...edition,id:'epub_new'},edition]);
 const v=await render(wrap());await waitFor(()=>expect(v.getByTestId('album-export-create-epub')).toBeTruthy());await fireEvent.press(v.getByTestId('album-export-create-epub'));
 await waitFor(()=>expect(v.getByTestId('album-export-just-created')).toBeTruthy());expect(mockSnapshot).toHaveBeenCalledWith('book','imagebook',expect.any(Function),expect.any(Function));expect(mockEpub).toHaveBeenCalledWith('epub_new',expect.any(Function),expect.any(Function));
});
it('unpaid users cannot share historical EPUB through the shelf',async()=>{
 mockEpubList.mockResolvedValue([edition]);const v=await render(wrap());await waitFor(()=>expect(v.getByText('Old edition')).toBeTruthy());await fireEvent.press(v.getByTestId('edition-open-epub_old'));
 await waitFor(()=>expect(v.getByText('请先解锁导出，或恢复已有购买。')).toBeTruthy());expect(mockEpub).not.toHaveBeenCalled();expect(mockSnapshot).not.toHaveBeenCalled();
});
it('retains historical PDFs as shareable files without a PDF creation/preview action',async()=>{
 mockPdfList.mockResolvedValue([pdf]);const v=await render(wrap());await waitFor(()=>expect(v.getByText('Old PDF')).toBeTruthy());await fireEvent.press(v.getByTestId('edition-open-print_old'));
 await waitFor(()=>expect(mockPdfShare).toHaveBeenCalledWith(pdf,expect.any(Function)));expect(v.getByText('历史文件')).toBeTruthy();expect(v.queryByText('生成PDF')).toBeNull();expect(mockSnapshot).not.toHaveBeenCalled();
});
it('clears private content when the device locks',async()=>{
 const v=await render(wrap());await waitFor(()=>expect(v.getByText('Our days')).toBeTruthy());mockLock.locked=true;await v.rerender(wrap());await waitFor(()=>expect(v.queryByText('Our days')).toBeNull());expect(v.queryByTestId('album-export-preview')).toBeNull();
});
it('does not publish stale generation feedback after locking',async()=>{
 mockStatus.mockResolvedValue(status(true));let complete:((v:unknown)=>void)|undefined;mockSnapshot.mockImplementation(()=>new Promise(r=>{complete=r;}));const v=await render(wrap());await waitFor(()=>expect(v.getByTestId('album-export-create-epub')).toBeTruthy());await fireEvent.press(v.getByTestId('album-export-create-epub'));mockLock.locked=true;await v.rerender(wrap());await act(async()=>complete?.({id:'epub_stale'}));expect(v.queryByTestId('album-export-just-created')).toBeNull();
});
