import { createMemoryFamilyReceiveCache } from '../infrastructure/family-receive-cache';
import { createFamilyUseCases, createMemoryFamilySessionStore } from './family-use-cases';
import { createFamilyApiClient, type FamilyTransportRequest } from '../infrastructure/family-http-client';
import { createPendingFamilyOperationDisk, createPendingFamilyOperationStore } from '../infrastructure/pending-family-operations';
const summary = { familyId:'A',name:'Our home',role:'creator',memberCount:1 };
function harness(request: (r: FamilyTransportRequest) => Promise<{status:number;body:unknown}>) {
  const session = createMemoryFamilySessionStore();
  const pending = createPendingFamilyOperationStore(createPendingFamilyOperationDisk());
  const family = createFamilyUseCases({ session,pending,client:createFamilyApiClient({request}) });
  return { session, family, pending };
}
it('refuses a delayed old list after the account changes', async () => {
  let resolve!: (value: {status:number;body:unknown}) => void;
  const { session,family } = harness(() => new Promise(r => { resolve=r; }));
  await session.setSession({userId:'a',sessionToken:'token-a'});
  const work = family.getFamilies();
  while (!resolve) await Promise.resolve();
  await session.setSession({userId:'b',sessionToken:'token-b'});
  resolve({status:200,body:{families:[summary],limit:10}});
  await expect(work).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
  expect(await session.getUserId()).toBe('b');
});
it('does not clear a new account when the old list returns 401', async () => {
  let resolve!: (value: {status:number;body:unknown}) => void;
  const {session,family}=harness(() => new Promise(r=>{resolve=r;}));
  await session.setSession({userId:'a',sessionToken:'token-a'});
  const work=family.getFamilies(); while(!resolve) await Promise.resolve();
  await session.setSession({userId:'b',sessionToken:'token-b'});
  resolve({status:401,body:{error:{code:'UNAUTHENTICATED'}}});
  await expect(work).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
  expect(await session.getSessionToken()).toBe('token-b');
});
it('retries an uncertain creation with the same durable key, while a new intent gets a distinct key', async () => {
  const keys: (string | undefined)[]=[];
  const {session,family}=harness(async r=>{
    keys.push(r.idempotencyKey);
    if(keys.length===1) throw new Error('network lost after commit');
    return {status:200,body:summary};
  });
  await session.setSession({userId:'a',sessionToken:'token-a'});
  await expect(family.createNamedFamily('Our home','op-a')).rejects.toMatchObject({code:'SERVER_UNREACHABLE'});
  await family.createNamedFamily('Our home','op-a');
  await family.createNamedFamily('Our home','op-b');
  expect(keys[0]).toBe(keys[1]); expect(keys[2]).not.toBe(keys[1]);
});

it('keeps an operation idempotent even after a successful response removed the pending record', async () => {
  const keys: (string | undefined)[]=[];
  const {session,family}=harness(async r=>{ keys.push(r.idempotencyKey);return {status:200,body:summary}; });
  await session.setSession({userId:'a',sessionToken:'token-a'});
  await family.createNamedFamily('Our home','op-a');
  await family.createNamedFamily('Our home','op-a');
  expect(keys[0]).toBe(keys[1]);
});

it('does not send creation after screen qualification is cancelled', async () => {
  const request=jest.fn(async () => ({status:200,body:summary}));
  const {session,family}=harness(request);
  await session.setSession({userId:'a',sessionToken:'token-a'});
  await expect(family.createNamedFamily('Our home','cancelled',() => false)).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
  expect(request).not.toHaveBeenCalled();
});

it('E1 reconciles only missing family caches after a successful list, never after a network failure', async () => {
 const cache=createMemoryFamilyReceiveCache();const isolate=jest.spyOn(cache,'isolateFamily');
 cache.shares.push(...['gone','kept'].map(familyId=>({userId:'a',familyId,shareId:`s-${familyId}`,snapshotRevision:1,authorUserId:'a',snapshot:{note:'original',emotion:'',occurredAtPrecision:'unknown',media:[],origin:{type:'received' as const,transmissionId:'s',originalMomentId:'m',snapshotRevision:1}},sharedAt:'now',receiveStatus:'listed' as const,expectedMediaCount:0})));
 const session=createMemoryFamilySessionStore();await session.setSession({userId:'a',sessionToken:'token-a'});
 const request=jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({status:200,body:{families:[{...summary,familyId:'kept'}],limit:10}});
 const family=createFamilyUseCases({session,pending:createPendingFamilyOperationStore(createPendingFamilyOperationDisk()),client:createFamilyApiClient({request}),receiveCache:cache});
 await expect(family.getFamilies()).rejects.toMatchObject({code:'SERVER_UNREACHABLE'});expect(isolate).not.toHaveBeenCalled();
 await family.getFamilies();expect(isolate).toHaveBeenCalledWith('a','gone');expect(isolate).toHaveBeenCalledTimes(1);
 expect(await cache.listFamilyIds!('a')).toEqual(['kept']);
});
