import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import FamilyAlbumPrintScreen from './family-album-print-screen';
const mockSave=jest.fn(),mockShare=jest.fn(),mockFiles=jest.fn(),mockValidate=jest.fn(),mockCreate=jest.fn();
const mockView={familyId:'f',albumId:'book',name:'Family book',access:{userId:'a',canManage:true}};
const mockValid=()=>true;
const mockCapture=()=>mockValid;
jest.mock('expo-router',()=>({useLocalSearchParams:()=>({familyId:'f',albumId:'book'}),useRouter:()=>({back:jest.fn()})}));
jest.mock('./use-family-paper',()=>({useFamilyPaper:()=>({view:mockView,error:false,blocked:false,valid:mockValid,capture:mockCapture,retry:jest.fn()})}));
jest.mock('./family-purchase-panel',()=>({FamilyPurchasePanel:()=>null}));
jest.mock('../infrastructure/family-album-paper',()=>({familyPaperReader:async()=>({albums:{validate:mockValidate}}),createExpoFamilyAlbumPrint:(...args:unknown[])=>mockCreate(...args)}));
jest.mock('../infrastructure/album-print-files',()=>({listSavedAlbumPrints:(id:string)=>mockFiles(id),shareSavedAlbumPrint:(...args:unknown[])=>mockShare(...args),summarizePrint:(file:unknown)=>file}));
const keys=['EXPO_PUBLIC_FAMILY_ALBUM_EXPORT_ENABLED','EXPO_PUBLIC_UNIFIED_PURCHASES','EXPO_PUBLIC_ALBUM_EXPORT_ENABLED','EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED'];
let old:(string|undefined)[];
beforeEach(()=>{jest.clearAllMocks();old=keys.map(k=>process.env[k]);keys.forEach(k=>process.env[k]='1');mockView.access.canManage=true;mockFiles.mockResolvedValue([]);mockValidate.mockResolvedValue({valid:true});mockCreate.mockResolvedValue({save:mockSave});});
afterEach(()=>{keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});});
function wrap(){return <SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:844},insets:{top:47,left:0,right:0,bottom:34}}}><FamilyAlbumPrintScreen/></SafeAreaProvider>;}
it('does not generate on entry and reports required family purchase only after an explicit generate tap',async()=>{
 mockSave.mockRejectedValue({code:'PURCHASE_REQUIRED'});const page=await render(wrap());
 await waitFor(()=>expect(page.getByText('生成PDF')).toBeTruthy());expect(mockCreate).not.toHaveBeenCalled();
 await fireEvent.press(page.getByText('生成PDF'));await waitFor(()=>expect(page.getByText('请先解锁或恢复导出权益，再点生成PDF。')).toBeTruthy());
 expect(mockCreate).toHaveBeenCalledWith('f','book',expect.any(Function),mockView);expect(mockSave).toHaveBeenCalledTimes(1);
});
it('does not offer new generation to a member, while previously created files remain saveable',async()=>{
 mockView.access.canManage=false;mockFiles.mockResolvedValue([{id:'print_old',createdAt:'2026-10-17',pdf:{sha256:'hash'}}]);
 const page=await render(wrap());await waitFor(()=>expect(page.getByText(/保存PDF/)).toBeTruthy());
 expect(page.queryByText('生成PDF')).toBeNull();
 await fireEvent.press(page.getByText(/保存PDF/));await waitFor(()=>expect(mockShare).toHaveBeenCalledTimes(1));expect(mockCreate).not.toHaveBeenCalled();
});
