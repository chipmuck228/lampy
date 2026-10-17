import { createFamilyAlbumReadSession,createFamilyAlbumUseCases,familyAlbumEvaluationOpen,FAMILY_ALBUM_LEASE_MS } from './family-album';
import { createMemoryFamilySessionStore } from './family-use-cases';
import type { FamilyApiClient } from '../infrastructure/family-http-client';
import type { FamilyAlbumAccess,FamilyAlbumView } from '../family-api/family-album-types';
const permission:FamilyAlbumAccess={familyId:'f',userId:'a',membershipId:'ma',role:'creator',authority:'epoch1',rulesAcknowledged:true,rulesVersion:1,canManage:true,canExport:false};
const view:FamilyAlbumView={albumId:'book',familyId:'f',name:'Family private name',opening:null,revision:1,createdAt:'now',updatedAt:'now',access:permission,items:[],cover:null,validation:'validation1'};
function setup(){
 const session=createMemoryFamilySessionStore();const access=jest.fn(async()=>permission);const read=jest.fn(async()=>view);const validate=jest.fn(async()=>({valid:true as const}));
 const api={access,read,validate};const client=createFamilyAlbumUseCases({session,client:{albums:api} as unknown as FamilyApiClient});
 return {session,access,read,validate,client};
}
it('a view is checked on the server again before it can be displayed',async()=>{
 const f=setup();await f.session.setSession({userId:'a',sessionToken:'a'});
 expect(await f.client.read('f','book',()=>true)).toEqual(view);expect(f.validate).toHaveBeenCalledWith('a','f','book','validation1');
 f.validate.mockRejectedValueOnce(new Error('withdrawn'));await expect(f.client.read('f','book',()=>true)).rejects.toThrow('withdrawn');
});
it('logout or account switch while a read is pending discards the response',async()=>{
 const f=setup();await f.session.setSession({userId:'a',sessionToken:'a'});
 f.read.mockImplementationOnce(async()=>{await f.session.setSession({userId:'b',sessionToken:'b'});return view;});
 await expect(f.client.read('f','book',()=>true)).rejects.toMatchObject({code:'FAMILY_ALBUM_CANCELLED'});
});
it('an account/token mismatch never sends a write or exposes sources',async()=>{
 const f=setup();await f.session.setSession({userId:'b',sessionToken:'a'});
 await expect(f.client.sources('f')).rejects.toMatchObject({code:'UNAUTHENTICATED'});expect(f.read).not.toHaveBeenCalled();
});
it('invalidating an outstanding reading task prevents late content from becoming a snapshot',async()=>{
 const f=setup();await f.session.setSession({userId:'a',sessionToken:'a'});
 let finish!:(value:FamilyAlbumView)=>void;f.read.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const reading=createFamilyAlbumReadSession({client:f.client});const work=reading.load('f','book');
 for(let i=0;i<100&&!finish;i++)await Promise.resolve();expect(finish).toBeDefined();reading.invalidate();finish(view);
 await expect(work).rejects.toMatchObject({code:'FAMILY_ALBUM_CANCELLED'});expect(reading.snapshot()).toBeNull();expect(f.validate).not.toHaveBeenCalled();
});
it('renewal failures clear the old content and invoke audio/task invalidation',async()=>{
 const f=setup();await f.session.setSession({userId:'a',sessionToken:'a'});const invalidate=jest.fn();
 const reading=createFamilyAlbumReadSession({client:f.client,onInvalidate:invalidate});await reading.load('f','book');expect(reading.snapshot()).toEqual(view);
 f.validate.mockRejectedValueOnce(new Error('revoked'));await expect(reading.validate()).rejects.toThrow('revoked');expect(reading.snapshot()).toBeNull();expect(invalidate).toHaveBeenCalledTimes(2);
});
it('a hung request cannot renew a view after its locally bounded lease',async()=>{
 const f=setup();await f.session.setSession({userId:'a',sessionToken:'a'});let now=0;
 const reading=createFamilyAlbumReadSession({client:f.client,now:()=>now});await reading.load('f','book');now=FAMILY_ALBUM_LEASE_MS;expect(reading.snapshot()).toBeNull();
 now=0;await reading.load('f','book');f.validate.mockImplementationOnce(async()=>{now=FAMILY_ALBUM_LEASE_MS+1000;return{valid:true};});
 expect(await reading.validate()).toBe(false);expect(reading.snapshot()).toBeNull();
});
it('a late validator from the previous book cannot revive it over the next book',async()=>{
 const f=setup();await f.session.setSession({userId:'a',sessionToken:'a'});const reading=createFamilyAlbumReadSession({client:f.client});await reading.load('f','book');
 let finish!:(value:{valid:true})=>void;f.validate.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const pending=reading.validate();for(let i=0;i<100&&!finish;i++)await Promise.resolve();expect(finish).toBeDefined();reading.invalidate();f.read.mockResolvedValueOnce({...view,albumId:'second',name:'Second'});
 await reading.load('f','second');finish({valid:true});expect(await pending).toBe(false);expect(reading.snapshot()?.albumId).toBe('second');
});
it('family albums require a development or explicit internal build plus the preview flag',()=>{
 expect(familyAlbumEvaluationOpen(true,'1',false)).toBe(true);
 expect(familyAlbumEvaluationOpen(false,'1',false)).toBe(false);
 expect(familyAlbumEvaluationOpen(false,'1',true)).toBe(true);
 expect(familyAlbumEvaluationOpen(false,'0',true)).toBe(false);
 expect(familyAlbumEvaluationOpen(true,'',false)).toBe(false);
});
it('renews with one server request and still rejects account changes and mismatched viewers',async()=>{
 const f=setup();await f.session.setSession({userId:'a',sessionToken:'a'});
 await f.client.validate(view,()=>true);expect(f.access).not.toHaveBeenCalled();expect(f.validate).toHaveBeenCalledTimes(1);
 f.validate.mockImplementationOnce(async()=>{await f.session.setSession({userId:'b',sessionToken:'b'});return {valid:true};});
 await expect(f.client.validate(view,()=>true)).rejects.toMatchObject({code:'FAMILY_ALBUM_CANCELLED'});
 f.validate.mockClear();await expect(f.client.validate(view,()=>true)).rejects.toMatchObject({code:'FAMILY_ALBUM_CANCELLED'});expect(f.validate).not.toHaveBeenCalled();
});
it('reports only renewal stage and timings when a server request hangs',async()=>{
 const f=setup();await f.session.setSession({userId:'a',sessionToken:'a'});let now=0;const reading=createFamilyAlbumReadSession({client:f.client,now:()=>now});await reading.load('f','book');
 let finish!:(value:{valid:true})=>void;f.validate.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const work=reading.validate();
 for(let i=0;i<100&&!finish;i++)await Promise.resolve();now=FAMILY_ALBUM_LEASE_MS+100;
 expect(reading.diagnostic()).toBe(`stage=SERVER_REQUEST pendingMs=${FAMILY_ALBUM_LEASE_MS+100} lastMs=none completed=0`);expect(reading.snapshot()).toBeNull();reading.invalidate();finish({valid:true});expect(await work).toBe(false);
});
it('retries transient network errors without extending old access or discarding a still-qualified view',async()=>{
 const f=setup();await f.session.setSession({userId:'a',sessionToken:'a'});let now=0;const reading=createFamilyAlbumReadSession({client:f.client,now:()=>now});await reading.load('f','book');
 f.validate.mockRejectedValueOnce({code:'SERVER_UNREACHABLE'});now=5000;expect(await reading.validate()).toBe(false);expect(reading.snapshot()).toEqual(view);
 now=6000;expect(await reading.validate()).toBe(true);f.validate.mockRejectedValueOnce({code:'NETWORK'});now=7000;expect(await reading.validate()).toBe(false);
 now=6000+FAMILY_ALBUM_LEASE_MS;expect(reading.snapshot()).toBeNull();
});

