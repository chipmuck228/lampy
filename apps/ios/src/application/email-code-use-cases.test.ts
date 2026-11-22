import {createFamilyUseCases,createMemoryFamilySessionStore} from './family-use-cases';
import {createFamilyCommands} from '../family-api/commands';
import {createMapAppleVerifier} from '../family-api/apple';
import {createFamilyStore} from '../family-api/store';
import {createMemoryFamilyRepository} from '../family-api/repository';
import {dispatchFamilyApi} from '../family-api/http';
import {createDispatchTransport,createFamilyApiClient} from '../infrastructure/family-http-client';
import {createPendingFamilyOperationStore,createPendingFamilyOperationDisk} from '../infrastructure/pending-family-operations';
import type {EmailCodeSender} from '../family-api/email-code-types';

function harness(){
 let now=new Date('2026-11-22T00:00:00Z'),failed=false;const sent:Parameters<EmailCodeSender['send']>[0][]=[];
 const repository=createMemoryFamilyRepository(createFamilyStore());
 const commands=createFamilyCommands({repository,apple:createMapAppleVerifier({}),clock:{now:()=>now},publicTestLoginEnabled:true,
  emailCode:{secret:'s'.repeat(64),sender:{async send(message){if(failed)throw new Error('unavailable');sent.push(message);}}}});
 const client=createFamilyApiClient(createDispatchTransport(request=>dispatchFamilyApi(commands,request)));
 const session=createMemoryFamilySessionStore();
 function cases(api=client){return createFamilyUseCases({client:api,session,pending:createPendingFamilyOperationStore(createPendingFamilyOperationDisk())});}
 return {cases,client,session,commands,repository,sent,advance:()=>{now=new Date(now.getTime()+60001);},fail:()=>{failed=true;}};
}
it('logs in, persists the session, completes a profile and leaves family acceptance explicit',async()=>{
 const h=harness(),service=h.cases();
 const t=await service.requestEmailCode({email:'User@Example.com',intent:'login'},()=>true,null);
 const result=await service.verifyEmailCode({email:'user@example.com',intent:'login',challengeId:t.challengeId,code:h.sent[0].code},()=>true);
 expect(result).toMatchObject({signedIn:true,needsProfile:true});expect(result).not.toHaveProperty('sessionToken');
 const userId=(await h.session.getUserId())!;await service.finishEmailProfile('小禾',userId,()=>true);
 expect(await service.getEmailCodeAccount()).toMatchObject({signedIn:true,linked:true,userId});
 expect((await h.commands.listFamilies((await h.session.getSessionToken())!)).families).toHaveLength(0);
});
it('can retry a wrong code and can use the previous ticket after failed delivery of a resend',async()=>{
 const h=harness(),service=h.cases();const t=await service.requestEmailCode({email:'user@example.com',intent:'login'},()=>true);
 const code=h.sent[0].code;
 await expect(service.verifyEmailCode({email:'user@example.com',intent:'login',challengeId:t.challengeId,code:code==='000000'?'111111':'000000'},()=>true)).rejects.toMatchObject({code:'EMAIL_CODE_INVALID'});
 h.advance();h.fail();await expect(service.requestEmailCode({email:'user@example.com',intent:'login'},()=>true)).rejects.toMatchObject({code:'EMAIL_DELIVERY_FAILED'});
 await expect(service.verifyEmailCode({email:'user@example.com',intent:'login',challengeId:t.challengeId,code},()=>true)).resolves.toHaveProperty('signedIn',true);
});
it('revokes a late new session instead of committing it after leaving the verification screen',async()=>{
 const h=harness();let active=true;let release!:()=>void,started!:()=>void;const begun=new Promise<void>(r=>{started=r;});const held=new Promise<void>(r=>{release=r;});let discarded='';
 const service=h.cases({...h.client,verifyEmailCode:async(...args)=>{const result=await h.client.verifyEmailCode!(...args);if('sessionToken'in result)discarded=result.sessionToken;started();await held;return result;}});
 const t=await service.requestEmailCode({email:'user@example.com',intent:'login'},()=>true);
 const work=service.verifyEmailCode({email:'user@example.com',intent:'login',challengeId:t.challengeId,code:h.sent[0].code},()=>active);
 const rejected=expect(work).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});await begun;active=false;release();await rejected;
 expect(await h.session.getUserId()).toBeNull();expect(await h.repository.withTransaction(tx=>tx.findSession(discarded))).toBeNull();
});
it('refuses requests and profile/logout actions from a stale account presentation',async()=>{
 const h=harness(),service=h.cases();await h.session.setSession({userId:'b',sessionToken:'b-token'});
 await expect(service.requestEmailCode({email:'a@example.com',intent:'link'},()=>true,'a')).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
 await expect(service.finishEmailProfile('name','a',()=>true)).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
 await expect(service.signOutEmailAccount('a')).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
 expect(h.sent).toHaveLength(0);expect(await h.session.getUserId()).toBe('b');
});

it('preserves actual cooldown and hourly quota waits through the server HTTP contract and client',async()=>{
 const h=harness(),service=h.cases();const input={email:'user@example.com',intent:'login' as const};
 await service.requestEmailCode(input,()=>true);
 await expect(service.requestEmailCode(input,()=>true)).rejects.toMatchObject({code:'RATE_LIMITED',retryAfterSeconds:60});
 for(let i=1;i<5;i++){h.advance();await service.requestEmailCode(input,()=>true);}
 // The hourly quota dominates the short resend cooldown; no mail was sent.
 await expect(service.requestEmailCode(input,()=>true)).rejects.toMatchObject({code:'RATE_LIMITED',retryAfterSeconds:3360});
 expect(h.sent).toHaveLength(5);
});
