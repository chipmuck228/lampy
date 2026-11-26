import {act,cleanup,fireEvent,render,waitFor} from '@testing-library/react-native';
import {AppState} from 'react-native';
import {AlbumExportUnlock} from './album-export-unlock';
let mockFocusStart:(()=>unknown)|undefined,mockFocusStop:(()=>void)|undefined;
jest.mock('expo-router',()=>({useFocusEffect:(fn:()=>unknown)=>jest.requireActual('react').useEffect(()=>{mockFocusStart=fn;const stop=fn();mockFocusStop=typeof stop==='function'?stop as ()=>void:undefined;return stop;},[fn])}));
let mockEntitlementListener:(()=>void)|undefined;
const mockStatus=jest.fn(),mockPurchase=jest.fn(),mockRestore=jest.fn();
jest.mock('../infrastructure/album-export-purchases',()=>({albumExportAccess:{status:()=>mockStatus(),purchase:()=>mockPurchase(),restore:()=>mockRestore()},observeExportEntitlements:(listener:()=>void)=>{mockEntitlementListener=listener;return()=>{mockEntitlementListener=undefined;};}}));
beforeEach(()=>{jest.resetAllMocks();Object.defineProperty(AppState,'currentState',{configurable:true,value:'active'});jest.spyOn(AppState,'addEventListener').mockReturnValue({remove:jest.fn()});process.env.EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID='app.lampy.export';mockStatus.mockResolvedValue({owned:false,product:{id:'app.lampy.export',name:'Export',price:'¥18.00'}});mockPurchase.mockResolvedValue({status:'cancelled'});mockRestore.mockResolvedValue({owned:false,product:null});});
afterEach(async()=>{delete process.env.EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID;await cleanup();});
it('shows the actual matching StoreKit price and never purchases on entry',async()=>{
 const page=await render(<AlbumExportUnlock/>);await waitFor(()=>expect(page.getByText('解锁导出 · ¥18.00')).toBeTruthy());expect(mockPurchase).not.toHaveBeenCalled();
 await fireEvent.press(page.getByText('解锁导出 · ¥18.00'));await waitFor(()=>expect(page.getByText('已取消购买。')).toBeTruthy());expect(mockPurchase).toHaveBeenCalledTimes(1);
});
it('does not show a fake or mismatched product and restores only on an explicit tap',async()=>{
 mockStatus.mockResolvedValue({owned:false,product:null});const page=await render(<AlbumExportUnlock/>);await waitFor(()=>expect(page.getByText('商品暂时不可用，请稍后再试。')).toBeTruthy());expect(mockRestore).not.toHaveBeenCalled();expect(page.queryByText(/解锁导出 ·/)).toBeNull();
 await fireEvent.press(page.getByText('恢复购买'));await waitFor(()=>expect(page.getByText('没有找到可恢复的导出购买。')).toBeTruthy());expect(mockPurchase).not.toHaveBeenCalled();
});
it('pending approval does not report a purchase success or start an export',async()=>{
 mockPurchase.mockResolvedValue({status:'pending'});const page=await render(<AlbumExportUnlock/>);await waitFor(()=>expect(page.getByText('解锁导出 · ¥18.00')).toBeTruthy());await fireEvent.press(page.getByText('解锁导出 · ¥18.00'));await waitFor(()=>expect(page.getByText('购买正在等待确认，确认后可继续导出。')).toBeTruthy());expect(page.queryByText('导出权益已解锁，请点生成PDF继续。')).toBeNull();
});
it('does not surface a late result after leaving the page',async()=>{
 let finish!:(value:unknown)=>void;mockStatus.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const page=await render(<AlbumExportUnlock/>);await waitFor(()=>expect(finish).toBeDefined());await page.unmount();await act(async()=>{finish({owned:true,product:null});});expect(mockPurchase).not.toHaveBeenCalled();
});

