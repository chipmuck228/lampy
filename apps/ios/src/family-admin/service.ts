import {createHash} from 'node:crypto';
import {FamilyError} from '../family-api/errors';
import type {FamilySql} from '../family-api/schema';
import type {FamilyTx} from '../family-api/repository';
import {createSqliteFamilyRepository} from '../family-api/sqlite-repository';
import {reviewSafetyReport,restrictReportedAuthor} from '../family-api/safety-commands';
import type {SafetyReport} from '../family-api/safety-types';
import type {MediaBlobStore} from '../family-api/media-blobs';
import {sha256MediaBytes} from '../family-api/media-validate';
function fail(code:string):never {throw new FamilyError(code,code);}
export async function createAdminService(db:FamilySql,blobs:MediaBlobStore,operator:string,now:()=>Date=()=>new Date()){
 const schema=await db.getFirst<{version:number}>('SELECT MAX(version) AS version FROM family_schema_migrations');
 if(!schema || ![33,34].includes(schema.version))throw Error('Family schema 33 or 34 required; admin does not run family migrations.');
 for(const table of ['family_safety_reports','family_content_moderation','family_sharing_restrictions','family_sharing_restriction_audit'])if(!await db.getFirst("SELECT name FROM sqlite_master WHERE type='table' AND name=?",[table]))throw Error('Family safety tables missing.');
 // Separate operational access audit, not a new family migration or a content copy.
 await db.exec('CREATE TABLE IF NOT EXISTS family_admin_audit (sequence INTEGER PRIMARY KEY AUTOINCREMENT,at TEXT NOT NULL,operator TEXT NOT NULL,event TEXT NOT NULL,report_id TEXT,object_id TEXT); CREATE INDEX IF NOT EXISTS family_admin_audit_at ON family_admin_audit(at);');
 const repo=createSqliteFamilyRepository(db);
 async function audit(event:string,reportId:string|null=null,objectId:string|null=null){await db.run('INSERT INTO family_admin_audit(at,operator,event,report_id,object_id) VALUES (?,?,?,?,?)',[now().toISOString(),operator,event,reportId,objectId]);}
 async function detail(tx:FamilyTx,id:string){
  const report=await tx.findSafetyReport(id);if(!report)fail('NOT_FOUND');
  const share=await tx.findShare(report.shareId),family=await tx.findFamily(report.familyId),author=await tx.findAccountByUserId(report.authorUserId);
  const moderation=await tx.findModeration(report.shareId),restriction=await tx.findSharingRestriction(report.authorUserId);
  const readable=!!share&&share.authorUserId===report.authorUserId&&share.familyId===report.familyId&&share.status==='active'&&family?.status==='active'&&!!author;
  const version=createHash('sha256').update(JSON.stringify([report.status,share?.status,family?.status,!!author,moderation,restriction])).digest('hex');
  return {report:{reportId:report.reportId,reason:report.reason,detail:report.detail,status:report.status,createdAt:report.createdAt},
   familyName:family?.name??'',authorNickname:(await tx.findProfile(report.authorUserId))?.nickname??'',
   share:readable?{note:share!.snapshot.note,emotion:share!.snapshot.emotion,occurredAt:share!.snapshot.occurredAt,occurredAtPrecision:share!.snapshot.occurredAtPrecision,
    media:share!.snapshot.media.map(m=>({objectId:m.objectId,mimeType:m.mimeType}))}:null,
   hidden:moderation?.hidden===true,sharingRestricted:restriction?.restricted===true,authorAvailable:!!author,version};
 }
 return {
  async restrictedAuthors(page:number){
   if(!Number.isInteger(page)||page<0||page>10000)fail('BAD_REQUEST');
   return repo.withTransaction(async tx=>{
    const rows=await db.getAll<{user_id:string;json:string}>("SELECT user_id,json FROM family_sharing_restrictions WHERE json_extract(json,'$.restricted')=1 ORDER BY user_id LIMIT 51 OFFSET ?",[page*50]);
    const authors=await Promise.all(rows.slice(0,50).map(async row=>({userId:row.user_id,nickname:(await tx.findProfile(row.user_id))?.nickname??'',restrictedAt:JSON.parse(row.json).updatedAt,version:createHash('sha256').update(row.json).digest('hex')})));
    await audit('restricted-authors');return {authors,hasMore:rows.length>50,page};
   });
  },
  releaseAuthor(userId:string,input:{reason:unknown;version:unknown}){return repo.withTransaction(async tx=>{
   if(!/^[A-Za-z0-9_-]{1,200}$/.test(userId)||typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>1000||typeof input.version!=='string')fail('BAD_REQUEST');
   const row=await db.getFirst<{json:string}>('SELECT json FROM family_sharing_restrictions WHERE user_id=?',[userId]);
   if(!row||!await tx.findAccountByUserId(userId))fail('NOT_FOUND');
   if(!JSON.parse(row.json).restricted||createHash('sha256').update(row.json).digest('hex')!==input.version)fail('CONFLICT');
   await tx.saveSharingRestriction({userId,restricted:false,operator,reason:input.reason.trim(),updatedAt:now().toISOString()});
   await audit('release-author-direct');return {released:true};
  });},
  async list(status:string,page:number){if(!['pending','reviewed','restricted','all'].includes(status)||!Number.isInteger(page)||page<0||page>10000)fail('BAD_REQUEST');
   return repo.withTransaction(async()=>{
    const where=status==='all'?'':" WHERE json_extract(json,'$.status')=?";const params=status==='all'?[]:[status];
    const rows=await db.getAll<{json:string}>('SELECT json FROM family_safety_reports'+where+' ORDER BY created_at DESC,report_id LIMIT 51 OFFSET ?',[...params,page*50]);
    const reports=rows.slice(0,50).map(row=>{const r=JSON.parse(row.json) as SafetyReport;return {reportId:r.reportId,reason:r.reason,status:r.status,createdAt:r.createdAt};});
    await audit('list');return {reports,hasMore:rows.length>50,page};
   });
  },
  validate(id:string){return repo.withTransaction(async tx=>({version:(await detail(tx,id)).version}));},
  read(id:string){return repo.withTransaction(async tx=>{const d=await detail(tx,id);await audit('inspect',id);return d;});},
  media(id:string,objectId:string){return repo.withTransaction(async tx=>{
   const d=await detail(tx,id);if(!d.share?.media.some(m=>m.objectId===objectId))fail('NOT_FOUND');
   const report=await tx.findSafetyReport(id),object=await tx.findMediaObject(objectId);
   if(!object||object.ownerUserId!==report!.authorUserId||!['image/jpeg','image/png','audio/mp4'].includes(object.mimeType))fail('NOT_FOUND');
   const bytes=await blobs.read(object.storageKey);
   if(bytes.length!==object.byteLength||sha256MediaBytes(bytes)!==object.contentSha256)fail('NOT_FOUND');
   await audit('media',id,objectId);return {bytes,mimeType:object.mimeType};
  });},
  decide(id:string,input:{action:unknown;reason:unknown;version:unknown}){return repo.withTransaction(async tx=>{
   if(typeof input.action!=='string'||!['keep','restrict','restrict-author','release-author'].includes(input.action)||typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>1000||typeof input.version!=='string')fail('BAD_REQUEST');
   const d=await detail(tx,id);if(d.version!==input.version)fail('CONFLICT');
   const common={reportId:id,operator,reason:input.reason.trim(),now:now().toISOString()};
   if(input.action==='restrict-author'||input.action==='release-author')await restrictReportedAuthor(tx,{...common,restricted:input.action==='restrict-author'});
   else await reviewSafetyReport(tx,{...common,hide:input.action==='restrict'});
   await audit(String(input.action),id);return detail(tx,id);
  });},
  history(id:string){return repo.withTransaction(async tx=>{const r=await tx.findSafetyReport(id);if(!r)fail('NOT_FOUND');await audit('history',id);
   const share=await db.getAll<{json:string}>('SELECT json FROM family_moderation_audit WHERE share_id=? ORDER BY sequence DESC LIMIT 50',[r.shareId]);
   const author=await db.getAll<{json:string}>('SELECT json FROM family_sharing_restriction_audit WHERE user_id=? ORDER BY sequence DESC LIMIT 50',[r.authorUserId]);
   return {events:[...share.map(r=>({...JSON.parse(r.json),kind:'share'})),...author.map(r=>({...JSON.parse(r.json),kind:'author'}))].map(r=>({kind:r.kind,operator:r.operator,reason:r.reason,at:r.updatedAt,restricted:r.kind==='share'?r.hidden:r.restricted})).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,50)};
  });},
  loginAudit(event:'login'|'logout'){return repo.withTransaction(async()=>{await audit(event);});},
  prune(){return repo.withTransaction(async()=>{await db.run('DELETE FROM family_admin_audit WHERE at<?',[new Date(now().getTime()-30*86400000).toISOString()]);});},
 };
}
