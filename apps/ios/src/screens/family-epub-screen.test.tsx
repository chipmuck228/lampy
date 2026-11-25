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
