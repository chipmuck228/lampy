import {Platform} from 'react-native';
import {androidExcludedRoutes,personalRecordsOnly,purchasesSupported} from './mobile-capabilities';
import {albumExportConfig,albumExportEntryOpen} from './album-export-access';
import {familyEpubEnabled} from './family-epub';
import {unifiedPurchasesEnabled} from './unified-purchases';
import {isFamilyProductEntryOpen,isFamilyInternalTestBuild,familyApiBaseUrl} from '../infrastructure/family-config';
import {getConfiguredPurchases,observeExportEntitlements} from '../infrastructure/album-export-purchases';
const mockNative=jest.fn();
jest.mock('../../modules/lampy-export-purchases',()=>({exportPurchasesNative:()=>mockNative()}));
jest.mock('../../modules/lampy-album-layout',()=>({albumLayoutNativeAvailable:()=>true,albumNativePageViewAvailable:()=>true}));
const old=Platform.OS;let env:NodeJS.ProcessEnv;
beforeEach(()=>{env={...process.env};Object.defineProperty(Platform,'OS',{value:'android',configurable:true});process.env.EXPO_PUBLIC_ANDROID_FAMILY_ENABLED='1';process.env.EXPO_PUBLIC_FAMILY_ENTRY_OPEN='1';process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL='https://lampy-api.5sparks.ai';process.env.EXPO_PUBLIC_FAMILY_INTERNAL_TEST='1';process.env.EXPO_PUBLIC_CONTROLLED_EMAIL_ACCOUNTS='1';jest.clearAllMocks();});
afterEach(()=>{process.env=env;Object.defineProperty(Platform,'OS',{value:old,configurable:true});});
it('opens family snapshots, personal and family Chronicle previews while closing purchase/export deep links',()=>{
 expect(personalRecordsOnly()).toBe(false);expect(isFamilyProductEntryOpen()).toBe(true);expect(isFamilyInternalTestBuild()).toBe(true);expect(familyApiBaseUrl()).toBe('https://lampy-api.5sparks.ai');
 for(const route of ['family','family-albums','family-record/[id]','share/[id]','family-album-epub-preview','albums/[id]/preview','account/family-content'])expect(androidExcludedRoutes()).not.toContain(route);
 for(const route of ['account/subscribe','albums/[id]/print','family-album-epub','family-album-print','family-album-paper'])expect(androidExcludedRoutes()).toContain(route);
});
it('cannot enable Android payments or export by inheriting all iOS switches, and never loads StoreKit/listeners',()=>{
 for(const key of ['UNIFIED_PURCHASES','FAMILY_ALBUM_EXPORT_ENABLED','ALBUM_EXPORT_ENABLED','ALBUM_PAID_EXPORT_ENABLED','ALBUM_PRINT_EVAL'])process.env['EXPO_PUBLIC_'+key]='1';process.env.EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID='lampyepubexport';
 expect(purchasesSupported()).toBe(false);expect(albumExportConfig()).toEqual({enabled:false,paid:false,productId:''});expect(albumExportEntryOpen(true,{enabled:true,paid:true,productId:'lampyepubexport'},'1')).toBe(false);expect(unifiedPurchasesEnabled()).toBe(false);expect(familyEpubEnabled()).toBe(false);expect(getConfiguredPurchases()).toBeNull();observeExportEntitlements(()=>{})();expect(mockNative).not.toHaveBeenCalled();
});
