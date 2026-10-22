import {FamilyError,FAMILY_ERROR} from './errors';
import type {FamilyRepository,FamilyTx} from './repository';
import type {AppleVerifier,FamilyClock,DeleteAccountInput,DeleteAccountResult} from './types';
import type {MediaBlobStore} from './media-blobs';
export const DELETE_ACCOUNT_CONFIRMATION='delete-my-lampy-account-v1';
export type AppleRevoker={revoke(code:string,subject:string,nonce:string):Promise<void>};

export async function assertDeletionFamilies(tx:FamilyTx,userId:string) {
  for(const member of await tx.findMembershipsForUser(userId)) {
    if(member.role!=='creator'||member.status!=='active')continue;
    if((await tx.findFamily(member.familyId))?.status!=='active')continue;
    if((await tx.listActiveMembers(member.familyId)).some(m=>m.userId!==userId))
      throw new FamilyError('ACCOUNT_HAS_MANAGED_FAMILY','Transfer or dissolve families with other members first.');
  }
}
// Queue survives process exit; no retired object may be read via the media API.
export async function drainRetiredMediaBatch(repository:FamilyRepository,blobs:MediaBlobStore) {
  let failed=0, removed=0;
  const keys=await repository.withTransaction(tx=>tx.listAccountMediaCleanup());
  for(const key of keys) {
    try {
      if(await repository.withTransaction(tx=>tx.isMediaStorageKeyLive(key))){failed++;continue;}
      await blobs.remove(key);await repository.withTransaction(tx=>tx.completeAccountMediaCleanup(key));removed++;}
    catch {failed++;}
  }
  const remaining=await repository.withTransaction(tx=>tx.listAccountMediaCleanup());
  return {checked:keys.length,removed,failed,pendingBatch:remaining.length};
}
export async function drainAccountMedia(repository:FamilyRepository,blobs:MediaBlobStore) {
  const report=await drainRetiredMediaBatch(repository,blobs);
  return report.failed===0&&report.pendingBatch===0;
}
export function createAccountDeletionCommands(deps:{repository:FamilyRepository;apple:AppleVerifier;revoker?:AppleRevoker;blobs:MediaBlobStore;clock:FamilyClock;enabled:boolean;requireUser:(tx:FamilyTx,token?:string)=>Promise<string>}) {
 return {async deleteAccount(token:string,input:DeleteAccountInput):Promise<DeleteAccountResult> {
  if(!deps.enabled)throw new FamilyError(FAMILY_ERROR.FORBIDDEN,'Account deletion is not enabled.');
  if(input.confirmation!==DELETE_ACCOUNT_CONFIRMATION || !/^[a-f0-9]{64}$/.test(input.challengeId) || !input.identityToken || input.identityToken.length>8192 || (input.authorizationCode?.length??0)>4096)
    throw new FamilyError(FAMILY_ERROR.BAD_REQUEST,'Explicit confirmation and fresh Apple authorization required.');
  const challenge=await deps.repository.withTransaction(async tx=>{
    const userId=await deps.requireUser(tx,token);
    await assertDeletionFamilies(tx,userId);
    const c=await tx.findAppleChallenge(input.challengeId);
    if(!c||c.intent!=='delete'||c.userId!==userId||c.sessionToken!==token||Date.parse(c.expiresAt)<=deps.clock.now().getTime())throw new FamilyError(FAMILY_ERROR.APPLE_TOKEN_INVALID,'Delete authorization expired.');
    await tx.deleteAppleChallenge(c.id);return c;
  });
  const identity=await deps.apple.verifyIdentityToken(input.identityToken,challenge.nonce);
  await deps.repository.withTransaction(async tx=>{
    const userId=await deps.requireUser(tx,token);
    if(Date.parse(challenge.expiresAt)<=deps.clock.now().getTime())throw new FamilyError(FAMILY_ERROR.APPLE_TOKEN_INVALID,'Delete authorization expired.');
    const linked=await tx.findLoginIdentity('apple',identity.appleSubject);
    if(userId!==challenge.userId||linked?.userId!==userId)throw new FamilyError(FAMILY_ERROR.APPLE_TOKEN_INVALID,'Authorize the Apple account linked to this account.');
    await assertDeletionFamilies(tx,userId);
  });
  let appleRevocation:DeleteAccountResult['appleRevocation']='manual-required';
  // Never retain authorization codes/tokens, or make deletion conditional on Apple availability.
  if(deps.revoker&&input.authorizationCode) {
    try {await deps.revoker.revoke(input.authorizationCode,identity.appleSubject,challenge.nonce);appleRevocation='revoked';}catch {/* user is given Apple's manual revocation route */}
  }
  await deps.repository.withTransaction(async tx=>{
    const userId=await deps.requireUser(tx,token);
    if(userId!==challenge.userId)throw new FamilyError(FAMILY_ERROR.UNAUTHENTICATED,'Account changed.');
    await assertDeletionFamilies(tx,userId);
    await tx.purgeAccount(userId);
  });
  let completed=false;
  try {completed=await drainAccountMedia(deps.repository,deps.blobs);}catch {/* durable queue is retried by maintenance */}
  return {deleted:true,appleRevocation,mediaCleanup:completed?'completed':'pending'};
 }};
}
