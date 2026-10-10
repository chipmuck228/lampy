import { createFamilyCommands } from '../family-api/commands';
import { createFamilyStore } from '../family-api/store';
import { createMapAppleVerifier } from '../family-api/apple';
import { dispatchFamilyApi } from '../family-api/http';
import { sampleJpegBytes } from '../family-api/media-validate';
import { createFamilyApiClient, createDispatchTransport } from '../infrastructure/family-http-client';
import { createMemoryFamilyReceiveCache } from '../infrastructure/family-receive-cache';
import { createPendingFamilyOperationDisk, createPendingFamilyOperationStore } from '../infrastructure/pending-family-operations';
import { createMemoryFamilySessionStore } from './family-use-cases';
import { createDraftMoment, activateMoment } from '../domain-adapters/moment-commands';
import { createAsset } from '../domain-adapters/asset-commands';
import { createFamilyHistoryUseCases, HISTORY_AUDIENCE_CONFIRMATION } from './family-history-use-cases';
import type { FamilyTransportRequest } from '../infrastructure/family-http-client';
import { ApplicationError } from './errors';

function deferred<T>() { let resolve!: (value:T)=>void; const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve}; }
async function fixture() {
  const commands=createFamilyCommands({store:createFamilyStore(),apple:createMapAppleVerifier({a:{appleSubject:'a'},b:{appleSubject:'b'}}),historySharingEnabled:true,inviteLinksEnabled:true});
  const a=await commands.signInWithApple('a'),b=await commands.signInWithApple('b');
  const f=await commands.createNamedFamily(a.sessionToken,'Window','family-d2');
  const session=createMemoryFamilySessionStore();await session.setSession(a);
  const requests:FamilyTransportRequest[]=[];
  const transport=createDispatchTransport(r=>dispatchFamilyApi(commands,r));
  const client=createFamilyApiClient({request:r=>{requests.push(r);return transport.request(r);}});
  const cache=createMemoryFamilyReceiveCache();
  let moment=activateMoment(createDraftMoment({id:'moment_d2',ownerId:'local-user',content:{note:'A quiet morning',emotion:'平静'}}, {now:()=>new Date('2026-10-09T00:00:00Z')}),'local-user','2026-10-09T00:00:00Z');
  const asset=createAsset({id:'asset_d2',ownerId:'local-user',type:'image',localUri:'file:///personal/photo.jpg',metadata:{mimeType:'image/jpeg'}},{now:()=>new Date('2026-10-09T00:00:00Z')});
  const personal={moments:{findById:jest.fn(async()=>({kind:'ready' as const,moment}))},assets:{findById:jest.fn(async()=>({kind:'ready' as const,asset}))},readAssetBytes:jest.fn(async()=>sampleJpegBytes())};
  const history=createFamilyHistoryUseCases({client,session,pending:createPendingFamilyOperationStore(createPendingFamilyOperationDisk()),personal,receiveCache:cache,mediaUri:key=>`file:///family-cache/${key}`});
  return {commands,a,b,f,session,client,cache,personal,history,requests,attach:()=>{moment={...moment,assetIds:['asset_d2']};},change:()=>{moment={...moment,revision:moment.revision+1,content:{...moment.content,note:'changed'}};}};
}
const current=()=>true;
it('requires explicit consent, binds a target, retries once and sends only the snapshot whitelist',async()=>{
  const x=await fixture();x.attach();
  const preview=await x.history.prepare('moment_d2',x.f.familyId,current);
  await expect(x.history.share(preview,'',current)).rejects.toMatchObject({code:'BAD_REQUEST'});
  const first=await x.history.share(preview,HISTORY_AUDIENCE_CONFIRMATION,current);
  const again=await x.history.share(preview,HISTORY_AUDIENCE_CONFIRMATION,current);
  expect(again.shareId).toBe(first.shareId);
  const body=x.requests.find(r=>r.method==='POST'&&r.path.endsWith('/shares'))!.body;
  expect(Object.keys(body as object).sort()).toEqual(['audienceConfirmation','emotion','expectedMediaCount','mediaObjectIds','note','occurredAt','occurredAtPrecision','sourceMomentId','sourceRevision'].sort());
  expect(JSON.stringify(body)).not.toMatch(/localUri|personal\/|context|people|accessSummary/);
  expect((await x.commands.historyShares.listVisibleShares(x.a.sessionToken,x.f.familyId)).shares).toHaveLength(1);
});
it('does not upload media explicitly left out, even when that file is unreadable',async()=>{
  const x=await fixture();x.attach();x.personal.readAssetBytes.mockRejectedValue(new Error('missing'));
  const all=await x.history.prepare('moment_d2',x.f.familyId,current);
  expect(all.media[0].ready).toBe(false);
  await expect(x.history.share(all,HISTORY_AUDIENCE_CONFIRMATION,current)).rejects.toMatchObject({code:'SHARE_MEDIA_INCOMPLETE'});
  const text=await x.history.prepare('moment_d2',x.f.familyId,current,[]);
  const saved=await x.history.share(text,HISTORY_AUDIENCE_CONFIRMATION,current);
  expect(saved.snapshot.media).toHaveLength(0);expect(x.requests.filter(r=>r.path==='/v1/media')).toHaveLength(0);
});
it('rechecks revision after upload and never saves a mixed snapshot',async()=>{
  const x=await fixture();x.attach();const preview=await x.history.prepare('moment_d2',x.f.familyId,current);
  const upload=x.client.uploadMedia;x.client.uploadMedia=async(...args)=>{const result=await upload(...args);x.change();return result;};
  await expect(x.history.share(preview,HISTORY_AUDIENCE_CONFIRMATION,current)).rejects.toMatchObject({code:'SOURCE_CHANGED'});
  expect(x.requests.filter(r=>r.method==='POST'&&r.path.endsWith('/shares'))).toHaveLength(0);
});
it('rechecks media bytes after upload even if revision is unchanged',async()=>{
  const x=await fixture();x.attach();const preview=await x.history.prepare('moment_d2',x.f.familyId,current);
  const upload=x.client.uploadMedia;x.client.uploadMedia=async(...args)=>{const result=await upload(...args);x.personal.readAssetBytes.mockResolvedValue(new Uint8Array([1,2,3]));return result;};
  await expect(x.history.share(preview,HISTORY_AUDIENCE_CONFIRMATION,current)).rejects.toMatchObject({code:'SOURCE_CHANGED'});
  expect(x.requests.filter(r=>r.method==='POST'&&r.path.endsWith('/shares'))).toHaveLength(0);
});
it.each(['account','focus','lock'] as const)('does not send a share after %s changes during upload',async(kind)=>{
  const x=await fixture();x.attach();let eligible=true;
  const active=()=>eligible;const preview=await x.history.prepare('moment_d2',x.f.familyId,active);
  const upload=x.client.uploadMedia;x.client.uploadMedia=async(...args)=>{const result=await upload(...args);if(kind==='account')await x.session.setSession(x.b);else eligible=false;return result;};
  await expect(x.history.share(preview,HISTORY_AUDIENCE_CONFIRMATION,active)).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
  expect(x.requests.filter(r=>r.method==='POST'&&r.path.endsWith('/shares'))).toHaveLength(0);
});
it('rejects caller mutation of the confirmed family',async()=>{
  const x=await fixture();const p=await x.history.prepare('moment_d2',x.f.familyId,current);
  p.family={...p.family,familyId:'another'};
  await expect(x.history.share(p,HISTORY_AUDIENCE_CONFIRMATION,current)).rejects.toMatchObject({code:'BAD_REQUEST'});
});
it('lets a later member read historical bytes, isolates by account/family, then denies cached playback after revoke',async()=>{
  const x=await fixture();x.attach();const p=await x.history.prepare('moment_d2',x.f.familyId,current);
  const saved=await x.history.share(p,HISTORY_AUDIENCE_CONFIRMATION,current);
  const invite=await x.commands.createInviteLink(x.a.sessionToken,x.f.familyId);
  await x.commands.acceptInviteLink(x.b.sessionToken,invite.token);
  await x.session.setSession(x.b);
  const list=await x.history.list(x.f.familyId,current);expect(list.shares[0].shareId).toBe(saved.shareId);
  const read=await x.history.read(x.f.familyId,saved.shareId,current);
  expect(read.media[0].uri).toContain(`${x.b.userId}/${x.f.familyId}/${saved.shareId}`);
  expect(x.cache.shares.every(s=>s.userId===x.b.userId)).toBe(true);
  await x.commands.historyShares.revokeShare(x.a.sessionToken,x.f.familyId,saved.shareId);
  await expect(x.history.authorize(x.f.familyId,saved.shareId,current)).rejects.toMatchObject({code:'SHARE_NOT_FOUND'});
  expect(await x.cache.find(x.b.userId,x.f.familyId,saved.shareId)).toBeNull();
});
it('does not publish a late list or write cache after switching account',async()=>{
  const x=await fixture();const p=await x.history.prepare('moment_d2',x.f.familyId,current);
  const saved=await x.history.share(p,HISTORY_AUDIENCE_CONFIRMATION,current);
  const gate=deferred<{shares:typeof saved[]}>();x.client.history!.listVisibleShares=()=>gate.promise;
  const work=x.history.list(x.f.familyId,current);await new Promise(r=>setTimeout(r,0));await x.session.setSession(x.b);gate.resolve({shares:[saved]});
  await expect(work).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});expect(x.cache.shares).toHaveLength(0);
});
it('cleans a cache write that finishes after account switch without touching another account',async()=>{
  const x=await fixture();x.attach();const p=await x.history.prepare('moment_d2',x.f.familyId,current);
  const saved=await x.history.share(p,HISTORY_AUDIENCE_CONFIRMATION,current);
  const original=x.cache.saveStoredMedia;const started=deferred<void>(),finish=deferred<void>();
  x.cache.saveStoredMedia=async input=>{started.resolve();await finish.promise;return original(input);};
  const read=x.history.read(x.f.familyId,saved.shareId,current);await started.promise;await x.session.setSession(x.b);finish.resolve();
  await expect(read).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
  expect(x.cache.shares).toHaveLength(0);expect(x.cache.files.size).toBe(0);
});
it('never reads cached rows as an offline authorization and retries the same share after a lost response',async()=>{
  const x=await fixture();const p=await x.history.prepare('moment_d2',x.f.familyId,current);
  const send=x.client.history!.shareMoment;let first=true;
  x.client.history!.shareMoment=async(...args)=>{const result=await send(...args);if(first){first=false;throw new ApplicationError('NETWORK','lost response');}return result;};
  await expect(x.history.share(p,HISTORY_AUDIENCE_CONFIRMATION,current)).rejects.toMatchObject({code:'NETWORK'});
  const saved=await x.history.share(p,HISTORY_AUDIENCE_CONFIRMATION,current);
  expect((await x.history.list(x.f.familyId,current)).shares).toHaveLength(1);
  x.client.history!.getShare=async()=>{throw new ApplicationError('NETWORK','offline');};
  await expect(x.history.read(x.f.familyId,saved.shareId,current)).rejects.toMatchObject({code:'NETWORK'});
});

