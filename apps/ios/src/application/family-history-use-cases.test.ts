import { createFamilyCommands } from '../family-api/commands';
import { createFamilyStore } from '../family-api/store';
import { createMapAppleVerifier } from '../family-api/apple';
import { dispatchFamilyApi } from '../family-api/http';
import { sampleJpegBytes, sampleAudioBytes } from '../family-api/media-validate';
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
it('prepares a metadata-bearing JPEG copy before history upload, preserves the private source and aborts on a late conversion',async()=>{
  const x=await fixture();x.attach();
  const plain=sampleJpegBytes(), source=new Uint8Array([255,216,255,225,0,10,69,120,105,102,0,0,1,2,...plain.subarray(2)]);
  x.personal.readAssetBytes.mockResolvedValue(source);
  const convert=jest.fn(async()=>({bytes:plain,mimeType:'image/jpeg'}));
  const history=createFamilyHistoryUseCases({client:x.client,session:x.session,pending:createPendingFamilyOperationStore(createPendingFamilyOperationDisk()),personal:{...x.personal,convertImageForShare:convert}});
  const p=await history.prepare('moment_d2',x.f.familyId,current);
  await history.share(p,HISTORY_AUDIENCE_CONFIRMATION,current);
  expect(convert).toHaveBeenCalledWith(source,'image/jpeg');expect(x.requests.find(r=>r.path==='/v1/media')!.bytes).toEqual(plain);
  expect(source[3]).toBe(225);expect(x.personal.assets.findById.mock.results[0]).toBeDefined();
  let active=true;
  const cancelled=createFamilyHistoryUseCases({client:x.client,session:x.session,pending:createPendingFamilyOperationStore(createPendingFamilyOperationDisk()),personal:{...x.personal,convertImageForShare:async()=>{active=false;return {bytes:plain,mimeType:'image/jpeg'};}}});
  const cp=await cancelled.prepare('moment_d2',x.f.familyId,()=>active), before=x.requests.filter(r=>r.path==='/v1/media').length;
  await expect(cancelled.share(cp,HISTORY_AUDIENCE_CONFIRMATION,()=>active)).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
  expect(x.requests.filter(r=>r.path==='/v1/media')).toHaveLength(before);
});
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
  const received=await history.read(x.f.familyId,saved.shareId,current);
  expect(received.media).toHaveLength(1);
  expect(received.media[0].mimeType).toBe('image/jpeg');
  expect(x.requests.find(r=>r.path==='/v1/media')!.bytes).toEqual(sampleJpegBytes());
});
it('rejects fake JPEG relabelling and never posts a share',async()=>{
  const x=await fixture();x.attach();(await x.personal.assets.findById()).asset.metadata.mimeType='image/heic';
  const history=createFamilyHistoryUseCases({client:x.client,session:x.session,pending:createPendingFamilyOperationStore(createPendingFamilyOperationDisk()),personal:{...x.personal,convertImageForShare:async()=>({bytes:new Uint8Array([1,2,3]),mimeType:'image/jpeg'})}});
  const p=await history.prepare('moment_d2',x.f.familyId,current);
  await expect(history.share(p,HISTORY_AUDIENCE_CONFIRMATION,current)).rejects.toMatchObject({code:'SHARE_IMAGE_CONVERSION_FAILED'});
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

it('E3 dissolve binds the creator roster, retires only that family cache, rejects late reads and leaves personal data untouched',async()=>{
 const x=await fixture();x.attach();
 const shared=await x.history.share(await x.history.prepare('moment_d2',x.f.familyId,current),HISTORY_AUDIENCE_CONFIRMATION,current);
 await x.history.read(x.f.familyId,shared.shareId,current);
 const other=await x.commands.createNamedFamily(x.a.sessionToken,'Other','other');
 await x.cache.upsertListed(x.a.userId,{...shared,familyId:other.familyId,shareId:'unrelated'});
 const roster=await x.history.getMembers(x.f.familyId,current);
 const gate=deferred<{shares:[]}>();x.client.history!.listVisibleShares=()=>gate.promise;
 const reading=x.history.list(x.f.familyId,current);await new Promise(r=>setTimeout(r,0));
 await x.history.dissolveFamily(roster,current);
 gate.resolve({shares:[]});await expect(reading).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
 expect(await x.cache.list(x.a.userId,x.f.familyId)).toEqual([]);
 expect(await x.cache.find(x.a.userId,other.familyId,'unrelated')).not.toBeNull();
 expect((await x.personal.moments.findById()).moment.content.note).toBe('A quiet morning');
});
it('E3 rejects a member or old-account dissolution confirmation',async()=>{
 const x=await fixture();const invite=await x.commands.createInviteLink(x.a.sessionToken,x.f.familyId);await x.commands.acceptInviteLink(x.b.sessionToken,invite.token);
 const creator=await x.history.getMembers(x.f.familyId,current);
 await x.session.setSession(x.b);await expect(x.history.dissolveFamily(creator,current)).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
 const member=await x.history.getMembers(x.f.familyId,current);await expect(x.history.dissolveFamily(member,current)).rejects.toMatchObject({code:'FORBIDDEN'});
});
it('E3 a remote dissolve denies cached reading and removes the family cache on refresh',async()=>{
 const x=await fixture();const shared=await x.history.share(await x.history.prepare('moment_d2',x.f.familyId,current),HISTORY_AUDIENCE_CONFIRMATION,current);
 await x.history.list(x.f.familyId,current);expect(await x.cache.find(x.a.userId,x.f.familyId,shared.shareId)).not.toBeNull();
 await x.commands.dissolveFamily(x.a.sessionToken,x.f.familyId);
 await expect(x.history.read(x.f.familyId,shared.shareId,current)).rejects.toBeTruthy();
 expect(await x.cache.list(x.a.userId,x.f.familyId)).toEqual([]);
});

it('E3 getPolicy after remote dissolution rejects the real absent-list path and isolates cache',async()=>{
 const x=await fixture();await x.history.confirmPolicy(x.f.familyId,current);
 const preview=await x.history.prepare('moment_d2',x.f.familyId,current);const shared=await x.history.share(preview,HISTORY_AUDIENCE_CONFIRMATION,current);
 await x.history.read(x.f.familyId,shared.shareId,current);
 await x.commands.dissolveFamily(x.a.sessionToken,x.f.familyId);
 await expect(x.history.getPolicy(x.f.familyId,current)).rejects.toMatchObject({code:'NOT_IN_FAMILY'});
 expect(await x.cache.list(x.a.userId,x.f.familyId)).toEqual([]);
});

it('binds sharing nickname to the preparing account and rejects a delayed profile after account switch',async()=>{
 const x=await fixture();await x.commands.updateMyProfile(x.a.sessionToken,'小禾');
 const preview=await x.history.prepare('moment_d2',x.f.familyId,current);
 expect(preview.sharingNickname).toBe('小禾');expect(preview.userId).toBe(x.a.userId);
 const gate=deferred<Awaited<ReturnType<NonNullable<typeof x.client.getMyProfile>>>>();
 x.client.getMyProfile=()=>gate.promise;
 const pending=x.history.prepare('moment_d2',x.f.familyId,current);
 await new Promise(r=>setTimeout(r,0));await x.session.setSession(x.b);
 gate.resolve({userId:x.a.userId,nickname:'小禾',avatar:'system',updatedAt:null});
 await expect(pending).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
 await expect(x.history.share(preview,HISTORY_AUDIENCE_CONFIRMATION,current)).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
});
it('projects live share author nickname without copying profile into a moment snapshot or relaxing reads',async()=>{
 const x=await fixture();const preview=await x.history.prepare('moment_d2',x.f.familyId,current);
 const share=await x.history.share(preview,HISTORY_AUDIENCE_CONFIRMATION,current);
 expect(share.authorNickname).toBe('');
 await x.commands.updateMyProfile(x.a.sessionToken,'新昵称');
 const visible=await x.commands.historyShares.getShare(x.a.sessionToken,x.f.familyId,share.shareId);
 expect(visible.authorNickname).toBe('新昵称');expect(visible.authorUserId).toBe(x.a.userId);
 expect(JSON.stringify(visible.snapshot)).not.toMatch(/nickname|email/);
 await expect(x.commands.historyShares.getShare(x.b.sessionToken,x.f.familyId,share.shareId)).rejects.toMatchObject({code:'NOT_IN_FAMILY'});
 await x.commands.historyShares.revokeShare(x.a.sessionToken,x.f.familyId,share.shareId);
 await expect(x.commands.historyShares.getShare(x.a.sessionToken,x.f.familyId,share.shareId)).rejects.toMatchObject({code:'SHARE_NOT_FOUND'});
});
it('keeps same-nickname authors separate and retains a departed author on still-readable history',async()=>{
 const x=await fixture();const invite=await x.commands.createInviteLink(x.a.sessionToken,x.f.familyId);await x.commands.acceptInviteLink(x.b.sessionToken,invite.token);
 await x.commands.updateMyProfile(x.a.sessionToken,'同名');await x.commands.updateMyProfile(x.b.sessionToken,'同名');
 const a=await x.history.share(await x.history.prepare('moment_d2',x.f.familyId,current),HISTORY_AUDIENCE_CONFIRMATION,current);
 await x.session.setSession(x.b);
 const b=await x.history.share(await x.history.prepare('moment_d2',x.f.familyId,current),HISTORY_AUDIENCE_CONFIRMATION,current);
 expect(a.authorUserId).not.toBe(b.authorUserId);expect(a.shareId).not.toBe(b.shareId);
 const rows=await x.commands.historyShares.listVisibleShares(x.a.sessionToken,x.f.familyId);
 expect(rows.shares.map(s=>s.authorNickname)).toEqual(['同名','同名']);
 expect(JSON.stringify(rows)).not.toMatch(/email|password|sessionToken/);
 await expect(x.commands.historyShares.revokeShare(x.b.sessionToken,x.f.familyId,a.shareId)).rejects.toMatchObject({code:'FORBIDDEN'});
 const roster=await x.commands.getFamilyRoster(x.b.sessionToken,x.f.familyId);const own=roster.members.find(m=>m.userId===x.b.userId)!;
 await x.commands.leaveSelectedFamily(x.b.sessionToken,x.f.familyId,own.membershipId);
 expect((await x.commands.historyShares.getShare(x.a.sessionToken,x.f.familyId,b.shareId)).authorNickname).toBe('同名');
 await expect(x.commands.historyShares.getShare(x.b.sessionToken,x.f.familyId,b.shareId)).rejects.toMatchObject({code:'NOT_IN_FAMILY'});
});

it('keeps shared recording bytes and uses the stored m4a URI, including repair of old extensionless cache',async()=>{
 const x=await fixture();x.attach();const audio=createAsset({id:'asset_d2',ownerId:'local-user',type:'audio',localUri:'file:///personal/recording.m4a',metadata:{mimeType:'audio/mp4'}},{now:()=>new Date('2026-10-09T00:00:00Z')});x.personal.assets.findById.mockResolvedValue({kind:'ready',asset:audio});x.personal.readAssetBytes.mockResolvedValue(sampleAudioBytes());
 const preview=await x.history.prepare('moment_d2',x.f.familyId,current);const shared=await x.history.share(preview,HISTORY_AUDIENCE_CONFIRMATION,current);
 const invite=await x.commands.createInviteLink(x.a.sessionToken,x.f.familyId);await x.commands.acceptInviteLink(x.b.sessionToken,invite.token);await x.session.setSession(x.b);
 const read=await x.history.read(x.f.familyId,shared.shareId,current);expect(read.media[0].mimeType).toBe('audio/mp4');expect(read.media[0].uri).toMatch(/\.m4a$/);
 const stored=(await x.cache.listMedia(x.b.userId,x.f.familyId,shared.shareId))[0];expect(await x.cache.readMediaBytes(stored.storageKey)).toEqual(sampleAudioBytes());
 const legacy=stored.storageKey.replace(/\.m4a$/,'');x.cache.files.set(legacy,x.cache.files.get(stored.storageKey)!);x.cache.files.delete(stored.storageKey);stored.storageKey=legacy;
 const downloads=x.requests.filter(request=>request.path.endsWith('/content')).length;const repaired=await x.history.read(x.f.familyId,shared.shareId,current);
 expect(repaired.media[0].uri).toMatch(/\.m4a$/);expect(x.cache.files.has(legacy)).toBe(false);expect(x.requests.filter(request=>request.path.endsWith('/content')).length).toBe(downloads);
 await x.commands.historyShares.revokeShare(x.a.sessionToken,x.f.familyId,shared.shareId);await expect(x.history.authorize(x.f.familyId,shared.shareId,current)).rejects.toMatchObject({code:'SHARE_NOT_FOUND'});expect(x.cache.files.size).toBe(0);
});

it('does not block an unchanged family directory behind an in-flight media download',async()=>{
 const x=await fixture();x.attach();const shared=await x.history.share(await x.history.prepare('moment_d2',x.f.familyId,current),HISTORY_AUDIENCE_CONFIRMATION,current);
 const started=deferred<void>(),gate=deferred<{bytes:Uint8Array;mimeType:string}>();
 x.client.history!.getShareMediaContent=async()=>{started.resolve();return gate.promise;};
 const reading=x.history.read(x.f.familyId,shared.shareId,current);await started.promise;
 let reconciled=false;const reconcile=x.history.reconcileFamilies(x.a.userId,[x.f.familyId],current).then(()=>{reconciled=true;});
 try{for(let i=0;i<100&&!reconciled;i++)await Promise.resolve();expect(reconciled).toBe(true);}
 finally{gate.resolve({bytes:sampleJpegBytes(),mimeType:'image/jpeg'});await reading;await reconcile;}
});

it('invalidates and cleans a removed family without waiting for an in-flight download',async()=>{
 const x=await fixture();x.attach();const shared=await x.history.share(await x.history.prepare('moment_d2',x.f.familyId,current),HISTORY_AUDIENCE_CONFIRMATION,current);
 const started=deferred<void>(),gate=deferred<{bytes:Uint8Array;mimeType:string}>();
 x.client.history!.getShareMediaContent=async()=>{started.resolve();return gate.promise;};
 const reading=x.history.read(x.f.familyId,shared.shareId,current);const rejected=expect(reading).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});await started.promise;
 let reconciled=false;const reconcile=x.history.reconcileFamilies(x.a.userId,[],current).then(()=>{reconciled=true;});
 for(let i=0;i<100;i++)await Promise.resolve();expect(reconciled).toBe(true);
 gate.resolve({bytes:sampleJpegBytes(),mimeType:'image/jpeg'});await rejected;await reconcile;
 expect(await x.cache.listFamilyIds!(x.a.userId)).toEqual([]);
});

