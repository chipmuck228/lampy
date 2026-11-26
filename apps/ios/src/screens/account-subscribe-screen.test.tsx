import {fireEvent,render,waitFor} from '@testing-library/react-native';
import {AppState,Linking} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import AccountSubscribeScreen from './account-subscribe-screen';
let mockPaid=true;
const mockStatus=jest.fn(),mockPurchase=jest.fn(),mockRestore=jest.fn();
jest.mock('./settings-capabilities',()=>({paidEpubInformationVisible:()=>mockPaid}));
jest.mock('expo-router',()=>({useRouter:()=>({dismissTo:jest.fn()}),useFocusEffect:(fn:()=>unknown)=>jest.requireActual('react').useEffect(fn,[fn])}));
jest.mock('../infrastructure/album-export-purchases',()=>({albumExportAccess:{status:()=>mockStatus(),purchase:()=>mockPurchase(),restore:()=>mockRestore()},observeExportEntitlements:()=>()=>{}}));
const wrap=()=> <SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:844},insets:{top:47,left:0,right:0,bottom:34}}}><AccountSubscribeScreen/></SafeAreaProvider>;
beforeEach(()=>{jest.clearAllMocks();mockPaid=true;Object.defineProperty(AppState,'currentState',{configurable:true,value:'active'});jest.spyOn(AppState,'addEventListener').mockReturnValue({remove:jest.fn()});jest.spyOn(Linking,'openURL').mockResolvedValue(undefined);mockStatus.mockResolvedValue({owned:true,product:null});mockRestore.mockResolvedValue({owned:true,product:null});});
it('shows verified access and opens Apple history only on tap, without buying or restoring',async()=>{
 const page=await render(wrap());await waitFor(()=>expect(page.getByText('已解锁最长30分钟录音和EPUB保存与分享，无需重复购买。')).toBeTruthy());
 expect(Linking.openURL).not.toHaveBeenCalled();expect(mockPurchase).not.toHaveBeenCalled();expect(mockRestore).not.toHaveBeenCalled();
 await fireEvent.press(page.getByTestId('purchase-history-open'));expect(Linking.openURL).toHaveBeenCalledWith('https://reportaproblem.apple.com/');
});
it('offers a visible App Store fallback when history cannot be opened',async()=>{
 jest.spyOn(Linking,'openURL').mockRejectedValueOnce(Error('unavailable'));
 const page=await render(wrap());await fireEvent.press(page.getByTestId('purchase-history-open'));
 await waitFor(()=>expect(page.getByText('暂时无法打开Apple购买记录。可在App Store的账号页面查看购买历史。')).toBeTruthy());
});
it('does not mount purchase controls or history when the platform has no paid feature',async()=>{
 mockPaid=false;const page=await render(wrap());expect(page.queryByTestId('album-export-unlock')).toBeNull();expect(page.queryByTestId('purchase-history-open')).toBeNull();expect(mockStatus).not.toHaveBeenCalled();
});
