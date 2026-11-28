const OPEN_ORIGINS=new Set(['https://lampy.5sparks.ai','https://open.yunpura.com']);
const OPEN_PATHS=new Set(['/en/install','/en/install/','/zh-cn/install','/zh-cn/install/']);
/** Public product links only. Never accepts an account, invite or record identifier. */
export function isWebsiteOpenLink(path:string):boolean {
  if(OPEN_PATHS.has(path))return true;
  try {
    const url=new URL(path);
    return OPEN_ORIGINS.has(url.origin) && !url.username && !url.password && !url.search && !url.hash && OPEN_PATHS.has(url.pathname);
  } catch {return false;}
}
