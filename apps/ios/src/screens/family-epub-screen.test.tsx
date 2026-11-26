import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
import {View} from 'react-native';
import FamilyEpubScreen from './family-epub-screen';
const mockPush=jest.fn(),mockList=jest.fn(),mockShare=jest.fn(),mockAccess=jest.fn(),mockUnlock=jest.fn(),mockPurchase=jest.fn(),mockRestore=jest.fn();
let mockCurrent=true;
const mockValid=()=>mockCurrent,mockCapture=()=>mockValid;
const mockBook={familyId:'f',albumId:'book',name:'Family book',items:[{status:'active'}],access:{userId:'a',canManage:true,canExport:true}};
const mockReading={view:mockBook,valid:mockValid,capture:mockCapture,blocked:false,error:false,retry:jest.fn()};
const mockStatus={owned:false,product:null};
jest.mock('expo-router',()=>({useLocalSearchParams:()=>({familyId:'f',albumId:'book'}),useRouter:()=>({push:mockPush,back:jest.fn()}),useFocusEffect:(fn:()=>unknown)=>jest.requireActual('react').useEffect(fn,[fn])}));
jest.mock('./use-family-paper',()=>({useFamilyPaper:()=>mockReading}));
jest.mock('../application/family-epub',()=>({familyEpubEnabled:()=>true}));
jest.mock('../application/container',()=>({getFamilyUseCases:async()=>({familyPurchaseAccess:mockAccess,unlockFamilyPurchase:mockUnlock})}));
jest.mock('../infrastructure/family-epub-files',()=>({listFamilyEpubs:(...a:unknown[])=>mockList(...a),shareFamilyEpub:(...a:unknown[])=>mockShare(...a),deleteFamilyEpub:jest.fn()}));
jest.mock('./album-export-unlock',()=>({useAlbumExportUnlock:()=>({status:mockStatus,price:'$4.99',loading:false,working:false,notice:'',purchase:mockPurchase,restore:mockRestore,retry:jest.fn()})}));
jest.mock('./settings-chrome',()=>({SettingsPage:({children}:{children:React.ReactNode})=>{const V=jest.requireActual('react-native').View;return <V>{children}</V>;}}));
jest.mock('./album-edition-swipe-row',()=>({AlbumEditionSwipeRow:({children}:{children:React.ReactNode})=>children}));
beforeEach(()=>{jest.clearAllMocks();mockCurrent=true;mockReading.blocked=false;mockBook.access.canManage=true;mockBook.access.canExport=true;mockStatus.owned=false;mockList.mockResolvedValue([]);mockAccess.mockResolvedValue({eligible:false,canExport:false});mockUnlock.mockResolvedValue({eligible:true,canExport:true});mockShare.mockResolvedValue('epub_new');});
it('members preview free without checking purchase or offering save',async()=>{
 mockBook.access.canManage=false;const page=await render(<FamilyEpubScreen/>);await waitFor(()=>expect(page.getByTestId('family-epub-preview')).toBeTruthy());await fireEvent.press(page.getByTestId('family-epub-preview'));
 expect(mockPush).toHaveBeenCalledWith({pathname:'/family-album-epub-preview',params:{familyId:'f',albumId:'book'}});expect(mockAccess).not.toHaveBeenCalled();expect(page.queryByTestId('family-epub-save')).toBeNull();expect(mockShare).not.toHaveBeenCalled();
});
it('requires explicit purchase and family unlock, never exports on entry or purchase',async()=>{
 const page=await render(<FamilyEpubScreen/>);await waitFor(()=>expect(mockAccess).toHaveBeenCalled());expect(mockShare).not.toHaveBeenCalled();await fireEvent.press(page.getByTestId('family-epub-purchase'));expect(mockPurchase).toHaveBeenCalled();expect(mockShare).not.toHaveBeenCalled();
 mockStatus.owned=true;await page.rerender(<FamilyEpubScreen/>);await waitFor(()=>expect(page.getByTestId('family-epub-unlock')).toBeTruthy());await fireEvent.press(page.getByTestId('family-epub-unlock'));await waitFor(()=>expect(page.getByTestId('family-epub-save')).toBeTruthy());expect(mockUnlock).toHaveBeenCalledWith('f',expect.any(Function));expect(mockShare).not.toHaveBeenCalled();
 await fireEvent.press(page.getByTestId('family-epub-save'));await waitFor(()=>expect(mockShare).toHaveBeenCalledWith(mockBook,expect.any(Function),expect.any(Function),undefined,expect.any(Function)));
});
it('uses an existing family grant even without a new personal purchase and ignores a late result after loss of scope',async()=>{
 mockAccess.mockResolvedValue({eligible:true,canExport:true});let finish!:(id:string)=>void;mockShare.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const page=await render(<FamilyEpubScreen/>);await waitFor(()=>expect(page.getByTestId('family-epub-save')).toBeTruthy());await fireEvent.press(page.getByTestId('family-epub-save'));const calls=mockList.mock.calls.length;
 await act(async()=>{mockCurrent=false;finish('epub_late');});expect(mockList).toHaveBeenCalledTimes(calls);expect(page.queryByText('刚刚生成')).toBeNull();expect(mockPurchase).not.toHaveBeenCalled();
 await page.rerender(<View/>);
});
it('uses the same cover and edition grouping as the personal save/share page',async()=>{
 mockList.mockResolvedValue([{id:'old',name:'Earlier book',createdAt:'2026-11-01T12:00:00Z'}]);
 const page=await render(<FamilyEpubScreen/>);await waitFor(()=>expect(page.getByText('Earlier book')).toBeTruthy());
 expect(page.getByTestId('family-epub-cover')).toBeTruthy();expect(page.getAllByText('Family book')).toHaveLength(1);expect(page.getByText('已生成的电子册')).toBeTruthy();expect(page.getByText('点按分享，左滑可分享或删除。')).toBeTruthy();
 expect(mockShare).not.toHaveBeenCalled();expect(mockPurchase).not.toHaveBeenCalled();
});
it('does not show retry or product unavailable for an already eligible family',async()=>{
 mockAccess.mockResolvedValue({eligible:true,canExport:true});mockStatus.owned=true;
 const page=await render(<FamilyEpubScreen/>);await waitFor(()=>expect(page.getByTestId('family-epub-save')).toBeTruthy());
 expect(page.queryByText('再试一次')).toBeNull();expect(page.queryByText('商品暂时不可用，请稍后再试。')).toBeNull();expect(page.queryByTestId('family-epub-purchase')).toBeNull();
});
it('keeps verified family access when the saved-edition list fails and clears retry on recovery',async()=>{
 mockAccess.mockResolvedValue({eligible:true,canExport:true});mockList.mockRejectedValueOnce(Error('disk'));
 const page=await render(<FamilyEpubScreen/>);await waitFor(()=>expect(page.getByTestId('family-epub-save')).toBeTruthy());
 expect(page.getByText('暂时读不到已生成的电子册，原记录仍然保留。')).toBeTruthy();expect(mockPurchase).not.toHaveBeenCalled();
 await fireEvent.press(page.getByTestId('family-epub-retry'));await waitFor(()=>expect(page.queryByTestId('family-epub-retry')).toBeNull());expect(page.getByTestId('family-epub-save')).toBeTruthy();
});
it('does not turn a family-access verification failure into a purchase offer',async()=>{
 mockAccess.mockRejectedValueOnce(Error('offline'));
 const page=await render(<FamilyEpubScreen/>);await waitFor(()=>expect(page.getByText('暂时无法确认家庭导出资格；已有购买无需重复付款。')).toBeTruthy());
 expect(page.queryByTestId('family-epub-purchase')).toBeNull();expect(page.queryByTestId('family-epub-save')).toBeNull();expect(page.getByTestId('family-epub-retry')).toBeTruthy();
});
