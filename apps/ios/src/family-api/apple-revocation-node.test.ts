import {generateKeyPairSync,verify} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import path from 'node:path';
import {appleRevokerFromEnv} from './apple-revocation-node';
it('exchanges the fresh authorization code, checks identity and revokes with a signed ES256 secret',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'lampy-revoke-'));const key=generateKeyPairSync('ec',{namedCurve:'prime256v1'});const file=path.join(dir,'key.p8');
 writeFileSync(file,key.privateKey.export({type:'pkcs8',format:'pem'}));
 const verifier={verifyIdentityToken:jest.fn(async()=>({appleSubject:'a'}))};const calls:{url:string;body:URLSearchParams}[]=[];
 const request=jest.fn(async(url,init)=>{calls.push({url,body:new URLSearchParams(init.body)});return {ok:true,json:async()=>({id_token:'identity',refresh_token:'refresh'})};}) as unknown as typeof fetch;
 try {
 const env={LAMPY_APPLE_CLIENT_ID:'app.lampy.ios',LAMPY_APPLE_SIGNIN_KEY_FILE:file,LAMPY_APPLE_SIGNIN_KEY_ID:'KEY',LAMPY_APPLE_SIGNIN_TEAM_ID:'TEAM'};
 await appleRevokerFromEnv(env,verifier,request)!.revoke('one-use','a','nonce');
 expect(calls.map(c=>c.url)).toEqual(['https://appleid.apple.com/auth/token','https://appleid.apple.com/auth/revoke']);
 expect(calls[0].body.get('code')).toBe('one-use');expect(calls[1].body.get('token')).toBe('refresh');expect(calls[1].body.get('token_type_hint')).toBe('refresh_token');
 expect(verifier.verifyIdentityToken).toHaveBeenCalledWith('identity','nonce');
 const parts=calls[0].body.get('client_secret')!.split('.');expect(JSON.parse(Buffer.from(parts[1],'base64url').toString())).toMatchObject({iss:'TEAM',sub:'app.lampy.ios',aud:'https://appleid.apple.com'});
 expect(verify('sha256',Buffer.from(parts[0]+'.'+parts[1]),{key:key.publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(parts[2],'base64url'))).toBe(true);
 verifier.verifyIdentityToken.mockResolvedValue({appleSubject:'different'});await expect(appleRevokerFromEnv(env,verifier,request)!.revoke('one-use','a','nonce')).rejects.toThrow('another identity');expect(request).toHaveBeenCalledTimes(3);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
it('missing revocation configuration is explicit; partial configuration cannot silently succeed',()=>{
 expect(appleRevokerFromEnv({}, {verifyIdentityToken:jest.fn()})).toBeUndefined();
 expect(()=>appleRevokerFromEnv({LAMPY_APPLE_SIGNIN_KEY_ID:'KEY'},{verifyIdentityToken:jest.fn()})).toThrow('Incomplete');
});
