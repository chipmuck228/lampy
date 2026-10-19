import { createFamilyCommands } from '../family-api/commands';
import { createMapAppleVerifier } from '../family-api/apple';
import { HISTORY_CONFIRMATION } from '../family-api/history-policy';
import { dispatchFamilyApi } from '../family-api/http';
import { sampleJpegBytes } from '../family-api/media-validate';
import { createFamilyApiClient, createDispatchTransport } from '../infrastructure/family-http-client';
import { createMemoryFamilyReceiveCache } from '../infrastructure/family-receive-cache';
import { createPendingFamilyOperationDisk, createPendingFamilyOperationStore } from '../infrastructure/pending-family-operations';
import { createFamilyUseCases, createMemoryFamilySessionStore } from './family-use-cases';
import { registerForegroundAudioPauser } from './foreground-audio';
async function fixture() {
 const commands=createFamilyCommands({apple:createMapAppleVerifier({a:{appleSubject:'a'},b:{appleSubject:'b'}}),historySharingEnabled:true,inviteLinksEnabled:true});
 const a=await commands.signInWithApple('a'),b=await commands.signInWithApple('b');const family=await commands.createNamedFamily(a.sessionToken,'Home','f');
 const invite=await commands.createInviteLink(a.sessionToken,family.familyId);await commands.acceptInviteLink(b.sessionToken,invite.token);
 const photo=await commands.uploadMedia(b.sessionToken,{bytes:sampleJpegBytes(),mimeType:'image/jpeg'});
 const share=await commands.historyShares.shareMoment(b.sessionToken,family.familyId,{sourceMomentId:'m',sourceRevision:1,note:'shared',emotion:'',occurredAtPrecision:'unknown',mediaObjectIds:[photo.objectId],expectedMediaCount:1,audienceConfirmation:HISTORY_CONFIRMATION});
 const session=createMemoryFamilySessionStore();await session.setSession(a);const cache=createMemoryFamilyReceiveCache();
 const client=createFamilyApiClient(createDispatchTransport(r=>dispatchFamilyApi(commands,r)));
 const app=createFamilyUseCases({client,session,receiveCache:cache,pending:createPendingFamilyOperationStore(createPendingFamilyOperationDisk()),mediaUri:key=>'file:///'+key});
 return {commands,a,b,family,share,session,cache,client,app};
}
it('blocks through HTTP, stops audio and clears cached files; unblocking reauthorizes',async()=>{
 const f=await fixture();await f.app.history.read(f.family.familyId,f.share.shareId,()=>true);
 expect((await f.cache.inspectCache()).fileCount).toBe(1);const pause=jest.fn(),remove=registerForegroundAudioPauser(pause);
 try {await f.app.safety.block(f.family.familyId,f.b.userId);expect(pause).toHaveBeenCalled();}finally{remove();}
 expect((await f.cache.inspectCache()).fileCount).toBe(0);
 await expect(f.app.history.read(f.family.familyId,f.share.shareId,()=>true)).rejects.toMatchObject({code:'FORBIDDEN'});
 expect((await f.app.safety.blocks()).blocks[0].targetUserId).toBe(f.b.userId);
 await f.app.safety.unblock(f.b.userId);
 expect((await f.app.history.read(f.family.familyId,f.share.shareId,()=>true)).share.shareId).toBe(f.share.shareId);
});
it('cannot publish a late authorized share after local blocking changes generation',async()=>{
 const f=await fixture();const original=f.client.history!.getShare;
 let started!:()=>void,finish!:()=>void;const ready=new Promise<void>(r=>{started=r;}),gate=new Promise<void>(r=>{finish=r;});
 f.client.history!.getShare=async(...args)=>{const result=await original(...args);started();await gate;return result;};
 const pending=f.app.history.read(f.family.familyId,f.share.shareId,()=>true);const rejected=expect(pending).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
 await ready;await f.app.safety.block(f.family.familyId,f.b.userId);finish();await rejected;
 expect((await f.cache.inspectCache()).fileCount).toBe(0);
});
it('rejects report after losing focus and never applies a late safety response to another account',async()=>{
 const f=await fixture();await expect(f.app.safety.report(f.family.familyId,f.share.shareId,{requestId:'r',reason:'privacy',detail:''},()=>false)).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
 const block=f.client.safety!.block;f.client.safety!.block=async(...args)=>{const result=await block(...args);await f.session.setSession(f.b);return result;};
 await expect(f.app.safety.block(f.family.familyId,f.b.userId)).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
 expect((await f.commands.safety.blocks(f.b.sessionToken)).blocks).toHaveLength(0);
});