it('uploads converted HEIC as validated JPEG without changing the personal asset',async()=>{
  const x=await fixture();x.attach();
  const original=(await x.personal.assets.findById()).asset;
  original.metadata.mimeType='image/heic';
  const heic=new Uint8Array([0,0,0,24,102,116,121,112,104,101,105,99]);
  x.personal.readAssetBytes.mockResolvedValue(heic);
  const convert=jest.fn(async()=>({bytes:sampleJpegBytes(),mimeType:'image/jpeg'}));
  const history=createFamilyHistoryUseCases({client:x.client,session:x.session,pending:createPendingFamilyOperationStore(createPendingFamilyOperationDisk()),personal:{...x.personal,convertImageForShare:convert},receiveCache:x.cache});
  const p=await history.prepare('moment_d2',x.f.familyId,current);
  const saved=await history.share(p,HISTORY_AUDIENCE_CONFIRMATION,current);
  expect(convert).toHaveBeenCalledWith(heic,'image/heic');
  expect(saved.snapshot.media[0].mimeType).toBe('image/jpeg');
  expect(original.metadata.mimeType).toBe('image/heic');
  expect(x.requests.find(r=>r.path==='/v1/media')!.bytes).toEqual(sampleJpegBytes());
});
it('rejects fake JPEG relabelling and never posts a share',async()=>{
  const x=await fixture();x.attach();(await x.personal.assets.findById()).asset.metadata.mimeType='image/heic';
  const history=createFamilyHistoryUseCases({client:x.client,session:x.session,pending:createPendingFamilyOperationStore(createPendingFamilyOperationDisk()),personal:{...x.personal,convertImageForShare:async()=>({bytes:new Uint8Array([1,2,3]),mimeType:'image/jpeg'})}});
  const p=await history.prepare('moment_d2',x.f.familyId,current);
  await expect(history.share(p,HISTORY_AUDIENCE_CONFIRMATION,current)).rejects.toMatchObject({code:'MEDIA_CORRUPT'});
  expect(x.requests.some(r=>r.path==='/v1/media')).toBe(false);
});
it('drops a conversion completed after background cancellation',async()=>{
  const x=await fixture();x.attach();(await x.personal.assets.findById()).asset.metadata.mimeType='image/heic';
  const started=deferred<void>(),gate=deferred<{bytes:Uint8Array;mimeType:string}>();let active=true;
  const history=createFamilyHistoryUseCases({client:x.client,session:x.session,pending:createPendingFamilyOperationStore(createPendingFamilyOperationDisk()),personal:{...x.personal,convertImageForShare:async()=>{started.resolve();return gate.promise;}}});
  const p=await history.prepare('moment_d2',x.f.familyId,()=>active);
  const sharing=history.share(p,HISTORY_AUDIENCE_CONFIRMATION,()=>active);await started.promise;active=false;gate.resolve({bytes:sampleJpegBytes(),mimeType:'image/jpeg'});
  await expect(sharing).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
  expect(x.requests.some(r=>r.path==='/v1/media')).toBe(false);
});

