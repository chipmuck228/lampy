import {randomUUID} from 'node:crypto';
import {FamilyError} from './errors';
import type {FamilyTx} from './repository';
import type {FamilyClock} from './types';
import type {FamilyExportEligibility,PurchaseContext,PurchaseRecord,PurchaseVerifier,VerifiedPurchase} from './purchase-types';

export function createPurchaseCommands(deps:{
  enabled:boolean; productId?:string; verifier?:PurchaseVerifier; clock:FamilyClock;
  authed<T>(session:string,work:(tx:FamilyTx,userId:string)=>Promise<T>):Promise<T>;
}) {
  function fail(code:string):never {throw new FamilyError(code,code);}
  function enabled() {if(!deps.enabled||!deps.productId||!deps.verifier)fail('PURCHASES_CLOSED');}
  function validate(row:VerifiedPurchase,expectedToken:string|null) {
    if(!expectedToken||row.appAccountToken.toLowerCase()!==expectedToken.toLowerCase())fail('PURCHASE_ACCOUNT_MISMATCH');
    if(row.environment!==deps.verifier?.environment||row.productId!==deps.productId||!row.originalTransactionId||!row.transactionId||!['Sandbox','Production'].includes(row.environment)||!Number.isFinite(row.signedAt)||row.signedAt<=0)fail('PURCHASE_INVALID');
  }
  function fresh(row:PurchaseRecord) {
    const age=deps.clock.now().getTime()-Date.parse(row.checkedAt);
    return row.environment===deps.verifier?.environment&&!row.revoked&&row.productId===deps.productId&&age>=0&&age<=30000;
  }
  async function admit(tx:FamilyTx,userId:string) {
    const now=deps.clock.now();const bucket=`purchase-verification:${userId}`;
    const previous=await tx.findRateLimit(bucket);
    const recent=previous&&now.getTime()-Date.parse(previous.windowStartedAt)<60000;
    if(recent&&previous.hitCount>=40)fail('PURCHASE_RATE_LIMITED');
    await tx.saveRateLimit({bucket,windowStartedAt:recent?previous.windowStartedAt:now.toISOString(),hitCount:recent?previous.hitCount+1:1});
  }
  async function token(tx:FamilyTx,userId:string) {
    const prior=await tx.purchaseToken(userId);if(prior)return prior;
    const next=randomUUID();await tx.savePurchaseToken(userId,next);return next;
  }
  async function created(tx:FamilyTx,userId:string) {
    let count=0;
    for(const m of await tx.findMembershipsForUser(userId))if(m.role==='creator'&&m.status==='active'&&(await tx.findFamily(m.familyId))?.status==='active')count++;
    return count;
  }
  async function context(tx:FamilyTx,userId:string):Promise<PurchaseContext> {
    const count=await created(tx,userId);const owned=(await tx.listPurchases(userId)).some(fresh);
    return {userId,appAccountToken:await token(tx,userId),owned,createdFamilyCount:count,canCreateFamily:count===0||owned};
  }
  async function member(tx:FamilyTx,userId:string,familyId:string) {
    if((await tx.findFamily(familyId))?.status!=='active')fail('FAMILY_DISSOLVED');
    const m=await tx.findActiveMembership(familyId,userId);if(!m)fail('NOT_IN_FAMILY');return m;
  }
  // Network work is outside the SQLite write transaction and its serialized queue.
  async function refresh(session:string,familyId?:string) {
    enabled();
    const snapshot=await deps.authed(session,async(tx,userId)=>{
      if(familyId){const m=await member(tx,userId,familyId);if(m.role!=='creator')fail('FORBIDDEN');}
      const rows=familyId?await Promise.all((await tx.listPurchaseGrants(familyId)).map(g=>tx.findPurchase(g.purchaseKey))):await tx.listPurchases(userId);
      if(rows.some(r=>r&&!r.revoked&&r.environment===deps.verifier?.environment))await admit(tx,userId);
      return {userId,rows:rows.filter((r):r is PurchaseRecord=>!!r&&!r.revoked&&r.environment===deps.verifier?.environment)};
    });
    const updates=await Promise.all(snapshot.rows.map(async old=>{
      const verified=await deps.verifier!.verify(old.originalTransactionId);
      validate(verified,old.appAccountToken);
      if(`${verified.environment}:${verified.originalTransactionId}`!==old.key)fail('PURCHASE_INVALID');
      return {...old,...verified,checkedAt:deps.clock.now().toISOString()};
    }));
    await deps.authed(session,async(tx,userId)=>{
      if(userId!==snapshot.userId)fail('PURCHASE_ACCOUNT_MISMATCH');
      if(familyId){const m=await member(tx,userId,familyId);if(m.role!=='creator')fail('FORBIDDEN');}
      for(const row of updates)await tx.savePurchase(row);
    });
  }
  async function familyView(tx:FamilyTx,userId:string,familyId:string):Promise<FamilyExportEligibility> {
    const m=await member(tx,userId,familyId);
    const sources=await Promise.all((await tx.listPurchaseGrants(familyId)).map(g=>tx.findPurchase(g.purchaseKey)));
    const eligible=m.role==='creator'&&sources.some(r=>r&&fresh(r));
    return {familyId,eligible,reason:m.role!=='creator'?'not-creator':eligible?'eligible':'locked',canExport:false};
  }
  return {
    enabled:deps.enabled,
    refreshUser:(session:string)=>refresh(session),
    async prepareCreation(session:string) {
      enabled();
      const count=await deps.authed(session,created);
      // The free first family must not depend on Apple's availability.
      if(count>0)await refresh(session);
    },
    async assertCanCreate(tx:FamilyTx,userId:string) {
      if(!deps.enabled)return;
      const view=await context(tx,userId);if(!view.canCreateFamily)fail('PURCHASE_REQUIRED');
    },
    async grantCreated(tx:FamilyTx,userId:string,familyId:string) {
      if(!deps.enabled)return;
      const purchase=(await tx.listPurchases(userId)).find(fresh);
      if(purchase)await tx.savePurchaseGrant({familyId,purchaseKey:purchase.key,unlockedBy:userId,unlockedAt:deps.clock.now().toISOString()});
    },
    async context(session:string) {
      await refresh(session);return deps.authed(session,context);
    },
    async claim(session:string,transactionId:string) {
      enabled();
      if(!/^\d{1,40}$/.test(transactionId))fail('BAD_REQUEST');
      const owner=await deps.authed(session,async(tx,userId)=>{await admit(tx,userId);return {userId,token:await token(tx,userId)};});
      const verified=await deps.verifier!.verify(transactionId);validate(verified,owner.token);
      const key=`${verified.environment}:${verified.originalTransactionId}`;
      return deps.authed(session,async(tx,userId)=>{
        if(userId!==owner.userId)fail('PURCHASE_ACCOUNT_MISMATCH');
        const existing=await tx.findPurchase(key);
        if(existing&&existing.userId!==userId)fail('PURCHASE_ACCOUNT_MISMATCH');
        await tx.savePurchase({...verified,key,userId,checkedAt:deps.clock.now().toISOString()});
        return context(tx,userId);
      });
    },
    async familyAccess(session:string,familyId:string) {
      enabled();
      const role=await deps.authed(session,async(tx,userId)=>(await member(tx,userId,familyId)).role);
      if(role==='creator')await refresh(session,familyId);
      return deps.authed(session,(tx,userId)=>familyView(tx,userId,familyId));
    },
    async unlockFamily(session:string,familyId:string) {
      enabled();
      await deps.authed(session,async(tx,userId)=>{if((await member(tx,userId,familyId)).role!=='creator')fail('FORBIDDEN');});
      await refresh(session);
      return deps.authed(session,async(tx,userId)=>{
        if((await member(tx,userId,familyId)).role!=='creator')fail('FORBIDDEN');
        const own=(await tx.listPurchases(userId)).find(fresh);if(!own)fail('PURCHASE_REQUIRED');
        await tx.savePurchaseGrant({familyId,purchaseKey:own.key,unlockedBy:userId,unlockedAt:deps.clock.now().toISOString()});
        return familyView(tx,userId,familyId);
      });
    },
  };
}
