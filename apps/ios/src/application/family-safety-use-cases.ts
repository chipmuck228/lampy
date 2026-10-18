import type { FamilyApiClient } from '../infrastructure/family-http-client';
import type { FamilySafetyApi } from '../family-api/safety-types';
import type { FamilySessionStore } from './family-use-cases';
import { ApplicationError } from './errors';
import { invalidateFamilySafety } from './family-safety-events';
export function createFamilySafetyUseCases(deps: {
  client: FamilyApiClient;
  session: FamilySessionStore;
  clearCache(userId: string): Promise<void>;
}) {
  async function account() {
    const userId=await deps.session.getUserId(),token=await deps.session.getSessionToken();
    if(!userId||!token)throw new ApplicationError('UNAUTHENTICATED','Sign in is required.');
    return {userId,token};
  }
  async function request<T>(current:()=>boolean,work:(api:FamilySafetyApi,token:string)=>Promise<T>,mutation=false) {
    const before=await account();
    if(!current())throw new ApplicationError('STALE_FAMILY_REQUEST','Inactive request.');
    if(!deps.client.safety)throw new ApplicationError('FAMILY_UPGRADE_REQUIRED','Upgrade required.');
    const result=await work(deps.client.safety,before.token);
    const after=await account();
    if(after.userId!==before.userId||after.token!==before.token)throw new ApplicationError('STALE_FAMILY_REQUEST','Account changed.');
    if(mutation) {
      // A confirmed write may finish after blur. Always invalidate the same account,
      // but never invalidate a different account or publish a late read result.
      invalidateFamilySafety();await deps.clearCache(before.userId);
    } else if(!current())throw new ApplicationError('STALE_FAMILY_REQUEST','Inactive request.');
    return result;
  }
  return {
    reports(current=()=>true) {return request(current,(api,token)=>api.reports(token));},
    blocks(current=()=>true) {return request(current,(api,token)=>api.blocks(token));},
    report(familyId:string,shareId:string,input:Parameters<FamilySafetyApi['report']>[3],current=()=>true) {
      return request(current,(api,token)=>api.report(token,familyId,shareId,input));
    },
    block(familyId:string,target:string,current=()=>true) {
      return request(current,(api,token)=>api.block(token,familyId,target),true);
    },
    unblock(target:string,current=()=>true) {
      return request(current,(api,token)=>api.unblock(token,target),true);
    },
  };
}
