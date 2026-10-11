import { request } from 'node:http';
import { startFamilyApiServer } from './listen';
function json(port:number,method:string,path:string,body?:unknown,token?:string) {
 return new Promise<{status:number;body:any}>((resolve,reject)=>{
  const bytes=body ? JSON.stringify(body) : '';
  const req=request({hostname:'127.0.0.1',port,method,path,headers:{'content-type':'application/json',...(token ? {authorization:`Bearer ${token}`} : {})}},res=>{
   const chunks:Buffer[]=[];res.on('data',c=>chunks.push(Buffer.from(c)));res.on('end',()=>resolve({status:res.statusCode || 0,body:JSON.parse(Buffer.concat(chunks).toString())}));
  });req.on('error',reject);req.end(bytes);
 });
}
it('real loopback server advertises only explicit dual gate and serves register/login/profile without mail',async()=>{
 const server=await startFamilyApiServer({port:0,host:'127.0.0.1',env:{LAMPY_FAMILY_API_MODE:'test',LAMPY_FAMILY_API_TEST_TOKENS:'test:apple',LAMPY_TEST_ACCOUNT_LOGIN:'1',LAMPY_CONTROLLED_EMAIL_ACCOUNTS:'1'}});
 try {
  expect((await json(server.port,'GET','/health')).body.controlledEmailAccounts).toBe(true);
  const input={email:'test@example.com',password:'a-safe-password',nickname:'窗边'};
  const registered=await json(server.port,'POST','/v2/auth/email/register',input);expect(registered.status).toBe(201);
  const token=registered.body.sessionToken;expect((await json(server.port,'GET','/v2/me/profile',undefined,token)).body.nickname).toBe('窗边');
  expect((await json(server.port,'PATCH','/v2/me/profile',{nickname:'午后'},token)).body.nickname).toBe('午后');
  const signed=await json(server.port,'POST','/v2/auth/email/login',input);expect(signed.status).toBe(200);expect(signed.body.userId).toBe(registered.body.userId);
  expect((await json(server.port,'POST','/v2/auth/email/register',input)).status).toBe(409);
 } finally {await server.close();}
});
it('listener with registration flag alone refuses the registration endpoint',async()=>{
 const server=await startFamilyApiServer({port:0,host:'127.0.0.1',env:{LAMPY_FAMILY_API_MODE:'test',LAMPY_FAMILY_API_TEST_TOKENS:'test:apple',LAMPY_CONTROLLED_EMAIL_ACCOUNTS:'1'}});
 try {
  expect((await json(server.port,'GET','/health')).body.controlledEmailAccounts).toBe(false);
  expect((await json(server.port,'POST','/v2/auth/email/register',{email:'test@example.com',password:'a-safe-password',nickname:'窗边'})).status).toBe(503);
 } finally {await server.close();}
});
