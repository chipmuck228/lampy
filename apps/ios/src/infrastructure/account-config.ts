import {Platform} from 'react-native';

export function safeAccountEndpoint(value:string):boolean {
  try {
    const url=new URL(value);
    if(url.username||url.password||url.search||url.hash||!url.hostname)return false;
    if(url.protocol==='https:')return true;
    const host=url.hostname;
    if(url.protocol!=='http:')return false;
    if(host==='localhost'||host==='127.0.0.1'||host==='[::1]')return true;
    // Match a complete numeric IPv4 address, never a DNS name with a private-looking prefix.
    const ipv4=/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
    if(!ipv4)return false;
    const octets=ipv4.slice(1).map(Number);
    if(!octets.every(octet=>octet>=0&&octet<=255))return false;
    const [a,b]=octets;
    return a===10||(a===192&&b===168)||(a===172&&b>=16&&b<=31);
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
