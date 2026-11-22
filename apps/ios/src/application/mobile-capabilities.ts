import { Platform } from 'react-native';
import { albumLayoutNativeAvailable, albumNativePageViewAvailable } from '../../modules/lampy-album-layout';

/** Android currently supports the local personal library and personal albums only. */
export function personalRecordsOnly(platform = Platform.OS): boolean {
  return platform === 'android';
}

export function personalAlbumsAvailable(platform = Platform.OS): boolean {
  return platform !== 'android' || (albumLayoutNativeAvailable() && albumNativePageViewAvailable());
}

const PERSONAL_ALBUM_ROUTES = ['albums/index', 'albums/new', 'albums/[id]/index', 'albums/[id]/preview', 'albums/[id]/read'];
export function androidExcludedRoutes(): string[] {
  return personalAlbumsAvailable() ? ANDROID_EXCLUDED_ROUTES : [...ANDROID_EXCLUDED_ROUTES, ...PERSONAL_ALBUM_ROUTES];
}

/** Expo Router names, protected before their screens can mount. */
export const ANDROID_EXCLUDED_ROUTES = [
  'account-diagnostics',
  'account/family-content',
  'account/subscribe',
  'albums/[id]/print',
  'family',
  'family-album-paper',
  'family-album-print',
  'family-album-reading',
  'family-albums',
  'family-email-account',
  'family-invitations',
  'family-invite',
  'family-invite-login',
  'family-profile',
  'family-record/[id]',
  'family-records',
  'share/[id]',
];
