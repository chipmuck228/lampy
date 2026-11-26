import {createFamilyApiClient,createFamilyHttpTransport} from './family-http-client';
it.each([
 ['availability',15000,'/health'],
 ['send',30000,'/v2/auth/email-code/request'],
 ['delete',45000,'/v2/auth/email-code/verify'],
 ['status',15000,'/v2/me/email-code'],
] as const)('bounds the %s request and aborts instead of silently waiting forever',async(kind,ms,path)=>{
 jest.useFakeTimers();
 try{
  const fetchImpl=jest.fn((_input:RequestInfo|URL,_init?:RequestInit)=>new Promise<Response>(()=>{}));const client=createFamilyApiClient(createFamilyHttpTransport({baseUrl:'https://family.example.test',fetchImpl:fetchImpl as typeof fetch}));
  const work=kind==='availability'?client.health(15000):kind==='send'?client.requestEmailCode!({intent:'delete'},'test-token'):kind==='delete'?client.verifyEmailCode!({intent:'delete',challengeId:'a'.repeat(64),code:'123456',confirmation:'delete-my-lampy-account-v1'},'test-token'):client.emailCodeStatus!('test-token');
  const rejected=expect(work).rejects.toMatchObject({code:'SERVER_UNREACHABLE'});await jest.advanceTimersByTimeAsync(ms);await rejected;
  expect(fetchImpl).toHaveBeenCalledTimes(1);expect(fetchImpl.mock.calls[0][0]).toBe('https://family.example.test'+path);
  expect((fetchImpl.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
 }finally{jest.useRealTimers();}
});
