import {act,cleanup,fireEvent,render,waitFor} from '@testing-library/react-native';
import {AlbumExportUnlock} from './album-export-unlock';
const mockStatus=jest.fn(),mockPurchase=jest.fn(),mockRestore=jest.fn();
jest.mock('../infrastructure/album-export-purchases',()=>({albumExportAccess:{status:()=>mockStatus(),purchase:()=>mockPurchase(),restore:()=>mockRestore()},observeExportEntitlements:()=>()=>{}}));
beforeEach(()=>{jest.resetAllMocks();process.env.EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID='app.lampy.export';mockStatus.mockResolvedValue({owned:false,product:{id:'app.lampy.export',name:'Export',price:'¥18.00'}});mockPurchase.mockResolvedValue({status:'cancelled'});mockRestore.mockResolvedValue({owned:false,product:null});});
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
