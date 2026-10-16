import {familyNetworkDiagnostic,FAMILY_TRACE_ID} from './family-network-diagnostic';
import {createFamilyApiClient,createFamilyHttpTransport} from './family-http-client';
afterEach(()=>jest.useRealTimers());
it('aborts a hung album validation after five seconds even if fetch ignores abort',async()=>{
 jest.useFakeTimers();let signal:AbortSignal|null|undefined;
 const fetchImpl=jest.fn((_url:unknown,init?:RequestInit)=>{signal=init?.signal;return new Promise(()=>{});}) as unknown as typeof fetch;
 const client=createFamilyApiClient(createFamilyHttpTransport({baseUrl:'https://family-test.yunpura.com',fetchImpl}));
 const work=client.albums!.validate('private-token','f','b','digest');const rejected=expect(work).rejects.toMatchObject({code:'SERVER_UNREACHABLE'});
 await jest.advanceTimersByTimeAsync(5000);await rejected;expect(signal?.aborted).toBe(true);
});
it('cleans up the validation deadline after a successful response',async()=>{
 jest.useFakeTimers();let signal:AbortSignal|null|undefined;
 const fetchImpl=jest.fn(async(_url:unknown,init?:RequestInit)=>{signal=init?.signal;return {status:200,ok:true,text:async()=>'{"valid":true}'};}) as unknown as typeof fetch;
 const client=createFamilyApiClient(createFamilyHttpTransport({baseUrl:'https://family-test.yunpura.com',fetchImpl}));
 await expect(client.albums!.validate('token','f','b','digest')).resolves.toEqual({valid:true});await jest.advanceTimersByTimeAsync(6000);expect(signal?.aborted).toBe(false);
});

it.each(['directory','access','list'] as const)('cancels a hung %s metadata HTTP request after five seconds',async(kind)=>{
 jest.useFakeTimers();let signal:AbortSignal|null|undefined;
 const fetchImpl=jest.fn((_url:unknown,init?:RequestInit)=>{signal=init?.signal;return new Promise(()=>{});}) as unknown as typeof fetch;
 const client=createFamilyApiClient(createFamilyHttpTransport({baseUrl:'https://family-test.yunpura.com',fetchImpl}));
 const work=kind==='directory'?client.listFamilies!('token'):kind==='access'?client.albums!.access('token','f'):client.albums!.list('token','f');const rejected=expect(work).rejects.toMatchObject({code:'SERVER_UNREACHABLE'});
 await jest.advanceTimersByTimeAsync(5000);await rejected;expect(signal?.aborted).toBe(true);
});

it('preserves a safe request ID and body-wait status through the API error wrapper',async()=>{
 jest.useFakeTimers();let sent:RequestInit|undefined;
 const fetchImpl=jest.fn(async(_url:unknown,init?:RequestInit)=>{sent=init;return {status:200,ok:true,text:()=>new Promise(()=>{})};}) as unknown as typeof fetch;
 const client=createFamilyApiClient(createFamilyHttpTransport({baseUrl:'https://family-test.yunpura.com',fetchImpl,trace:true}));
 const errorPromise=client.listFamilies!('private-token').catch(error=>error);
 await jest.advanceTimersByTimeAsync(5000);const error=await errorPromise;expect(error.code).toBe('SERVER_UNREACHABLE');
 const id=(sent?.headers as Record<string,string>)['x-lampy-request-id'];expect(FAMILY_TRACE_ID.test(id)).toBe(true);
 const detail=familyNetworkDiagnostic(error);expect(detail).toContain(`rid=${id}`);expect(detail).toContain('wait=TEXT http=200');expect(detail).not.toContain('private-token');
});
it('distinguishes a wait for headers from a body wait and identifies the actual RN polyfill',async()=>{
 jest.useFakeTimers();const saved=globalThis.fetch,savedFlag=process.env.EXPO_PUBLIC_USE_RN_FETCH;
 const polyfill=Object.assign(jest.fn(()=>new Promise(()=>{})),{polyfill:true}) as unknown as typeof fetch;
 try{
  globalThis.fetch=polyfill;process.env.EXPO_PUBLIC_USE_RN_FETCH='1';
  const client=createFamilyApiClient(createFamilyHttpTransport({baseUrl:'https://family-test.yunpura.com',trace:true}));
  const errorPromise=client.listFamilies!('private-token').catch(error=>error);await jest.advanceTimersByTimeAsync(5000);
  const detail=familyNetworkDiagnostic(await errorPromise);expect(detail).toContain('engine=RN rnRequested=1 wait=HEADERS http=NONE');
 }finally{globalThis.fetch=saved;if(savedFlag===undefined)delete process.env.EXPO_PUBLIC_USE_RN_FETCH;else process.env.EXPO_PUBLIC_USE_RN_FETCH=savedFlag;}
});
