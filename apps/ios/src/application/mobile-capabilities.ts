import { Platform } from 'react-native';
import { albumLayoutNativeAvailable, albumNativePageViewAvailable } from '../../modules/lampy-album-layout';

/** The legacy personal build stays isolated; Android parity explicitly opts into family. */
export function personalRecordsOnly(platform = Platform.OS): boolean {
  return platform === 'android' && process.env.EXPO_PUBLIC_ANDROID_FAMILY_ENABLED !== '1';
}

/** Purchases and exported files are never available on Android, regardless of inherited flags. */
export function purchasesSupported(platform = Platform.OS): boolean { return platform !== 'android'; }

export function personalAlbumsAvailable(platform = Platform.OS): boolean {
  return platform !== 'android' || (albumLayoutNativeAvailable() && albumNativePageViewAvailable());
}

const PERSONAL_ALBUM_ROUTES = ['albums/index', 'albums/new', 'albums/[id]/index', 'albums/[id]/preview', 'albums/[id]/read'];
export function androidExcludedRoutes(): string[] {
  return [...ANDROID_EXCLUDED_ROUTES,...(personalRecordsOnly()?ANDROID_PERSONAL_EXCLUDED_ROUTES:[]),...(!personalAlbumsAvailable()?PERSONAL_ALBUM_ROUTES:[])];
}

/** Expo Router names, protected before their screens can mount. */
export const ANDROID_EXCLUDED_ROUTES = [
  'account-diagnostics', 'account/subscribe', 'albums/[id]/print',
  'family-album-epub', 'family-album-paper', 'family-album-print',
];
export const ANDROID_PERSONAL_EXCLUDED_ROUTES = [
  'account/family-content', 'family', 'family-album-epub-preview', 'family-album-reading',
  'family-albums', 'family-email-account', 'family-invitations', 'family-invite',
  'family-invite-login', 'family-profile', 'family-record/[id]', 'family-records', 'share/[id]',
];
