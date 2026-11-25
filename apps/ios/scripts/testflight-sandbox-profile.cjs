'use strict';
const API='https://family-test.yunpura.com';
const FLAGS={
  EXPO_PUBLIC_APPSTORE_V1:'0',EXPO_PUBLIC_FAMILY_INTERNAL_TEST:'1',EXPO_PUBLIC_FAMILY_ENTRY_OPEN:'1',
  EXPO_PUBLIC_FAMILY_ALBUM_EVAL:'1',EXPO_PUBLIC_FAMILY_API_BASE_URL:API,
  EXPO_PUBLIC_CONTROLLED_EMAIL_ACCOUNTS:'1',EXPO_PUBLIC_ACCOUNT_DIAGNOSTICS:'0',
  EXPO_PUBLIC_FAMILY_TEST_DRIVER:'',EXPO_PUBLIC_FAMILY_TEST_INVITE_CODE:'',EXPO_NO_DOTENV:'1',
  EXPO_PUBLIC_EMAIL_CODE_LOGIN_ENABLED:'1',EXPO_PUBLIC_ACCOUNT_API_BASE_URL:API,
  EXPO_PUBLIC_UNIFIED_PURCHASES:'1',EXPO_PUBLIC_ALBUM_EXPORT_ENABLED:'1',EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED:'1',
  EXPO_PUBLIC_FAMILY_ALBUM_EXPORT_ENABLED:'1',EXPO_PUBLIC_ALBUM_PRINT_EVAL:'0',
};
function launchProfile(env){
  if(env.LAMPY_BUILD_PROFILE!=='testflight-sandbox')throw Error('Expected testflight-sandbox profile');
  if(!/^[1-9]\d*$/.test(env.LAMPY_BUILD_NUMBER||''))throw Error('A new positive build number is required');
  for(const [key,value]of Object.entries(FLAGS))if(env[key]!==value)throw Error('Launch profile mismatch: '+key);
  const product=(env.LAMPY_RELEASE_PRODUCT_ID||'').trim();
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{2,199}$/.test(product)||/(^|[._-])(test|example|placeholder)([._-]|$)|your[_-]/i.test(product)||env.EXPO_PUBLIC_ALBUM_EXPORT_PRODUCT_ID!==product)
    throw Error('An explicitly configured App Store product ID is required; local test IDs are not accepted');
  if(product!=='lampyepubexport')throw Error('Sandbox profile requires lampyepubexport');
  return {api:API,version:'1.0.0',build:env.LAMPY_BUILD_NUMBER,productId:product};
}
function configureLaunch(config,env){
  const profile=launchProfile(env);
  return {...config,version:profile.version,ios:{...config.ios,buildNumber:profile.build,
    privacyManifests:{...config.ios?.privacyManifests,NSPrivacyCollectedDataTypes:[
      ...(config.ios?.privacyManifests?.NSPrivacyCollectedDataTypes||[]).filter(row=>!['NSPrivacyCollectedDataTypeEmailAddress','NSPrivacyCollectedDataTypePurchaseHistory'].includes(row.NSPrivacyCollectedDataType)),
      ...['EmailAddress','PurchaseHistory'].map(name=>({NSPrivacyCollectedDataType:'NSPrivacyCollectedDataType'+name,NSPrivacyCollectedDataTypeLinked:true,NSPrivacyCollectedDataTypeTracking:false,NSPrivacyCollectedDataTypePurposes:['NSPrivacyCollectedDataTypePurposeAppFunctionality']})),
    ]},
    associatedDomains:[...new Set([...(config.ios?.associatedDomains||[]),'applinks:family-test.yunpura.com'])],
    infoPlist:{...config.ios?.infoPlist,LampyBuildProfile:'testflight-sandbox',LampyFamilyAPI:API,
      LampyFamilyAlbumPreviewEnabled:true,LampyEmailLoginEnabled:true}}};
}
module.exports={API,FLAGS,launchProfile,configureLaunch};
