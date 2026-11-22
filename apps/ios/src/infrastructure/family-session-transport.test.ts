import { createSessionGuardedFamilyTransport } from './family-session-transport';
import { createFamilyApiClient, type FamilyTransportResponse } from './family-http-client';
import { createMemoryFamilySessionStore, createFamilyUseCases } from '../application/family-use-cases';
import { createPendingFamilyOperationStore, createPendingFamilyOperationDisk } from './pending-family-operations';
import { createSecureFamilySessionStore, type SecureKv } from './secure-family-session';
import { samplePngBytes } from '../family-api/media-validate';

function deferred<T>() {let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
const a={userId:'a',sessionToken:'token-a'}, b={userId:'b',sessionToken:'token-b'};

it.each(['metadata','upload','bytes'])('aborts %s on identity change and drops a response even when transport ignores abort',async kind=>{
  const session=createMemoryFamilySessionStore();await session.setSession(a);
  const started=deferred<AbortSignal>();const result=deferred<FamilyTransportResponse>();
  const transport=createSessionGuardedFamilyTransport({request:async input=>{started.resolve(input.signal!);return result.promise;}},session);
  const work=transport.request({method:kind==='upload'?'POST':'GET',path:'/v2/families/f/shares',sessionToken:a.sessionToken,
    ...(kind==='upload'?{bytes:new Uint8Array([1])}:{}),expectBytes:kind==='bytes'});
  const rejection=expect(work).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
  const signal=await started.promise;await session.setSession(b);expect(signal.aborted).toBe(true);
  result.resolve({status:200,body:{private:'a'},bytes:new Uint8Array([1])});await rejection;
});

it('does not start a queued A request after switching, including an A -> B -> A cycle',async()=>{
  const session=createMemoryFamilySessionStore();await session.setSession(a);
  const request=jest.fn(async()=>({status:200,body:{}}));
  const transport=createSessionGuardedFamilyTransport({request},session);
  const pending=transport.request({method:'GET',path:'/v2/me/profile',sessionToken:a.sessionToken});
  const rejected=expect(pending).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
  await session.setSession(b);await session.setSession(a);await rejected;expect(request).not.toHaveBeenCalled();
});

it('allows revocation of a discarded token without reading another account’s data',async()=>{
  const session=createMemoryFamilySessionStore();await session.setSession(b);
  const request=jest.fn(async()=>({status:200,body:{signedOut:true}}));
  const transport=createSessionGuardedFamilyTransport({request},session);
  await expect(transport.request({method:'POST',path:'/v1/auth/sign-out',sessionToken:a.sessionToken})).resolves.toMatchObject({status:200});
  expect(await session.getUserId()).toBe('b');
});

it('a late unauthorized response cannot clear B’s session through the membership use case',async()=>{
  const session=createMemoryFamilySessionStore();await session.setSession(a);
  const started=deferred<void>(),result=deferred<FamilyTransportResponse>();
  const client=createFamilyApiClient(createSessionGuardedFamilyTransport({request:async()=>{started.resolve();return result.promise;}},session));
  const cases=createFamilyUseCases({session,client,pending:createPendingFamilyOperationStore(createPendingFamilyOperationDisk())});
  const work=cases.getMembership();const rejected=expect(work).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
  await started.promise;await session.setSession(b);result.resolve({status:401,body:{error:{code:'UNAUTHENTICATED'}}});
  await rejected;expect(await session.getUserId()).toBe('b');
});

it('secure stores sharing a KV share revisions; reads wait for queued writes and pending revocation remains separate',async()=>{
  const data=new Map<string,string>();const writing=deferred<void>();
  const kv:SecureKv={getItem:async key=>data.get(key)??null,setItem:async(key,value)=>{await writing.promise;data.set(key,value);},deleteItem:async key=>{data.delete(key);}};
  const first=createSecureFamilySessionStore(kv),second=createSecureFamilySessionStore(kv);
  const listener=jest.fn();const unsubscribe=second.subscribe!(listener);
  const set=first.setSession(a);const read=second.getSession!();
  expect(second.getRevision!()).toBe(1);expect(listener).toHaveBeenCalledTimes(1);
  writing.resolve();await set;expect(await read).toEqual(a);
  await first.savePendingRevoke({...a,createdAt:'2026-11-22T00:00:00Z'});
  await second.clearSession();expect(await first.getSession!()).toBeNull();
  expect((await first.getPendingRevoke())?.userId).toBe('a');unsubscribe();
});

it('clearing a finished old revocation cannot erase the newer pending token',async()=>{
  const data=new Map<string,string>();
  const kv:SecureKv={getItem:async key=>data.get(key)??null,setItem:async(key,value)=>{data.set(key,value);},deleteItem:async key=>{data.delete(key);}};
  const store=createSecureFamilySessionStore(kv);
  await store.savePendingRevoke({...a,createdAt:'2026-11-22T00:00:00Z'});
  await store.savePendingRevoke({...b,createdAt:'2026-11-22T00:00:00Z'});
  await store.clearPendingRevoke(a.sessionToken);
  expect((await store.getPendingRevoke())?.sessionToken).toBe(b.sessionToken);
});

it('a completed old upload cannot repopulate the new account’s upload status',async()=>{
  const session=createMemoryFamilySessionStore();await session.setSession(a);
  const started=deferred<void>(),uploaded=deferred<{objectId:string;ownerUserId:string;mimeType:string;byteLength:number;createdAt:string}>();
  const client={...createFamilyApiClient({request:async()=>({status:200,body:{}})}),
    uploadMedia:jest.fn(async()=>{started.resolve();return uploaded.promise;})};
  const cases=createFamilyUseCases({session,client,pending:createPendingFamilyOperationStore(createPendingFamilyOperationDisk())});
  const work=cases.uploadSelectedMedia({bytes:samplePngBytes(),mimeType:'image/png'});
  await started.promise;await session.setSession(b);
  uploaded.resolve({objectId:'private-a',ownerUserId:'a',mimeType:'image/png',byteLength:1,createdAt:'now'});
  await work;expect(cases.getSelectedMediaUploadStatus()).toEqual({status:'idle'});
});

it('serializes a slow logout with a newer login so logout cannot clear the new session',async()=>{
  const session=createMemoryFamilySessionStore();await session.setSession(a);
  const started=deferred<void>(),revoked=deferred<{signedOut:true}>();
  const client={...createFamilyApiClient({request:async()=>({status:200,body:{}})}),
    signOut:jest.fn(async()=>{started.resolve();return revoked.promise;}),
    signInWithApple:async()=>({...b,expiresAt:'later'})};
  const cases=createFamilyUseCases({session,client,pending:createPendingFamilyOperationStore(createPendingFamilyOperationDisk())});
  const logout=cases.signOut();await started.promise;
  const login=cases.signInWithApple('b');revoked.resolve({signedOut:true});
  await logout;await login;expect(await session.getSession!()).toEqual(b);
});
