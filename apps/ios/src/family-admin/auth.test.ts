import {hashAdminPassword,verifyAdminPassword,validPasswordHash,createAdminAuth,ADMIN_COOKIE} from './auth';

// Production-cost scrypt needs headroom on shared CI hosts.
jest.setTimeout(20000);
it('uses a salted bounded scrypt hash and rejects invalid credentials',async()=>{
 const password='a dedicated admin passphrase';const a=hashAdminPassword(password),b=hashAdminPassword(password);
 expect(a).not.toBe(b);expect(validPasswordHash(a)).toBe(true);expect(await verifyAdminPassword(password,a)).toBe(true);expect(await verifyAdminPassword('incorrect',a)).toBe(false);expect(validPasswordHash('plain-password')).toBe(false);
 expect(()=>hashAdminPassword('short')).toThrow();
});
it('expires idle and absolute sessions, rejects duplicate cookies and bounds login attempts',()=>{
 let now=0;const auth=createAdminAuth(()=>now),s=auth.issue(),cookie=ADMIN_COOKIE+'='+s.token;
 expect(auth.session(cookie)).toMatchObject({csrf:s.csrf});expect(auth.session(cookie+'; '+cookie)).toBeNull();
 now=30*60000;expect(auth.session(cookie)).toBeNull();
 const second=auth.issue();now+=8*3600000;expect(auth.session(ADMIN_COOKIE+'='+second.token)).toBeNull();
 for(let i=0;i<10;i++)expect(auth.allowLogin('peer')).toBe(true);expect(auth.allowLogin('peer')).toBe(false);now+=15*60000;expect(auth.allowLogin('peer')).toBe(true);
});
