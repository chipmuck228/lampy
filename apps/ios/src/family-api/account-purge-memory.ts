import type {FamilyStore} from './store';
export function purgeMemoryAccount(s:FamilyStore,userId:string) {
 const erasedShares=new Set(s.shares.filter(r=>r.authorUserId===userId).map(r=>r.shareId));
 s.sharingRestrictionAudit=s.sharingRestrictionAudit.filter(r=>r.userId!==userId);
 s.sharingRestrictions=s.sharingRestrictions.filter(r=>r.userId!==userId);
 s.safetyReports=s.safetyReports.filter(r=>r.reporterUserId!==userId&&r.authorUserId!==userId);
 s.userBlocks=s.userBlocks.filter(r=>r.userId!==userId&&r.targetUserId!==userId);
 s.moderation=s.moderation.filter(r=>!erasedShares.has(r.shareId));
 s.moderationAudit=s.moderationAudit.filter(r=>!erasedShares.has(r.shareId));
 const logins=s.testCredentials.filter(r=>r.userId===userId).map(r=>r.loginNormalized);
 s.rateLimits=s.rateLimits.filter(r=>r.bucket!=='safety-report:'+userId&&!logins.some(login=>r.bucket==='test-login:'+login||r.bucket==='email-register:'+login));
 const shares=new Set(s.shares.filter(r=>r.authorUserId===userId).map(r=>r.shareId));
 const solo=new Set(s.memberships.filter(m=>m.userId===userId&&m.role==='creator'&&m.status==='active'&&!s.memberships.some(o=>o.familyId===m.familyId&&o.status==='active'&&o.userId!==userId)).map(m=>m.familyId));
 for(const m of s.mediaObjects.filter(r=>r.ownerUserId===userId)) if(!s.accountMediaCleanup.includes(m.storageKey))s.accountMediaCleanup.push(m.storageKey);
 s.familyAlbums=s.familyAlbums.filter(a=>!solo.has(a.familyId)).map(a=>{
  const ids=a.shareIds.filter(id=>!shares.has(id));const cover=a.coverChoice&&shares.has(a.coverChoice.shareId)?null:a.coverChoice;
  return ids.length===a.shareIds.length&&cover===a.coverChoice?a:{...a,shareIds:ids,coverChoice:cover,revision:a.revision+1};
 });
 s.shares=s.shares.filter(r=>r.authorUserId!==userId).map(r=>({...r,audienceUserIds:r.audienceUserIds.filter(id=>id!==userId)}));
 s.familyAlbumNotices=s.familyAlbumNotices.filter(r=>r.userId!==userId&&!solo.has(r.familyId));
 s.families=s.families.filter(r=>!solo.has(r.familyId)||s.shares.some(share=>share.familyId===r.familyId)).map(r=>({...r,...(solo.has(r.familyId)?{status:'dissolved' as const,name:'',dissolvedAt:new Date().toISOString(),cleanupDeadline:new Date().toISOString()}:{}),...(r.dissolvedBy===userId?{dissolvedBy:undefined}:{}),...(r.historyConfirmedBy===userId?{historyConfirmedBy:undefined}:{})}));
 s.memberships=s.memberships.filter(r=>r.userId!==userId&&!solo.has(r.familyId));
 s.directoryHistory=s.directoryHistory.filter(r=>r.userId!==userId&&!solo.has(r.familyId));
 s.transfers=s.transfers.filter(r=>r.fromUserId!==userId&&r.toUserId!==userId&&!solo.has(r.familyId));
 s.invitations=s.invitations.filter(r=>!solo.has(r.familyId)).map(r=>r.acceptedByUserId===userId?{...r,acceptedByUserId:undefined}:r);
 s.inviteLinks=s.inviteLinks.filter(r=>!solo.has(r.familyId)).map(r=>r.acceptedByUserId===userId?{...r,acceptedByUserId:undefined}:r);
 const keys=new Set(s.purchases.filter(r=>r.userId===userId).map(r=>r.key));
 s.purchaseGrants=s.purchaseGrants.filter(r=>!keys.has(r.purchaseKey)&&!solo.has(r.familyId));
 s.purchases=s.purchases.filter(r=>r.userId!==userId);s.purchaseTokens=s.purchaseTokens.filter(r=>r.userId!==userId);
 s.appleChallenges=s.appleChallenges.filter(r=>r.userId!==userId);s.sessions=s.sessions.filter(r=>r.userId!==userId);
 s.profiles=s.profiles.filter(r=>r.userId!==userId);s.testCredentials=s.testCredentials.filter(r=>r.userId!==userId);
 s.loginIdentities=s.loginIdentities.filter(r=>r.userId!==userId);s.accounts=s.accounts.filter(r=>r.userId!==userId);
 s.mediaObjects=s.mediaObjects.filter(r=>r.ownerUserId!==userId);
 for(const [key,value]of s.idempotency)if(key.startsWith(userId+':')||JSON.stringify(value).includes(userId)||[...solo].some(id=>JSON.stringify(value).includes(id)))s.idempotency.delete(key);
}