it('does not show retry or a missing-product warning to a verified owner',async()=>{
 mockStatus.mockResolvedValue({owned:true,product:null});const page=await render(<AlbumExportUnlock/>);
 await waitFor(()=>expect(page.getByText('已解锁最长30分钟录音和EPUB保存与分享，无需重复购买。')).toBeTruthy());
 expect(page.queryByText('商品暂时不可用，请稍后再试。')).toBeNull();expect(page.queryByText('再试一次')).toBeNull();
});
it('a status error is not described as an unavailable product',async()=>{
 mockStatus.mockRejectedValueOnce({code:'NETWORK'});const page=await render(<AlbumExportUnlock/>);
 await waitFor(()=>expect(page.getByText('暂时无法核对导出权益，请稍后再试。')).toBeTruthy());
 expect(page.queryByText('商品暂时不可用，请稍后再试。')).toBeNull();expect(page.getByText('再试一次')).toBeTruthy();
});
it('native entitlement events during purchase cannot replace the explicit successful result',async()=>{
 mockPurchase.mockImplementation(async()=>{mockEntitlementListener?.();mockStatus.mockResolvedValue({owned:true,product:null});return {status:'purchased'};});
 const page=await render(<AlbumExportUnlock/>);await waitFor(()=>expect(page.getByText('解锁导出 · ¥18.00')).toBeTruthy());
 await fireEvent.press(page.getByText('解锁导出 · ¥18.00'));await waitFor(()=>expect(page.getByText('已解锁，可以导出电子册了。')).toBeTruthy());
 expect(page.queryByText('再试一次')).toBeNull();expect(page.queryByText(/解锁导出 ·/)).toBeNull();
});
it('cancelled purchases are not failures and do not offer a retry',async()=>{
 const page=await render(<AlbumExportUnlock/>);await waitFor(()=>expect(page.getByText('解锁导出 · ¥18.00')).toBeTruthy());
 await fireEvent.press(page.getByText('解锁导出 · ¥18.00'));await waitFor(()=>expect(page.getByText('已取消购买。')).toBeTruthy());expect(page.queryByText('再试一次')).toBeNull();
});
it('a purchase awaiting server verification never shows success or another price button',async()=>{
 mockPurchase.mockRejectedValue({code:'PURCHASE_VERIFICATION_UNAVAILABLE'});
 const page=await render(<AlbumExportUnlock/>);await waitFor(()=>expect(page.getByText('解锁导出 · ¥18.00')).toBeTruthy());
 await fireEvent.press(page.getByText('解锁导出 · ¥18.00'));await waitFor(()=>expect(page.getByText('购买结果正在核对，请勿重复付款。请稍后检查状态或恢复购买。')).toBeTruthy());
 expect(page.queryByText('已解锁，可以导出电子册了。')).toBeNull();expect(page.queryByText(/解锁导出 ·/)).toBeNull();expect(page.getByText('恢复购买')).toBeTruthy();
});
it('a failed refresh removes old access rather than retaining another account or revoked access',async()=>{
 mockStatus.mockResolvedValueOnce({owned:true,product:null});const page=await render(<AlbumExportUnlock/>);
 await waitFor(()=>expect(page.getByText('已解锁最长30分钟录音和EPUB保存与分享，无需重复购买。')).toBeTruthy());
 mockStatus.mockRejectedValueOnce({code:'UNAUTHENTICATED'});await act(async()=>{mockEntitlementListener?.();});
 await waitFor(()=>expect(page.getByText('请先到家庭页面登录Lampy，再解锁或恢复购买。')).toBeTruthy());
 expect(page.queryByText('已解锁最长30分钟录音和EPUB保存与分享，无需重复购买。')).toBeNull();
});
it('does not use a different product price or leave a mismatched product without recovery',async()=>{
 mockStatus.mockResolvedValue({owned:false,product:{id:'other',name:'Other',price:'¥88'}});
 const page=await render(<AlbumExportUnlock/>);await waitFor(()=>expect(page.getByText('商品暂时不可用，请稍后再试。')).toBeTruthy());
 expect(page.queryByText(/解锁导出 ·/)).toBeNull();expect(page.getByText('再试一次')).toBeTruthy();
});
it('pending approval hides the pay button instead of suggesting another payment',async()=>{
 mockPurchase.mockResolvedValue({status:'pending'});const page=await render(<AlbumExportUnlock/>);await waitFor(()=>expect(page.getByText('解锁导出 · ¥18.00')).toBeTruthy());
 await fireEvent.press(page.getByText('解锁导出 · ¥18.00'));await waitFor(()=>expect(page.getByText('购买正在等待确认，确认后可继续导出。')).toBeTruthy());
 expect(page.queryByText(/解锁导出 ·/)).toBeNull();expect(page.queryByText('再试一次')).toBeNull();
});

it('refreshes on return and rejects a status result belonging to the earlier focus',async()=>{
 let finish!:(value:unknown)=>void;mockStatus.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const page=await render(<AlbumExportUnlock/>);await waitFor(()=>expect(finish).toBeDefined());
 mockStatus.mockResolvedValue({owned:false,product:null});await act(async()=>{mockFocusStop?.();mockFocusStart?.();});
 await waitFor(()=>expect(page.getByText('商品暂时不可用，请稍后再试。')).toBeTruthy());
 await act(async()=>{finish({owned:true,product:null});});
 expect(page.queryByText('已解锁最长30分钟录音和EPUB保存与分享，无需重复购买。')).toBeNull();
});
