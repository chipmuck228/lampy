import {redirectSystemPath} from '../app/+native-intent';
import {currentFamilyInvite,forgetFamilyInvite,rememberFamilyInvite} from './family-invite-link';
let mockOpen=true;
jest.mock('./family-config',()=>({isFamilyProductEntryOpen:()=>mockOpen}));
beforeEach(()=>{mockOpen=true;process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL='https://lampy-api.5sparks.ai';forgetFamilyInvite();});
afterEach(()=>{delete process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL;forgetFamilyInvite();});
it.each([true,false])('carries the invitation in memory for cold/warm routing (initial=%s)',initial=>{
 for(const path of ['lampy:///family-invite#','https://lampy-api.5sparks.ai/invite#','/family-invite#','/invite#']){
  expect(redirectSystemPath({path:path+'a'.repeat(64),initial})).toBe('/family-invite');expect(currentFamilyInvite()?.token).toBe('a'.repeat(64));
 }
});
it('does not retain an older invitation after a rejected new invite',()=>{
 rememberFamilyInvite('a'.repeat(64));expect(redirectSystemPath({path:'https://evil.example/invite#'+'b'.repeat(64),initial:true})).toBe('/family');expect(currentFamilyInvite()).toBeNull();
});
it('does not enable family entry when closed or accept queries and lookalike paths',()=>{
 mockOpen=false;expect(redirectSystemPath({path:'/family-invite#'+'a'.repeat(64),initial:true})).toBe('/family');expect(currentFamilyInvite()).toBeNull();
 mockOpen=true;for(const path of ['/family-invite?token='+'a'.repeat(64),'//evil/invite#'+'a'.repeat(64)]){expect(redirectSystemPath({path,initial:false})).toBe('/family');expect(currentFamilyInvite()).toBeNull();}
});
