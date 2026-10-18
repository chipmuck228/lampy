import {createPrivateKey,sign} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {AppleVerifier} from './types';
import type {AppleRevoker} from './account-deletion';
export function appleRevokerFromEnv(env:Partial<NodeJS.ProcessEnv>,verifier:AppleVerifier,request:typeof fetch=fetch):AppleRevoker|undefined {
 const file=env.LAMPY_APPLE_SIGNIN_KEY_FILE, keyId=env.LAMPY_APPLE_SIGNIN_KEY_ID,team=env.LAMPY_APPLE_SIGNIN_TEAM_ID,client=env.LAMPY_APPLE_CLIENT_ID;
 const values=[file,keyId,team];if(values.every(v=>!v))return undefined;
 if(!file||!keyId||!team||!client)throw new Error('Incomplete Apple sign-in revocation configuration.');
 const key=createPrivateKey(readFileSync(file));
 if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw new Error('Apple sign-in key must be P-256.');
 return {async revoke(code,subject,nonce) {
  const now=Math.floor(Date.now()/1000);
  const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const head=encode({alg:'ES256',kid:keyId});const payload=encode({iss:team,iat:now,exp:now+300,aud:'https://appleid.apple.com',sub:client});
  const unsigned=head+'.'+payload;
  const secret=unsigned+'.'+sign('sha256',Buffer.from(unsigned),{key,dsaEncoding:'ieee-p1363'}).toString('base64url');
  async function post(endpoint:string,body:Record<string,string>) {
   const response=await request('https://appleid.apple.com/auth/'+endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client!,client_secret:secret,...body}).toString(),signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw new Error('Apple token operation failed.');
   return response;
  }
  const response=await post('token',{grant_type:'authorization_code',code});
  const result=await response.json() as {id_token?:string;refresh_token?:string;access_token?:string};
  if(!result.id_token)throw new Error('Apple token response missing identity.');
  const identity=await verifier.verifyIdentityToken(result.id_token,nonce);
  if(identity.appleSubject!==subject)throw new Error('Apple code belongs to another identity.');
  const token=result.refresh_token||result.access_token;if(!token)throw new Error('Apple token response missing token.');
  await post('revoke',{token,token_type_hint:result.refresh_token?'refresh_token':'access_token'});
 }};
}
