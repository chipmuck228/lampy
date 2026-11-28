import { Platform } from 'react-native';
import { androidExcludedRoutes, personalRecordsOnly } from './mobile-capabilities';
import { isFamilyProductEntryOpen, familyApiBaseUrl } from '../infrastructure/family-config';
import { albumExportConfig } from './album-export-access';
import { canOpenPersonalSettingsDiagnostics } from './personal-settings-visibility';
import { navBandItemsFor } from '../screens/life-page';
jest.mock('../../modules/lampy-album-layout', () => ({
  albumLayoutNativeAvailable: jest.fn(() => true),
  albumNativePageViewAvailable: jest.fn(() => true),
}));

test('protected navigator excludes family, books and payment screens', () => {
  const previous=Platform.OS;Object.defineProperty(Platform,'OS',{value:'android',configurable:true});
  for (const route of ['index', 'leave', 'lookback/index', 'moment/[id]', 'account/storage', 'albums/index', 'albums/new', 'albums/[id]/read', 'albums/[id]/preview']) expect(androidExcludedRoutes()).not.toContain(route);
  for (const route of ['family', 'family-invite', 'share/[id]', 'albums/[id]/print', 'account/subscribe', 'account-diagnostics']) expect(androidExcludedRoutes()).toContain(route);
  Object.defineProperty(Platform,'OS',{value:previous,configurable:true});
});
test('Android remains personal even when inherited flags request family and purchases', () => {
  const previous=Platform.OS;
  const env={...process.env};
  try {
    Object.defineProperty(Platform,'OS',{value:'android',configurable:true});
    process.env.EXPO_PUBLIC_ALBUM_EXPORT_ENABLED='1';
    process.env.EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED='1';
    expect(personalRecordsOnly()).toBe(true);
    expect(isFamilyProductEntryOpen('1')).toBe(false);
    expect(familyApiBaseUrl('https://lampy-api.5sparks.ai')).toBe('');
    expect(albumExportConfig()).toEqual({enabled:false,paid:false,productId:''});
    expect(canOpenPersonalSettingsDiagnostics({EXPO_PUBLIC_ACCOUNT_DIAGNOSTICS:'1'},true)).toBe(false);
    expect(navBandItemsFor('recent',true)).toHaveLength(3);
    expect(personalRecordsOnly('ios')).toBe(false);
  } finally {
    Object.defineProperty(Platform,'OS',{value:previous,configurable:true});
    process.env=env;
  }
});