it('E1 leaves only the chosen family, clears its media and retains other-family and personal data', async () => {
 const x=await fixture();x.attach();
 const first=await x.history.share(await x.history.prepare('moment_d2',x.f.familyId,current),HISTORY_AUDIENCE_CONFIRMATION,current);
 const invite=await x.commands.createInviteLink(x.a.sessionToken,x.f.familyId);await x.commands.acceptInviteLink(x.b.sessionToken,invite.token);
 const other=await x.commands.createNamedFamily(x.b.sessionToken,'Other','other');
 await x.session.setSession(x.b);
 const second=await x.history.share(await x.history.prepare('moment_d2',other.familyId,current),HISTORY_AUDIENCE_CONFIRMATION,current);
 await x.history.read(x.f.familyId,first.shareId,current);await x.history.read(other.familyId,second.shareId,current);
 const roster=await x.history.getMembers(x.f.familyId,current);
 await x.history.leaveFamily(roster,current);
 expect(await x.cache.find(x.b.userId,x.f.familyId,first.shareId)).toBeNull();
 expect(await x.cache.find(x.b.userId,other.familyId,second.shareId)).not.toBeNull();
 expect([...x.cache.files.keys()].every(key=>!key.includes(x.f.familyId))).toBe(true);
 expect((await x.personal.moments.findById()).moment.content.note).toBe('A quiet morning');
 expect((await x.personal.assets.findById()).asset.localUri).toBe('file:///personal/photo.jpg');
});
it('E1 cleans the entire denied family on a removed-member detail read, but not another family', async () => {
 const x=await fixture();x.attach();
 const share=await x.history.share(await x.history.prepare('moment_d2',x.f.familyId,current),HISTORY_AUDIENCE_CONFIRMATION,current);
 const invite=await x.commands.createInviteLink(x.a.sessionToken,x.f.familyId);await x.commands.acceptInviteLink(x.b.sessionToken,invite.token);
 const other=await x.commands.createNamedFamily(x.b.sessionToken,'Other','other');
 await x.session.setSession(x.b); await x.history.read(x.f.familyId,share.shareId,current);
 await x.cache.upsertListed(x.b.userId,{...share,familyId:other.familyId,shareId:'other-share'});
 const roster=await x.commands.getFamilyRoster(x.a.sessionToken,x.f.familyId),member=roster.members.find(m=>m.userId===x.b.userId)!;
 await x.commands.removeSelectedMember(x.a.sessionToken,x.f.familyId,x.b.userId,member.membershipId);
 await expect(x.history.read(x.f.familyId,share.shareId,current)).rejects.toMatchObject({code:'NOT_IN_FAMILY'});
 expect(await x.cache.list(x.b.userId,x.f.familyId)).toEqual([]);expect(x.cache.files.size).toBe(0);
 expect(await x.cache.find(x.b.userId,other.familyId,'other-share')).not.toBeNull();
});
it('E1 rejects old-account member confirmation and invalidates a late list after leaving', async () => {
 const x=await fixture();const invite=await x.commands.createInviteLink(x.a.sessionToken,x.f.familyId);await x.commands.acceptInviteLink(x.b.sessionToken,invite.token);
 await x.session.setSession(x.b);const roster=await x.history.getMembers(x.f.familyId,current);
 await x.session.setSession(x.a);await expect(x.history.leaveFamily(roster,current)).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
 await x.session.setSession(x.b);
 const gate=deferred<{shares:[]}>();x.client.history!.listVisibleShares=()=>gate.promise;
 const pending=x.history.list(x.f.familyId,current);await new Promise(r=>setTimeout(r,0));
 await x.history.leaveFamily(await x.history.getMembers(x.f.familyId,current),current);
 gate.resolve({shares:[]});await expect(pending).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
 expect(await x.cache.list(x.b.userId,x.f.familyId)).toEqual([]);
});
it('E1 directory reconciliation also rejects a departed family list delayed before its first cache write', async () => {
 const x=await fixture();const invite=await x.commands.createInviteLink(x.a.sessionToken,x.f.familyId);await x.commands.acceptInviteLink(x.b.sessionToken,invite.token);
 await x.session.setSession(x.b);
 const gate=deferred<{shares:[]}>();x.client.history!.listVisibleShares=()=>gate.promise;
 const work=x.history.list(x.f.familyId,current);await new Promise(r=>setTimeout(r,0));
 const roster=await x.commands.getFamilyRoster(x.b.sessionToken,x.f.familyId);
 await x.commands.leaveSelectedFamily(x.b.sessionToken,x.f.familyId,roster.membershipId);
 await x.history.reconcileFamilies(x.b.userId,[],current);
 gate.resolve({shares:[]});await expect(work).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
 expect(await x.cache.listFamilyIds!(x.b.userId)).toEqual([]);
});
it('denial invalidates a pending list before waiting for its cache write and keeps unrelated shares on FORBIDDEN', async () => {
 const x=await fixture();const share=await x.history.share(await x.history.prepare('moment_d2',x.f.familyId,current),HISTORY_AUDIENCE_CONFIRMATION,current);
 await x.cache.upsertListed(x.a.userId,{...share,shareId:'other-share'});
 const start=deferred<void>(),end=deferred<void>();const original=x.cache.replaceVisible.bind(x.cache);
 x.cache.replaceVisible=async (...args)=>{start.resolve();await end.promise;return original(...args);};
 const list=x.history.list(x.f.familyId,current);await start.promise;
 x.client.history!.getShare=async()=>{throw new ApplicationError('NOT_IN_FAMILY','removed');};
 const denied=x.history.authorize(x.f.familyId,share.shareId,current).catch(e=>e);
 await new Promise(r=>setTimeout(r,0));end.resolve();await expect(list).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});expect((await denied).code).toBe('NOT_IN_FAMILY');expect(await x.cache.list(x.a.userId,x.f.familyId)).toEqual([]);
 await x.cache.upsertListed(x.a.userId,share);await x.cache.upsertListed(x.a.userId,{...share,shareId:'other-share'});
 x.client.history!.getShare=async()=>{throw new ApplicationError('FORBIDDEN','one share');};
 await expect(x.history.authorize(x.f.familyId,share.shareId,current)).rejects.toMatchObject({code:'FORBIDDEN'});
 expect(await x.cache.find(x.a.userId,x.f.familyId,share.shareId)).toBeNull();expect(await x.cache.find(x.a.userId,x.f.familyId,'other-share')).not.toBeNull();
});
it('E2 preserves valid history and personal sources, binds transfer actions to the exact account and requires an explicit response', async () => {
 const x=await fixture();x.attach();const share=await x.history.share(await x.history.prepare('moment_d2',x.f.familyId,current),HISTORY_AUDIENCE_CONFIRMATION,current);
 const invite=await x.commands.createInviteLink(x.a.sessionToken,x.f.familyId);await x.commands.acceptInviteLink(x.b.sessionToken,invite.token);
 const ar=await x.history.getMembers(x.f.familyId,current),target=ar.members.find(m=>m.userId===x.b.userId)!;
 const transfer=await x.history.createCreatorTransfer(ar,target.membershipId,'e2-intent',current);
 expect((await x.commands.getFamilyRoster(x.a.sessionToken,x.f.familyId)).role).toBe('creator');
 await x.session.setSession(x.b);
 await expect(x.history.respondCreatorTransfer(ar,transfer,'cancel',current)).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
 const br=await x.history.getMembers(x.f.familyId,current),pending=await x.history.getCreatorTransfer(br,current);
 await expect(x.history.respondCreatorTransfer(br,{...pending!},'accept',current)).rejects.toMatchObject({code:'FORBIDDEN'});
 expect((await x.history.read(x.f.familyId,share.shareId,current)).share.snapshot.note).toBe('A quiet morning');
 await x.history.respondCreatorTransfer(br,pending!,'accept',current);
 expect((await x.commands.getFamilyRoster(x.b.sessionToken,x.f.familyId)).role).toBe('creator');
 expect((await x.history.read(x.f.familyId,share.shareId,current)).share.shareId).toBe(share.shareId);
 expect((await x.personal.assets.findById()).asset.localUri).toBe('file:///personal/photo.jpg');
});
it('E2 rejects transfer reads completed after an account switch and sends no stale confirmation',async()=>{
 const x=await fixture();const roster=await x.history.getMembers(x.f.familyId,current);
 const gate=deferred<{transfer:null}>();x.client.getCreatorTransfer=()=>gate.promise;
 const reading=x.history.getCreatorTransfer(roster,current);await new Promise(r=>setTimeout(r,0));
 await x.session.setSession(x.b);gate.resolve({transfer:null});await expect(reading).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
 x.client.createCreatorTransfer=jest.fn();await expect(x.history.createCreatorTransfer(roster,'not-a-member','intent',current)).rejects.toMatchObject({code:'FORBIDDEN'});expect(x.client.createCreatorTransfer).not.toHaveBeenCalled();
});