it('reads only the selected cover and reuses its private file without another download or write',async()=>{
 const x=await fixture();x.attach();const shared=await x.history.share(await x.history.prepare('moment_d2',x.f.familyId,current),HISTORY_AUDIENCE_CONFIRMATION,current);
 const share=await x.client.history!.getShare(x.a.sessionToken,x.f.familyId,shared.shareId);
 const photo=share.snapshot.media[0];
 const get=jest.spyOn(x.client.history!,'getShare').mockResolvedValue({...share,snapshot:{...share.snapshot,media:[photo,{...photo,objectId:'unrequested-photo'}]}});
 const meta=jest.spyOn(x.client.history!,'getShareMedia');const content=jest.spyOn(x.client.history!,'getShareMediaContent');const save=jest.spyOn(x.cache,'saveStoredMedia');const readBytes=jest.spyOn(x.cache,'readMediaBytes');
 const first=await x.history.read(x.f.familyId,shared.shareId,current,photo.objectId);
 expect(first.media).toHaveLength(1);expect(meta).toHaveBeenCalledTimes(1);expect(content).toHaveBeenCalledTimes(1);expect(save).toHaveBeenCalledTimes(1);
 expect((await x.cache.find(x.a.userId,x.f.familyId,shared.shareId))?.receiveStatus).not.toBe('received');
 const again=await x.history.read(x.f.familyId,shared.shareId,current,photo.objectId);
 expect(readBytes).not.toHaveBeenCalled();
 expect(again.media[0].uri).toBe(first.media[0].uri);expect(meta).toHaveBeenCalledTimes(2);expect(content).toHaveBeenCalledTimes(1);expect(save).toHaveBeenCalledTimes(1);
 const stored=(await x.cache.listMedia(x.a.userId,x.f.familyId,shared.shareId))[0];
 const original=x.cache.files.get(stored.storageKey)!;const corrupt=new Uint8Array(original);corrupt[0]^=1;x.cache.files.set(stored.storageKey,corrupt);
 await x.history.read(x.f.familyId,shared.shareId,current,photo.objectId);
 expect(content).toHaveBeenCalledTimes(2);expect(save).toHaveBeenCalledTimes(2);
 x.cache.files.delete(stored.storageKey);
 await x.history.read(x.f.familyId,shared.shareId,current,photo.objectId);
 expect(content).toHaveBeenCalledTimes(3);expect(save).toHaveBeenCalledTimes(3);
 get.mockRestore();await x.commands.historyShares.revokeShare(x.a.sessionToken,x.f.familyId,shared.shareId);
 await expect(x.history.read(x.f.familyId,shared.shareId,current,photo.objectId)).rejects.toMatchObject({code:'SHARE_NOT_FOUND'});
 expect(x.cache.files.size).toBe(0);
});

