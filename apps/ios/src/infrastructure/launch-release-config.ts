import {isFamilyV1ReleaseBuild} from './family-config';

/** Launch copy must describe only an explicit, consistent production feature set. */
export function isAppstoreLaunchBuild(
  formal=isFamilyV1ReleaseBuild(),
  email=process.env.EXPO_PUBLIC_EMAIL_CODE_LOGIN_ENABLED,
  purchases=process.env.EXPO_PUBLIC_UNIFIED_PURCHASES,
  exports=process.env.EXPO_PUBLIC_ALBUM_EXPORT_ENABLED,
  paid=process.env.EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED,
) {
  return formal&&email==='1'&&purchases==='1'&&exports==='1'&&paid==='1';
}
