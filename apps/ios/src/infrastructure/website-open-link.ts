const OPEN_PATHS=new Set(['/en/install','/en/install/','/zh-cn/install','/zh-cn/install/']);
/** Public product links only. Never accepts an account, invite or record identifier. */
export function isWebsiteOpenLink(path:string):boolean {
  if(OPEN_PATHS.has(path))return true;
  try {
    const url=new URL(path);
    return url.origin==='https://open.yunpura.com' && !url.username && !url.password && !url.search && !url.hash && OPEN_PATHS.has(url.pathname);
  } catch {return false;}
}