it('authorizes cached cover metadata concurrently instead of waiting inside the file queue',async()=>{
 const x=await fixture();x.attach();const shared=await x.history.share(await x.history.prepare('moment_d2',x.f.familyId,current),HISTORY_AUDIENCE_CONFIRMATION,current);
 const share=await x.client.history!.getShare(x.a.sessionToken,x.f.familyId,shared.shareId);const photo=share.snapshot.media[0];
 const original=x.client.history!.getShareMedia.bind(x.client.history);const both=deferred<void>();let calls=0;
 jest.spyOn(x.client.history!,'getShareMedia').mockImplementation(async(...args)=>{if(++calls===2)both.resolve();await both.promise;return original(...args);});
 const results=await Promise.all([x.history.read(x.f.familyId,shared.shareId,current,photo.objectId),x.history.read(x.f.familyId,shared.shareId,current,photo.objectId)]);
 expect(calls).toBe(2);expect(results[0].media[0].uri).toBe(results[1].media[0].uri);
});

it.each([{indices:[0,1,2]},{indices:[0,2]},{indices:[2]}])('prepares selected HEIF sources from a three-photo record: $indices',async({indices})=>{
  const x=await fixture();
  const original=(await x.personal.moments.findById()).moment;
  const ids=['heif1','heif2','heif3'];
  x.personal.moments.findById.mockResolvedValue({kind:'ready',moment:{...original,assetIds:ids}});
  const base=(await x.personal.assets.findById()).asset;
  x.personal.assets.findById.mockImplementation(async(id?:string)=>({kind:'ready',asset:{...base,id:id!,localUri:`file:///${id}`,metadata:{mimeType:'image/heic'}}}));
  x.personal.readAssetBytes.mockImplementation(async(uri?:string)=>new Uint8Array([0,0,0,24,102,116,121,112,104,101,105,99,ids.indexOf(uri!.slice(8))]));
  let copyNumber=0;
  const convert=jest.fn(async()=>{const bytes=sampleJpegBytes();const table=bytes.findIndex((v,i)=>v===255&&bytes[i+1]===219);bytes[table+5]+=copyNumber++;return {bytes,mimeType:'image/jpeg'};});
  const history=createFamilyHistoryUseCases({client:x.client,session:x.session,pending:createPendingFamilyOperationStore(createPendingFamilyOperationDisk()),personal:{...x.personal,convertImageForShare:convert},receiveCache:x.cache});
  const p=await history.prepare(original.id,x.f.familyId,current,indices.map(i=>ids[i]));
  const saved=await history.share(p,HISTORY_AUDIENCE_CONFIRMATION,current);
  const received=await history.read(x.f.familyId,saved.shareId,current);
  expect(received.media).toHaveLength(indices.length);
  expect(received.media.every(media=>media.mimeType==='image/jpeg')).toBe(true);
  expect(convert).toHaveBeenCalledTimes(indices.length);
  expect(x.requests.filter(r=>r.method==='POST'&&r.path.endsWith('/shares'))).toHaveLength(1);
});
it('reports original photo 3 on conversion failure and never commits a partial share',async()=>{
  const x=await fixture();const original=(await x.personal.moments.findById()).moment;
  x.personal.moments.findById.mockResolvedValue({kind:'ready',moment:{...original,assetIds:['one','two','three']}});
  const base=(await x.personal.assets.findById()).asset;
  x.personal.assets.findById.mockImplementation(async(id?:string)=>({kind:'ready',asset:{...base,id:id!,localUri:`file:///${id}`,metadata:{mimeType:'image/heic'}}}));
  x.personal.readAssetBytes.mockResolvedValue(new Uint8Array([1,2,3]));
  const history=createFamilyHistoryUseCases({client:x.client,session:x.session,pending:createPendingFamilyOperationStore(createPendingFamilyOperationDisk()),personal:{...x.personal,convertImageForShare:async()=>{throw new ApplicationError('SHARE_IMAGE_DECODE_FAILED','decode');}}});
  const p=await history.prepare(original.id,x.f.familyId,current,['three']);
  await expect(history.share(p,HISTORY_AUDIENCE_CONFIRMATION,current)).rejects.toMatchObject({code:'SHARE_IMAGE_DECODE_FAILED',photoNumber:3,assetId:'three'});
  expect(x.requests.filter(r=>r.method==='POST'&&r.path.endsWith('/shares'))).toHaveLength(0);
});

