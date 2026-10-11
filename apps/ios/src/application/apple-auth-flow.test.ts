import { createFamilyUseCases, createMemoryFamilySessionStore } from './family-use-cases';
import { createFamilyApiClient } from '../infrastructure/family-http-client';
import { createMemoryRepositories } from '../infrastructure/repositories';
import { createMemoryFamilyReceiveCache } from '../infrastructure/family-receive-cache';
import { createPendingFamilyOperationDisk, createPendingFamilyOperationStore } from '../infrastructure/pending-family-operations';
function setup() {
 const session=createMemoryFamilySessionStore();const client=createFamilyApiClient({request:async()=>({status:200,body:{signedOut:true}})});
 const begin=jest.fn(async()=>({challengeId:'id',nonce:'nonce',expiresAt:'future'}));
 const complete=jest.fn(async()=>({userId:'a',sessionToken:'new',expiresAt:'future'}));client.beginAppleAuth=begin;client.completeAppleAuth=complete;
 const revoke=jest.spyOn(client,'signOut');const family=createFamilyUseCases({client,session,personal:createMemoryRepositories(),receiveCache:createMemoryFamilyReceiveCache(),pending:createPendingFamilyOperationStore(createPendingFamilyOperationDisk()),idempotencyKey:()=> 'key'});
 return {session,client,family,begin,complete,revoke};
}
function deferred<T>() {let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>{resolve=r});return {promise,resolve};}
it('cancel before challenge arrives never opens native authorization or completes',async()=>{
 const h=setup(),d=deferred<{challengeId:string;nonce:string;expiresAt:string}>();h.begin.mockReturnValue(d.promise);let current=true;const authorize=jest.fn();
 const p=h.family.authenticateApple('login',authorize,()=>current);await Promise.resolve();current=false;d.resolve({challengeId:'id',nonce:'nonce',expiresAt:'future'});
 await expect(p).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});expect(authorize).not.toHaveBeenCalled();expect(h.complete).not.toHaveBeenCalled();
});
it('background during native sheet prevents completing a server request',async()=>{
 const h=setup(),d=deferred<string>();let current=true;const authorize=jest.fn(()=>d.promise);const p=h.family.authenticateApple('login',authorize,()=>current);
 while(!authorize.mock.calls.length) await Promise.resolve();current=false;d.resolve('token');await expect(p).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});expect(h.complete).not.toHaveBeenCalled();
});
it('late login result is revoked without altering the current account',async()=>{
 const h=setup(),d=deferred<{userId:string;sessionToken:string;expiresAt:string}>();h.complete.mockReturnValue(d.promise);let current=true;const p=h.family.authenticateApple('login',async()=> 'token',()=>current);
 while(!h.complete.mock.calls.length)await Promise.resolve();current=false;await h.session.setSession({userId:'b',sessionToken:'b'});d.resolve({userId:'a',sessionToken:'new',expiresAt:'future'});
 await expect(p).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});expect(h.revoke).toHaveBeenCalledWith('new');expect(await h.session.getSessionToken()).toBe('b');
});
it('explicit link uses existing session and never replaces it',async()=>{
 const h=setup();await h.session.setSession({userId:'a',sessionToken:'old'});h.client.completeAppleAuth=jest.fn(async()=>({linked:true as const,userId:'a'}));
 expect(await h.family.authenticateApple('link',async nonce=> {expect(nonce).toBe('nonce');return 'token';},()=>true)).toEqual({linked:true as const,userId:'a'});
 expect(h.begin).toHaveBeenCalledWith('link','old');expect(await h.session.getSessionToken()).toBe('old');
});
it('successful login saves session once and newer auth prevents older completion',async()=>{
 const h=setup();expect(await h.family.authenticateApple('login',async()=> 'token',()=>true)).toEqual({userId:'a'});expect(await h.session.getSessionToken()).toBe('new');
 const d=deferred<string>();const authorize=jest.fn(()=>d.promise);const old=h.family.authenticateApple('login',authorize,()=>true);while(!authorize.mock.calls.length)await Promise.resolve();
 await h.family.authenticateApple('login',async()=> 'second',()=>true);d.resolve('old');await expect(old).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
});
