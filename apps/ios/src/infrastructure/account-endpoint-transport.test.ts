import {createFamilyHttpTransport} from './family-http-client';

it.each(['http://10.review.example','http://192.168.review.example','http://172.16.review.example'])('rejects %s before invoking fetch with any credentials',async baseUrl=>{
 const fetchImpl=jest.fn();const transport=createFamilyHttpTransport({baseUrl,fetchImpl:fetchImpl as typeof fetch});
 await expect(transport.request({method:'GET',path:'/v2/me/email-code',sessionToken:'review-only-not-a-real-token'})).rejects.toMatchObject({code:'SERVER_UNREACHABLE'});
 expect(fetchImpl).not.toHaveBeenCalled();
});
it('still sends authenticated requests to an HTTPS backend',async()=>{
 const fetchImpl=jest.fn(async()=>new Response(JSON.stringify({ok:true}),{status:200}));
 const transport=createFamilyHttpTransport({baseUrl:'https://accounts.example.com',fetchImpl:fetchImpl as typeof fetch});
 await expect(transport.request({method:'GET',path:'/v2/me/email-code',sessionToken:'test-token'})).resolves.toMatchObject({status:200});
 expect(fetchImpl).toHaveBeenCalledWith('https://accounts.example.com/v2/me/email-code',expect.objectContaining({headers:expect.objectContaining({authorization:'Bearer test-token'})}));
});
