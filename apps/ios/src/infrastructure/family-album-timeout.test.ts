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
