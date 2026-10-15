import { createHash } from 'node:crypto';
import { FamilyError } from './errors';
import { requireFamilyReadPolicy } from './history-policy';
import type { FamilyTx } from './repository';
import type { FamilyClock, ShareRecord, ShareView } from './types';
import { FAMILY_ALBUM_CONFIRMATION, FAMILY_ALBUM_RULE_VERSION, type FamilyAlbumAccess, type FamilyAlbumApi, type FamilyAlbumRecord, type FamilyAlbumView } from './family-album-types';
const MAX_CONTENT_BYTES=8*1024*1024;
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fail(code:string):never {throw new FamilyError(code,code);}
function id(value:unknown):asserts value is string {if(typeof value!=='string'||!value.trim()||value.length>150||/[\s/\\]/.test(value)) fail('BAD_REQUEST');}
function name(value:unknown):asserts value is string {if(typeof value!=='string'||!value.trim()||value.length>200)fail('BAD_REQUEST');}
function opening(value:unknown) {if(value!==null&&(typeof value!=='string'||value.length>20000))fail('BAD_REQUEST');}
export function createFamilyAlbumCommands(deps:{
  enabled:boolean; clock:FamilyClock;
  authed<T>(session:string,work:(tx:FamilyTx,userId:string)=>Promise<T>):Promise<T>;
}):FamilyAlbumApi {
  async function access(tx:FamilyTx,familyId:string,userId:string):Promise<FamilyAlbumAccess> {
    id(familyId);
    await requireFamilyReadPolicy(tx,familyId,'family-history-v2');
    const membership=await tx.findActiveMembership(familyId,userId);
    if(!membership)fail('NOT_IN_FAMILY');
    const accepted=(await tx.listTransfers(familyId)).filter(row=>row.status==='accepted').map(row=>[row.transferId,row.revision,row.updatedAt]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
    const creator=(await tx.listActiveMembers(familyId)).find(row=>row.role==='creator');
    const authority=digest([membership.membershipId,creator?.membershipId??null,creator?.userId??null,accepted]);
    const notice=await tx.findFamilyAlbumNotice(familyId,membership.membershipId);
    return {familyId,userId,membershipId:membership.membershipId,role:membership.role,authority,
      rulesAcknowledged:notice?.version===FAMILY_ALBUM_RULE_VERSION&&notice.userId===userId,rulesVersion:1,
      canManage:membership.role==='creator',canExport:false};
  }
  function authed<T>(session:string,work:(tx:FamilyTx,userId:string)=>Promise<T>) {
    if(!deps.enabled) return Promise.reject(new FamilyError('FAMILY_ALBUMS_CLOSED','FAMILY_ALBUMS_CLOSED'));
    return deps.authed(session,work);
  }
  function acknowledged(view:FamilyAlbumAccess) {if(!view.rulesAcknowledged)fail('FAMILY_ALBUM_RULES_REQUIRED');}
  function creator(view:FamilyAlbumAccess,authority:unknown) {
    acknowledged(view);if(!view.canManage)fail('FORBIDDEN');
    if(typeof authority!=='string'||view.authority!==authority)fail('FAMILY_ALBUM_AUTHORITY_CHANGED');
  }
  async function album(tx:FamilyTx,familyId:string,albumId:string) {
    id(albumId);const row=await tx.findFamilyAlbum(albumId);
    if(!row||row.familyId!==familyId)fail('FAMILY_ALBUM_NOT_FOUND');return row;
  }
  async function visible(tx:FamilyTx,familyId:string,shareId:string) {
    const share=await tx.findShare(shareId);
    return share?.familyId===familyId&&share.status==='active'?share:null;
  }
  async function shareView(tx:FamilyTx,row:ShareRecord):Promise<ShareView> {
    return {shareId:row.shareId,familyId:row.familyId,authorUserId:row.authorUserId,authorNickname:(await tx.findProfile(row.authorUserId))?.nickname??'',
      sourceMomentId:row.sourceMomentId,sourceRevision:row.sourceRevision,snapshot:JSON.parse(JSON.stringify(row.snapshot)),audienceUserIds:[...row.audienceUserIds],sharedAt:row.sharedAt,stored:'server'};
  }
  async function view(tx:FamilyTx,row:FamilyAlbumRecord,permission:FamilyAlbumAccess):Promise<FamilyAlbumView> {
    let contentBytes=Buffer.byteLength(row.name+(row.opening??''),'utf8');
    const items:FamilyAlbumView['items']=[];let cover:FamilyAlbumView['cover']=null;
    for(const shareId of row.shareIds) {
      const share=await visible(tx,row.familyId,shareId);
      if(!share) {items.push({shareId,status:'withdrawn'});continue;}
      contentBytes+=Buffer.byteLength(JSON.stringify(share.snapshot),'utf8');if(contentBytes>MAX_CONTENT_BYTES)fail('FAMILY_ALBUM_TOO_LARGE');
      const snapshot=await shareView(tx,share);items.push({shareId,status:'active',share:snapshot});
      if(!cover)for(const media of snapshot.snapshot.media) {
        const object=await tx.findMediaObject(media.objectId);
        if(object&&object.ownerUserId===share.authorUserId&&object.mimeType.startsWith('image/')) {cover={shareId,objectId:object.objectId};break;}
      }
    }
    const {shareIds: _references,...metadata}=row;void _references;
    return {...metadata,access:permission,items,cover,validation:digest([metadata,permission,items,cover])};
  }
  return {
    access(session,familyId) {return authed(session,(tx,userId)=>access(tx,familyId,userId));},
    acknowledge(session,familyId,membershipId,confirmation) {return authed(session,async(tx,userId)=>{
      const permission=await access(tx,familyId,userId);
      if(confirmation!==FAMILY_ALBUM_CONFIRMATION)fail('BAD_REQUEST');
      if(permission.membershipId!==membershipId)fail('CONFLICT');
      if(!permission.rulesAcknowledged)await tx.saveFamilyAlbumNotice({familyId,membershipId,userId,version:1,acceptedAt:deps.clock.now().toISOString()});
      return access(tx,familyId,userId);
    });},
    list(session,familyId) {return authed(session,async(tx,userId)=>{
      const permission=await access(tx,familyId,userId);acknowledged(permission);
      const rows=await tx.listFamilyAlbums(familyId);
      return {access:permission,albums:rows.map(({shareIds,...row})=>({...row,entryCount:shareIds.length}))};
    });},
    sources(session,familyId) {return authed(session,async(tx,userId)=>{
      const permission=await access(tx,familyId,userId);acknowledged(permission);
      const rows=(await tx.listSharesInFamily(familyId)).filter(row=>row.status==='active').sort((a,b)=>a.sharedAt.localeCompare(b.sharedAt)||a.shareId.localeCompare(b.shareId));
      if(rows.length>2000||rows.reduce((bytes,row)=>bytes+Buffer.byteLength(JSON.stringify(row.snapshot),'utf8'),0)>MAX_CONTENT_BYTES)fail('FAMILY_ALBUM_TOO_LARGE');
      return {access:permission,shares:await Promise.all(rows.map(row=>shareView(tx,row)))};
    });},
    create(session,familyId,input) {return authed(session,async(tx,userId)=>{
      const permission=await access(tx,familyId,userId);creator(permission,input?.authority);
      id(input.requestId);name(input.name);opening(input.opening);
      const albumId=`fa_${digest([familyId,userId,input.requestId])}`;
      const existing=await tx.findFamilyAlbum(albumId);
      if(existing) {if(existing.familyId!==familyId||existing.name!==input.name.trim()||existing.opening!==input.opening)fail('CONFLICT');return view(tx,existing,permission);}
      if((await tx.listFamilyAlbums(familyId)).length>=100)fail('FAMILY_ALBUM_TOO_LARGE');
      const now=deps.clock.now().toISOString();const row={albumId,familyId,name:input.name.trim(),opening:input.opening,shareIds:[],revision:1,createdAt:now,updatedAt:now};
      await tx.saveFamilyAlbum(row);return view(tx,row,permission);
    });},
    read(session,familyId,albumId) {return authed(session,async(tx,userId)=>{
      const permission=await access(tx,familyId,userId);acknowledged(permission);return view(tx,await album(tx,familyId,albumId),permission);
    });},
    validate(session,familyId,albumId,validation) {return authed(session,async(tx,userId)=>{
      const permission=await access(tx,familyId,userId);acknowledged(permission);
      if((await view(tx,await album(tx,familyId,albumId),permission)).validation!==validation)fail('FAMILY_ALBUM_CHANGED');return {valid:true};
    });},
    mutate(session,familyId,albumId,input) {return authed(session,async(tx,userId)=>{
      const permission=await access(tx,familyId,userId);creator(permission,input?.authority);
      const row=await album(tx,familyId,albumId);
      if(!Number.isInteger(input.revision)||row.revision!==input.revision)fail('FAMILY_ALBUM_CHANGED');
      const change=input.change;if(!change||typeof change!=='object')fail('BAD_REQUEST');
      if(change.kind==='collect') {
        const candidates=change.shareIds==='all'?(await tx.listSharesInFamily(familyId)).filter(row=>row.status==='active').sort((a,b)=>a.sharedAt.localeCompare(b.sharedAt)||a.shareId.localeCompare(b.shareId)).map(row=>row.shareId):change.shareIds;
        if(!Array.isArray(candidates)||candidates.length>2000||new Set(candidates).size!==candidates.length)fail('BAD_REQUEST');
        for(const shareId of candidates) {id(shareId);if(!await visible(tx,familyId,shareId))fail('SHARE_NOT_FOUND');}
        row.shareIds=[...new Set([...row.shareIds,...candidates])];
      } else if(change.kind==='remove') {id(change.shareId);row.shareIds=row.shareIds.filter(id=>id!==change.shareId);}
      else if(change.kind==='reorder') {
        if(!Array.isArray(change.shareIds)||change.shareIds.length!==row.shareIds.length||new Set(change.shareIds).size!==row.shareIds.length||change.shareIds.some(id=>!row.shareIds.includes(id)))fail('BAD_REQUEST');
        row.shareIds=[...change.shareIds];
      } else if(change.kind==='rename') {name(change.name);opening(change.opening);row.name=change.name.trim();row.opening=change.opening;}
      else fail('BAD_REQUEST');
      if(row.shareIds.length>2000)fail('FAMILY_ALBUM_TOO_LARGE');
      row.revision++;row.updatedAt=deps.clock.now().toISOString();const result=await view(tx,row,permission);await tx.saveFamilyAlbum(row);return result;
    });},
  };
}