it('renews the parent list while an inline detail is still downloading and never publishes a revoked download',async()=>{
  const x=await fixture();x.attach();
  const saved=await x.history.share(await x.history.prepare('moment_d2',x.f.familyId,current),HISTORY_AUDIENCE_CONFIRMATION,current);
  const started=deferred<void>(),gate=deferred<void>();
  const content=x.client.history!.getShareMediaContent.bind(x.client.history);
  jest.spyOn(x.client.history!,'getShareMediaContent').mockImplementation(async(...args)=>{started.resolve();await gate.promise;return content(...args);});
  const read=x.history.read(x.f.familyId,saved.shareId,current);
  // Attach a rejection handler before releasing a revoked response.
  const readResult=read.then(value=>({value}),error=>({error}));
  await started.promise;
  let renewed=false;
  const refresh=x.history.list(x.f.familyId,current).then(value=>{renewed=true;return value;});
  try {
    for(let i=0;i<100&&!renewed;i++)await Promise.resolve();
    expect(renewed).toBe(true);
    expect((await refresh).shares.map(s=>s.shareId)).toContain(saved.shareId);
    await x.commands.historyShares.revokeShare(x.a.sessionToken,x.f.familyId,saved.shareId);
  }finally{gate.resolve();}
  expect(await readResult).toMatchObject({error:{code:'SHARE_NOT_FOUND'}});
  expect(await x.cache.find(x.a.userId,x.f.familyId,saved.shareId)).toBeNull();
});