it('reads access/list metadata once per endpoint while checking both the returned viewer and local session',async()=>{
 const f=setup();await f.session.setSession({userId:'a',sessionToken:'a'});await f.client.access('f');expect(f.access).toHaveBeenCalledTimes(1);
 const list=jest.fn(async()=>({access:permission,albums:[]}));const client=createFamilyAlbumUseCases({session:f.session,client:{albums:{access:f.access,list}} as unknown as FamilyApiClient});
 f.access.mockClear();await expect(client.list('f')).resolves.toMatchObject({albums:[]});expect(f.access).not.toHaveBeenCalled();expect(list).toHaveBeenCalledTimes(1);
 list.mockResolvedValueOnce({access:{...permission,userId:'b'},albums:[]});await expect(client.list('f')).rejects.toMatchObject({code:'UNAUTHENTICATED'});
 list.mockImplementationOnce(async()=>{await f.session.setSession({userId:'b',sessionToken:'b'});return {access:permission,albums:[]};});await expect(client.list('f')).rejects.toMatchObject({code:'FAMILY_ALBUM_CANCELLED'});
});

it('release preview requires the exact internal marker, origin and product gates',()=>{
 const testEnv=process.env;
 const keys=['EXPO_PUBLIC_FAMILY_INTERNAL_TEST','EXPO_PUBLIC_FAMILY_API_BASE_URL','EXPO_PUBLIC_FAMILY_ENTRY_OPEN','EXPO_PUBLIC_CONTROLLED_EMAIL_ACCOUNTS','EXPO_PUBLIC_FAMILY_ALBUM_EVAL'] as const;
 const before=keys.map(key=>testEnv[key]);
 try {
  const values=['1','https://family-test.yunpura.com','1','1','1'];
  keys.forEach((key,index)=>{testEnv[key]=values[index];});
  expect(familyAlbumEvaluationOpen(false)).toBe(true);
  for(const key of keys){const value=testEnv[key];testEnv[key]='';expect(familyAlbumEvaluationOpen(false)).toBe(false);testEnv[key]=value;}
 } finally {keys.forEach((key,index)=>{if(before[index]===undefined)delete testEnv[key];else testEnv[key]=before[index];});}
});
