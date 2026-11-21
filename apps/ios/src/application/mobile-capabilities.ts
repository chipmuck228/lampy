import { Platform } from 'react-native';

/** Android's first milestone contains only the local personal library. */
export function personalRecordsOnly(platform = Platform.OS): boolean {
  return platform === 'android';
}

/** Expo Router names, protected before their screens can mount. */
export const ANDROID_EXCLUDED_ROUTES = [
  'account-diagnostics',
  'account/family-content',
  'account/subscribe',
  'albums/[id]/index',
  'albums/[id]/preview',
  'albums/[id]/print',
  'albums/[id]/read',
  'albums/index',
  'albums/new',
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