it('publishes text first, downloads at most two media concurrently and preserves snapshot order',async()=>{
 const x=await fixture();
 const uploaded=[];
 for(let i=0;i<3;i++){
  const bytes=sampleJpegBytes(),table=bytes.findIndex((v,n)=>v===255&&bytes[n+1]===219);bytes[table+5]+=i;
  uploaded.push(await x.commands.uploadMedia(x.a.sessionToken,{bytes,mimeType:'image/jpeg'}));
 }
 const ids=uploaded.map(m=>m.objectId);
 const shared=await x.commands.historyShares.shareMoment(x.a.sessionToken,x.f.familyId,{sourceMomentId:'progress',sourceRevision:1,note:'Text first',emotion:'',occurredAtPrecision:'unknown',mediaObjectIds:ids,expectedMediaCount:3,audienceConfirmation:HISTORY_AUDIENCE_CONFIRMATION,idempotencyKey:'progress'});
 const gates=ids.map(()=>deferred<void>()),two=deferred<void>(),three=deferred<void>(),secondShown=deferred<void>();
 let concurrent=0,max=0,calls=0;
 const original=x.client.history!.getShareMediaContent.bind(x.client.history);
 jest.spyOn(x.client.history!,'getShareMediaContent').mockImplementation(async(...args)=>{
  const index=ids.indexOf(args[3]);concurrent++;max=Math.max(max,concurrent);calls++;
  if(calls===2)two.resolve();if(calls===3)three.resolve();
  try{await gates[index].promise;return await original(...args);}finally{concurrent--;}
 });
 const seen:{userId:string;share:unknown;media:{objectId:string}[]}[]=[];
 const read=x.history.read(x.f.familyId,shared.shareId,current,undefined,value=>{seen.push(value);if(value.media.some(m=>m.objectId===ids[1]))secondShown.resolve();});
 try{
  await two.promise;expect(calls).toBe(2);expect(seen[0].media).toEqual([]);
  gates[1].resolve();await secondShown.promise;await three.promise;
  expect(seen[1].media.map(m=>m.objectId)).toEqual([ids[1]]);expect(max).toBe(2);
 }finally{gates.forEach(g=>g.resolve());}
 expect((await read).media.map(m=>m.objectId)).toEqual(ids);
 expect((await x.cache.find(x.a.userId,x.f.familyId,shared.shareId))?.receiveStatus).toBe('received');
});
it('never publishes a downloaded photo after withdrawal during incremental reading',async()=>{
 const x=await fixture();x.attach();
 const shared=await x.history.share(await x.history.prepare('moment_d2',x.f.familyId,current),HISTORY_AUDIENCE_CONFIRMATION,current);
 const started=deferred<void>(),gate=deferred<void>(),seen=jest.fn();
 const original=x.client.history!.getShareMediaContent.bind(x.client.history);
 jest.spyOn(x.client.history!,'getShareMediaContent').mockImplementation(async(...args)=>{const content=await original(...args);started.resolve();await gate.promise;return content;});
 const reading=x.history.read(x.f.familyId,shared.shareId,current,undefined,seen);
 const rejected=expect(reading).rejects.toMatchObject({code:'SHARE_NOT_FOUND'});
 await started.promise;await x.commands.historyShares.revokeShare(x.a.sessionToken,x.f.familyId,shared.shareId);gate.resolve();await rejected;
 expect(seen).toHaveBeenCalledTimes(1);expect(seen.mock.calls[0][0].media).toEqual([]);
});
