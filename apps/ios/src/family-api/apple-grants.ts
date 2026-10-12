import { createCipheriv, createDecipheriv, createHmac, createPrivateKey, randomBytes, sign, type KeyObject } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { FamilyError } from './errors';
import type { AppleGrant, AppleGrantService, AppleVerifier, FamilyClock } from './types';

const APPLE_ORIGIN = 'https://appleid.apple.com';
function unavailable() { return new FamilyError('APPLE_GRANT_UNAVAILABLE','Apple authorization could not be completed.'); }

/** Server-only. Secrets never enter EXPO_PUBLIC config, responses or diagnostic logs. */
export function createAppleGrantService(options: {
  clientId: string; teamId: string; keyId: string; privateKey: KeyObject;
  encryptionKey: Uint8Array; keyVersion: string; verifier: AppleVerifier;
  fetch?: typeof fetch; clock?: FamilyClock;
}): AppleGrantService {
  if(!options.clientId || !/^[A-Z0-9]{10}$/.test(options.teamId) || !/^[A-Z0-9]{10}$/.test(options.keyId) ||
    options.privateKey.asymmetricKeyType!=='ec' || options.privateKey.asymmetricKeyDetails?.namedCurve!=='prime256v1' ||
    options.encryptionKey.byteLength!==32 || !/^[A-Za-z0-9_-]{1,32}$/.test(options.keyVersion)) throw new Error('Invalid Apple grant configuration.');
  const key=Buffer.from(options.encryptionKey);
  const now=()=> (options.clock ?? {now:()=>new Date()}).now();
  const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
  function clientSecret() {
    const iat=Math.floor(now().getTime()/1000);
    const value=encode({alg:'ES256',kid:options.keyId})+'.'+encode({iss:options.teamId,iat,exp:iat+300,aud:APPLE_ORIGIN,sub:options.clientId});
    return value+'.'+sign('sha256',Buffer.from(value),{key:options.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
  }
  function aad(userId:string,subject:string,fingerprint:string) {
    return Buffer.from(JSON.stringify(['lampy-apple-grant',options.clientId,options.keyVersion,userId,subject,fingerprint]));
  }
  async function post(path:'/auth/token'|'/auth/revoke',fields:Record<string,string>) {
    try {
      const response=await (options.fetch ?? fetch)(APPLE_ORIGIN+path,{
        method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({client_id:options.clientId,client_secret:clientSecret(),...fields}),
        signal:AbortSignal.timeout(10_000),redirect:'error',
      });
      if(response.status!==200) throw unavailable();
      return response;
    } catch { throw unavailable(); }
  }
  function decrypt(grant:AppleGrant) {
      let token:string;
      try {
        if(grant.keyVersion!==options.keyVersion) throw unavailable();
        const parts=grant.ciphertext.split('.');if(parts.length!==3) throw unavailable();
        const [iv,tag,bytes]=parts.map(p=>Buffer.from(p,'base64url'));
        if(iv.length!==12 || tag.length!==16 || bytes.length>16384) throw unavailable();
        const decipher=createDecipheriv('aes-256-gcm',key,iv);
        decipher.setAAD(aad(grant.userId,grant.appleSubject,grant.fingerprint));decipher.setAuthTag(tag);
        token=Buffer.concat([decipher.update(bytes),decipher.final()]).toString('utf8');
        if(!token) throw unavailable();
      } catch { throw unavailable(); }
    return token;
  }
  return {
    async exchange(input) {
      if(!input.authorizationCode.trim() || input.authorizationCode.length>4096) throw unavailable();
      const response=await post('/auth/token',{grant_type:'authorization_code',code:input.authorizationCode});
      try {
        const value:unknown=await response.json();
        if(!value || typeof value!=='object') throw unavailable();
        const body=value as Record<string,unknown>;
        if(typeof body.refresh_token!=='string' || !body.refresh_token || body.refresh_token.length>16384 ||
          typeof body.id_token!=='string' || !body.id_token || body.id_token.length>8192) throw unavailable();
        const verified=await options.verifier.verifyIdentityToken(body.id_token,input.nonce);
        if(verified.appleSubject!==input.appleSubject) throw unavailable();
        return body.refresh_token;
      } catch { throw unavailable(); }
    },
    seal(userId,appleSubject,refreshToken) {
      if(!userId || !appleSubject || !refreshToken || Buffer.byteLength(refreshToken,'utf8')>16384) throw unavailable();
      const fingerprint=createHmac('sha256',key).update(JSON.stringify([userId,appleSubject,refreshToken])).digest('hex');
      const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key,iv);
      cipher.setAAD(aad(userId,appleSubject,fingerprint));
      const ciphertext=Buffer.concat([cipher.update(refreshToken,'utf8'),cipher.final()]);
      return {userId,appleSubject,fingerprint,keyVersion:options.keyVersion,updatedAt:now().toISOString(),
        ciphertext:[iv,cipher.getAuthTag(),ciphertext].map(b=>b.toString('base64url')).join('.')};
    },
    assertReadable(grant) { decrypt(grant); },
    async revoke(grant:AppleGrant) {
      const token=decrypt(grant);
      // 200 includes an already revoked token; non-200/network failures must be retried by a durable job.
      await post('/auth/revoke',{token,token_type_hint:'refresh_token'});
    },
  };
}

function privateFile(path:string|undefined) {
  if(!path) throw new Error('Apple grant secret file is missing.');
  const stat=statSync(path);
  if(!stat.isFile() || stat.size>65536 || (stat.mode & 0o027)!==0) throw new Error('Apple grant secret file must be a protected regular file (0600 or 0640).');
  return readFileSync(path,'utf8').trim();
}

export function appleGrantServiceFromEnv(env:Partial<NodeJS.ProcessEnv>,verifier:AppleVerifier):AppleGrantService|undefined {
  if(env.LAMPY_APPLE_GRANT_CAPTURE!=='1') return undefined;
  if(env.LAMPY_FAMILY_API_MODE!=='production' || env.LAMPY_APPLE_LOGIN_ENABLED!=='1' || env.LAMPY_PUBLIC_TEST_LOGIN!=='1') throw new Error('Apple grant capture requires production, Apple login and controlled public auth.');
  try {
    const encoded=privateFile(env.LAMPY_APPLE_GRANT_KEY_PATH);
    if(!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error('Invalid encryption key.');
    return createAppleGrantService({
      clientId:env.LAMPY_APPLE_CLIENT_ID || '',teamId:env.LAMPY_APPLE_TEAM_ID || '',keyId:env.LAMPY_APPLE_KEY_ID || '',
      privateKey:createPrivateKey(privateFile(env.LAMPY_APPLE_PRIVATE_KEY_PATH)),
      encryptionKey:Buffer.from(encoded,'base64'),keyVersion:env.LAMPY_APPLE_GRANT_KEY_VERSION || 'v1',verifier,
    });
  } catch { throw new Error('Apple grant capture configuration is missing, invalid or unreadable.'); }
}
