import { createHash } from 'node:crypto';
import { FamilyError } from './errors';
import type { FamilyTx } from './repository';
import type { ShareRecord } from './types';
import { REPORT_REASONS, type FamilySafetyApi, type ReportReceipt, type SafetyReport } from './safety-types';
function fail(code: string): never { throw new FamilyError(code, code); }
const digest = (input: unknown) => createHash('sha256').update(JSON.stringify(input)).digest('hex');
const validId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(v);
export async function assertCanShare(tx: FamilyTx, userId: string) {
  if ((await tx.findSharingRestriction(userId))?.restricted) fail('SHARING_RESTRICTED');
}
const receipt = (r: SafetyReport): ReportReceipt => ({ reportId: r.reportId, reason: r.reason, createdAt: r.createdAt, status: r.status });
export async function familySafetyFilter(tx: FamilyTx, userId: string, familyId: string) {
  const blocked=new Set((await tx.listUserBlocks(userId)).map(b=>b.targetUserId));
  const hidden=new Set(await tx.listHiddenShares(familyId));
  return (row:ShareRecord)=>row.familyId===familyId&&row.status==='active'&&!blocked.has(row.authorUserId)&&!hidden.has(row.shareId);
}
export async function safetyVisible(tx: FamilyTx, userId: string, row: ShareRecord) {
  return row.status === 'active' && !(await tx.listUserBlocks(userId)).some(b => b.targetUserId === row.authorUserId) && !(await tx.findModeration(row.shareId))?.hidden;
}
export function createFamilySafetyCommands(deps: {
  clock: { now(): Date };
  authed<T>(session: string, work: (tx: FamilyTx, userId: string) => Promise<T>): Promise<T>;
}): FamilySafetyApi {
  async function member(tx: FamilyTx, userId: string, familyId: string) {
    if (!validId(familyId)) fail('BAD_REQUEST');
    if (!await tx.findActiveMembership(familyId,userId)) fail('NOT_IN_FAMILY');
  }
  return {
    report(session, familyId, shareId, input) { return deps.authed(session, async (tx,userId) => {
      await member(tx,userId,familyId);
      if (!validId(shareId) || !input || !validId(input.requestId) || !REPORT_REASONS.includes(input.reason) || typeof input.detail !== 'string' || input.detail.length > 1000) fail('BAD_REQUEST');
      const row = await tx.findShare(shareId);
      const family = await tx.findFamily(familyId);
      const membership = await tx.findActiveMembership(familyId,userId);
      if (!row || row.familyId !== familyId || !membership || !await safetyVisible(tx,userId,row) || (family?.historyPolicy !== 'family-history-v2' && (!row.audienceUserIds.includes(userId) || membership.joinedAt > row.sharedAt))) fail('SHARE_NOT_FOUND');
      if (row.authorUserId === userId) fail('BAD_REQUEST');
      const fingerprint=digest([familyId,shareId,input.reason,input.detail.trim()]);
      const cached=await tx.findIdempotent(userId,'safety-report',input.requestId);
      if(cached) {
        if(cached.requestFingerprint!==fingerprint)fail('CONFLICT');
        const found=await tx.findSafetyReport((cached.body as {reportId:string}).reportId);
        if(!found)fail('NOT_FOUND');return receipt(found);
      }
      const now=deps.clock.now(),bucket='safety-report:'+userId;
      const previous=await tx.findRateLimit(bucket);
      const rate=previous&&now.getTime()-Date.parse(previous.windowStartedAt)<3600000?{...previous,hitCount:previous.hitCount+1}:{bucket,windowStartedAt:now.toISOString(),hitCount:1};
      if(rate.hitCount>30)fail('RATE_LIMITED');
      const reports=await tx.listSafetyReports(userId);
      let report=reports.find(r=>r.shareId===shareId);
      if(!report) {
        if(reports.filter(r=>now.getTime()-Date.parse(r.createdAt)<3600000).length>=10)fail('RATE_LIMITED');
        report={reportId:'report_'+digest([userId,input.requestId]),reporterUserId:userId,authorUserId:row.authorUserId,familyId,shareId,reason:input.reason,detail:input.detail.trim(),createdAt:now.toISOString(),status:'pending'};
        await tx.saveSafetyReport(report);
      }
      await tx.saveRateLimit(rate);
      await tx.saveIdempotent(userId,'safety-report',input.requestId,{requestFingerprint:fingerprint,status:201,body:{reportId:report.reportId}});
      return receipt(report);
    }); },
    reports(session) { return deps.authed(session,async(tx,userId) => {
      const restrictedShares = new Set<string>();
      for (const report of await tx.listSafetyReports()) if (report.authorUserId===userId && (await tx.findModeration(report.shareId))?.hidden) restrictedShares.add(report.shareId);
      return { reports:(await tx.listSafetyReports(userId)).map(receipt).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)), sharingRestricted:(await tx.findSharingRestriction(userId))?.restricted===true, restrictedShares:[...restrictedShares] };
    }); },
    blocks(session) { return deps.authed(session,async(tx,userId) => ({ blocks:await Promise.all((await tx.listUserBlocks(userId)).map(async b=>({...b,nickname:(await tx.findProfile(b.targetUserId))?.nickname??''}))) })); },
    block(session,familyId,targetUserId) { return deps.authed(session,async(tx,userId) => {
      await member(tx,userId,familyId);
      if (!validId(targetUserId) || targetUserId === userId) fail('BAD_REQUEST');
      const targetMember=await tx.findActiveMembership(familyId,targetUserId);
      const family=await tx.findFamily(familyId);
      const membership=await tx.findActiveMembership(familyId,userId);
      const readable=await familySafetyFilter(tx,userId,familyId);
      const pastAuthor=(await tx.listSharesInFamily(familyId)).some(row=>row.authorUserId===targetUserId&&readable(row)&&(family?.historyPolicy==='family-history-v2'||!!membership&&row.audienceUserIds.includes(userId)&&membership.joinedAt<=row.sharedAt));
      const alreadyBlocked=(await tx.listUserBlocks(userId)).some(b=>b.targetUserId===targetUserId);
      if ((!targetMember&&!pastAuthor&&!alreadyBlocked) || !await tx.findAccountByUserId(targetUserId)) fail('NOT_IN_FAMILY');
      if ((await tx.listUserBlocks(userId)).length >= 1000 && !(await tx.listUserBlocks(userId)).some(b=>b.targetUserId===targetUserId)) fail('RATE_LIMITED');
      await tx.saveUserBlock({userId,targetUserId,createdAt:deps.clock.now().toISOString()}); return {blocked:true as const};
    }); },
    unblock(session,targetUserId) { return deps.authed(session,async(tx,userId) => {
      if (!validId(targetUserId) || userId===targetUserId) fail('BAD_REQUEST');
      await tx.deleteUserBlock(userId,targetUserId); return {blocked:false as const};
    }); },
  };
}
// Only the host operator CLI invokes this; deliberately absent from public HTTP commands.
export async function reviewSafetyReport(tx: FamilyTx, input: { reportId: string; operator: string; reason: string; hide: boolean; now: string }) {
  if (!validId(input.reportId) || !input.operator.trim() || input.operator.length>200 || !input.reason.trim() || input.reason.length>1000 || !Number.isFinite(Date.parse(input.now))) fail('BAD_REQUEST');
  const report = await tx.findSafetyReport(input.reportId);
  if (!report) fail('NOT_FOUND');
  const previous = await tx.findModeration(report.shareId);
  if (input.hide) {
    const row = await tx.findShare(report.shareId);
    if (!row || row.status !== 'active') fail('SHARE_NOT_FOUND');
    await tx.saveModeration({shareId:row.shareId,hidden:true,operator:input.operator.trim(),reason:input.reason.trim(),updatedAt:input.now});
  }
  if (!input.hide) await tx.saveModeration({shareId:report.shareId,hidden:previous?.hidden??false,operator:input.operator.trim(),reason:input.reason.trim(),updatedAt:input.now});
  for (const r of await tx.listSafetyReports()) if (r.shareId === report.shareId) {
    await tx.saveSafetyReport({...r,status:input.hide || (await tx.findModeration(r.shareId))?.hidden ? 'restricted' : 'reviewed'});
  }
}

export async function restrictReportedAuthor(tx: FamilyTx, input: {reportId:string; operator:string; reason:string; restricted:boolean; now:string}) {
  if (!validId(input.reportId) || !input.operator.trim() || input.operator.length>200 || !input.reason.trim() || input.reason.length>1000 || !Number.isFinite(Date.parse(input.now))) fail('BAD_REQUEST');
  const report=await tx.findSafetyReport(input.reportId);
  if(!report || !await tx.findAccountByUserId(report.authorUserId)) fail('NOT_FOUND');
  await tx.saveSharingRestriction({userId:report.authorUserId,restricted:input.restricted,operator:input.operator.trim(),reason:input.reason.trim(),updatedAt:input.now});
}
