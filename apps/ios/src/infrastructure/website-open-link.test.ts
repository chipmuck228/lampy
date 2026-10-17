import { isWebsiteOpenLink } from './website-open-link';
import { redirectSystemPath } from '../app/+native-intent';
import { currentFamilyInvite, forgetFamilyInvite } from './family-invite-link';
it('opens only the public landing routes at the exact trusted HTTPS origin',()=>{
 for(const path of ['/en/install','/zh-cn/install/','https://open.yunpura.com/en/install','https://open.yunpura.com/zh-cn/install/']) {
  expect(isWebsiteOpenLink(path)).toBe(true);
  expect(redirectSystemPath({path,initial:true})).toBe('/');
  expect(redirectSystemPath({path,initial:false})).toBe('/');
 }
});
it('rejects lookalike domains, other schemes, credentials, ports and private routes',()=>{
 for(const path of ['https://open.yunpura.com.evil.test/en/install','http://open.yunpura.com/en/install','https://u:p@open.yunpura.com/en/install','https://open.yunpura.com:444/en/install','https://open.yunpura.com/family-invite','https://open.yunpura.com/moment/123','https://open.yunpura.com/en/install?token=x','https://open.yunpura.com/en/install#x','https://yunpura.com/en/install','not a url'])expect(isWebsiteOpenLink(path)).toBe(false);
});
it('does not create or overwrite an invite when opening the public homepage',()=>{
 forgetFamilyInvite();
 expect(redirectSystemPath({path:'https://open.yunpura.com/en/install',initial:true})).toBe('/');
 expect(currentFamilyInvite()).toBeNull();
 expect(redirectSystemPath({path:'/lookback',initial:false})).toBe('/lookback');
});
