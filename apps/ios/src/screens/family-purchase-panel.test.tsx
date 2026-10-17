import {cleanup,fireEvent,render,waitFor} from '@testing-library/react-native';
import {FamilyPurchasePanel} from './family-purchase-panel';
const mockAccess=jest.fn(),mockUnlock=jest.fn();
jest.mock('../application/container',()=>({getFamilyUseCases:async()=>({familyPurchaseAccess:(...args:unknown[])=>mockAccess(...args),unlockFamilyPurchase:(...args:unknown[])=>mockUnlock(...args)})}));
jest.mock('./album-export-unlock',()=>({AlbumExportUnlock:()=>null}));
beforeEach(()=>{jest.clearAllMocks();mockAccess.mockResolvedValue({familyId:'f',eligible:true,reason:'eligible',canExport:false});});
afterEach(async()=>{await cleanup();});
it('does not poll or verify purchase on mount; eligibility is distinct from a file export entry',async()=>{
 const page=await render(<FamilyPurchasePanel familyId="f"/>);expect(mockAccess).not.toHaveBeenCalled();
 await fireEvent.press(page.getByText('查看家庭导出资格'));
 await waitFor(()=>expect(page.getByText('已解锁本家庭的导出资格；家庭文件导出尚未开放。')).toBeTruthy());
 expect(mockAccess).toHaveBeenCalledTimes(1);expect(mockUnlock).not.toHaveBeenCalled();expect(page.queryByText('生成PDF')).toBeNull();
});
it('only explicit unlock sends a write and does not auto-generate or buy',async()=>{
 mockAccess.mockResolvedValue({familyId:'f',eligible:false,reason:'locked',canExport:false});
 mockUnlock.mockResolvedValue({familyId:'f',eligible:true,reason:'eligible',canExport:false});
 const page=await render(<FamilyPurchasePanel familyId="f"/>);await fireEvent.press(page.getByText('查看家庭导出资格'));
 await waitFor(()=>expect(page.getByText('使用我的购买解锁这个家庭')).toBeTruthy());expect(mockUnlock).not.toHaveBeenCalled();
 await fireEvent.press(page.getByText('使用我的购买解锁这个家庭'));
 await waitFor(()=>expect(page.getByText('已解锁本家庭的导出资格；家庭文件导出尚未开放。')).toBeTruthy());expect(mockUnlock).toHaveBeenCalledTimes(1);
});
it('a member is not offered an unlock action',async()=>{
 mockAccess.mockResolvedValue({familyId:'f',eligible:false,reason:'not-creator',canExport:false});
 const page=await render(<FamilyPurchasePanel familyId="f"/>);await fireEvent.press(page.getByText('查看家庭导出资格'));
 await waitFor(()=>expect(page.getByText('本家庭尚未解锁导出资格；只有当前创建者可以解锁。')).toBeTruthy());
 expect(page.queryByText('使用我的购买解锁这个家庭')).toBeNull();
});
