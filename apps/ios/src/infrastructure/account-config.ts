import {Platform} from 'react-native';

export function safeAccountEndpoint(value:string):boolean {
  try {
    const url=new URL(value);
    if(url.username||url.password||url.search||url.hash||!url.hostname)return false;
    if(url.protocol==='https:')return true;
    const host=url.hostname;
    return url.protocol==='http:'&&(host==='localhost'||host==='127.0.0.1'||host==='[::1]'||/^10\./.test(host)||/^192\.168\./.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host));
  } catch {return false;}
}
export function accountApiBaseUrl(value=process.env.EXPO_PUBLIC_ACCOUNT_API_BASE_URL,familyValue=process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL,platform=Platform.OS) {
  const explicit=(value??'').trim().replace(/\/+$/,'');
  const family=(familyValue??'').trim().replace(/\/+$/,'');
  return explicit||(platform!=='android'?family:'');
}
export function emailCodeEntryOpen(config?:{flag?:string;account?:string;family?:string;platform?:typeof Platform.OS;dev?:boolean}) {
  const flag=config?.flag??process.env.EXPO_PUBLIC_EMAIL_CODE_LOGIN_ENABLED;
  const family=(config?.family??process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL??'').trim().replace(/\/+$/,'');
  const platform=config?.platform??Platform.OS;
  const base=accountApiBaseUrl(config?.account??process.env.EXPO_PUBLIC_ACCOUNT_API_BASE_URL,family,platform);
  if(flag!=='1'||(platform!=='android'&&family&&base!==family))return false;
  const dev=config?.dev??(typeof __DEV__!=='undefined'&&__DEV__);
  return safeAccountEndpoint(base)&&(base.startsWith('https:')||dev);
}
