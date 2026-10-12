import { generateKeyPairSync, randomBytes, verify } from 'node:crypto';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAppleGrantService, appleGrantServiceFromEnv } from './apple-grants';
import { createMapAppleVerifier } from './apple';
import { openFamilySqliteDatabase } from './node-db';
import { applyFamilyApiSchema } from './schema';
import { createSqliteFamilyRepository } from './sqlite-repository';
import { startFamilyApiServer } from './listen';

const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
function fixture() {
 const http=jest.fn(async()=>({status:200,json:async()=>({id_token:'verified-token',refresh_token:'private-refresh-token'})}));
 const verifier=createMapAppleVerifier({'verified-token':{appleSubject:'subject',nonce:'nonce'}});
 const options={clientId:'app.lampy.ios',teamId:'B283NY984J',keyId:'ABCDEFGHIJ',privateKey:pair.privateKey,encryptionKey:randomBytes(32),keyVersion:'v1',verifier,fetch:http as unknown as typeof fetch,clock:{now:()=>new Date('2026-10-12T10:00:00Z')}};
 return {http,options,service:createAppleGrantService(options)};
}
it('exchanges once, validates returned identity and nonce, and signs an ES256 client secret',async()=>{
 const h=fixture();expect(await h.service.exchange({authorizationCode:'one-use-code',appleSubject:'subject',nonce:'nonce'})).toBe('private-refresh-token');
 expect(h.http).toHaveBeenCalledTimes(1);const [url,request]=(h.http.mock.calls[0] as unknown as [string,RequestInit]);expect(url).toBe('https://appleid.apple.com/auth/token');expect(request.redirect).toBe('error');
 const form=request.body as URLSearchParams;expect(form.get('code')).toBe('one-use-code');expect(form.get('grant_type')).toBe('authorization_code');
 const parts=form.get('client_secret')!.split('.');const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString());
 expect(claims).toMatchObject({iss:'B283NY984J',sub:'app.lampy.ios',aud:'https://appleid.apple.com'});expect(claims.exp-claims.iat).toBe(300);
 expect(verify('sha256',Buffer.from(parts.slice(0,2).join('.')),{key:pair.publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(parts[2],'base64url'))).toBe(true);
 await expect(h.service.exchange({authorizationCode:'code',appleSubject:'other',nonce:'nonce'})).rejects.toMatchObject({code:'APPLE_GRANT_UNAVAILABLE'});
 await expect(h.service.exchange({authorizationCode:'code',appleSubject:'subject',nonce:'wrong'})).rejects.toMatchObject({code:'APPLE_GRANT_UNAVAILABLE'});
});
it('encrypts with identity-bound AAD, revokes over HTTPS, and treats repeated 200 as success',async()=>{
 const h=fixture();const grant=h.service.seal('user','subject','private-refresh-token');expect(JSON.stringify(grant)).not.toContain('private-refresh-token');
 expect(h.service.seal('user','subject','private-refresh-token').ciphertext).not.toBe(grant.ciphertext);
 await h.service.revoke(grant);await h.service.revoke(grant);expect(h.http).toHaveBeenCalledTimes(2);
 const [url,request]=h.http.mock.calls[0] as unknown as [string,RequestInit];expect(url).toBe('https://appleid.apple.com/auth/revoke');expect((request.body as URLSearchParams).get('token')).toBe('private-refresh-token');expect((request.body as URLSearchParams).get('token_type_hint')).toBe('refresh_token');
});
it('tampered ciphertext, reassigned user/subject, wrong key/version fail before any network request',async()=>{
 const h=fixture(),grant=h.service.seal('user','subject','private-refresh-token');
 for(const bad of [{...grant,userId:'other'},{...grant,appleSubject:'other'},{...grant,keyVersion:'v2'},{...grant,ciphertext:grant.ciphertext.slice(0,-3)+'AAA'}]) await expect(h.service.revoke(bad)).rejects.toMatchObject({code:'APPLE_GRANT_UNAVAILABLE'});
 await expect(createAppleGrantService({...h.options,encryptionKey:randomBytes(32)}).revoke(grant)).rejects.toMatchObject({code:'APPLE_GRANT_UNAVAILABLE'});expect(h.http).not.toHaveBeenCalled();
});
it('network, non-200 and malformed response fail with sanitized errors, not secret payloads',async()=>{
 const h=fixture();h.http.mockRejectedValueOnce(new Error('private-refresh-token secret transport detail'));
 await expect(h.service.revoke(h.service.seal('user','subject','private-refresh-token'))).rejects.toMatchObject({code:'APPLE_GRANT_UNAVAILABLE',message:'Apple authorization could not be completed.'});
 h.http.mockResolvedValueOnce({status:400,json:async()=>({id_token:'verified-token',refresh_token:'private-refresh-token'})});await expect(h.service.exchange({authorizationCode:'code',appleSubject:'subject',nonce:'nonce'})).rejects.toMatchObject({code:'APPLE_GRANT_UNAVAILABLE'});
 h.http.mockResolvedValueOnce({status:200,json:async()=>({id_token:'',refresh_token:''})});await expect(h.service.exchange({authorizationCode:'code',appleSubject:'subject',nonce:'nonce'})).rejects.toMatchObject({code:'APPLE_GRANT_UNAVAILABLE'});
});
it('capture is off by default; enabled configuration requires protected server-only secret files',()=>{
 const verifier=createMapAppleVerifier({});expect(appleGrantServiceFromEnv({},verifier)).toBeUndefined();
 expect(()=>appleGrantServiceFromEnv({LAMPY_APPLE_GRANT_CAPTURE:'1'},verifier)).toThrow('production');
 const dir=mkdtempSync(path.join(tmpdir(),'lampy-grant-key-'));try {
  const pem=path.join(dir,'AuthKey.p8'),key=path.join(dir,'grant.key');writeFileSync(pem,pair.privateKey.export({format:'pem',type:'pkcs8'}),{mode:0o600});writeFileSync(key,randomBytes(32).toString('base64'),{mode:0o600});
  const env={LAMPY_PUBLIC_TEST_LOGIN:'1',LAMPY_FAMILY_API_MODE:'production',LAMPY_APPLE_LOGIN_ENABLED:'1',LAMPY_APPLE_GRANT_CAPTURE:'1',LAMPY_APPLE_CLIENT_ID:'app.lampy.ios',LAMPY_APPLE_TEAM_ID:'B283NY984J',LAMPY_APPLE_KEY_ID:'ABCDEFGHIJ',LAMPY_APPLE_PRIVATE_KEY_PATH:pem,LAMPY_APPLE_GRANT_KEY_PATH:key};
  expect(appleGrantServiceFromEnv(env,verifier)).toBeDefined();chmodSync(key,0o644);expect(()=>appleGrantServiceFromEnv(env,verifier)).toThrow('configuration');
 } finally {rmSync(dir,{recursive:true,force:true});}
});
it('encrypted grant survives SQLite reopen with the same key and no plaintext token in its row',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'lampy-grant-db-'));let db=openFamilySqliteDatabase(path.join(dir,'family.sqlite'));const h=fixture();
 try {
  await applyFamilyApiSchema(db);const repository=createSqliteFamilyRepository(db);const grant=h.service.seal('user','subject','private-refresh-token');
  await repository.withTransaction(async tx=>{await tx.saveAccount({userId:'user',appleSubject:'subject',createdAt:'2026-10-12T10:00:00Z'});await tx.saveAppleGrant(grant);});
  expect(JSON.stringify(await db.getFirst('SELECT * FROM family_apple_grants'))).not.toContain('private-refresh-token');
  await db.close();db=openFamilySqliteDatabase(path.join(dir,'family.sqlite'));const restored=await createSqliteFamilyRepository(db).withTransaction(tx=>tx.findAppleGrant('user'));
  expect(restored).toEqual(grant);if(!restored) throw new Error('Missing saved grant');await createAppleGrantService(h.options).revoke(restored);expect(h.http).toHaveBeenCalledTimes(1);
 } finally {await db.close();rmSync(dir,{recursive:true,force:true});}
});

it('startup refuses a changed encryption key without overwriting existing grants',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'lampy-grant-startup-'));let db=openFamilySqliteDatabase(path.join(dir,'family.sqlite'));const h=fixture();
 try {
  await applyFamilyApiSchema(db);const original=h.service.seal('user','subject','private-refresh-token');
  await createSqliteFamilyRepository(db).withTransaction(async tx=>{await tx.saveAccount({userId:'user',appleSubject:'subject',createdAt:new Date().toISOString()});await tx.saveAppleGrant(original);});await db.close();
  const pem=path.join(dir,'key.p8'),key=path.join(dir,'grant.key');writeFileSync(pem,pair.privateKey.export({format:'pem',type:'pkcs8'}),{mode:0o600});writeFileSync(key,randomBytes(32).toString('base64'),{mode:0o600});
  await expect(startFamilyApiServer({port:0,host:'127.0.0.1',env:{LAMPY_FAMILY_API_MODE:'production',LAMPY_FAMILY_DATABASE_PATH:path.join(dir,'family.sqlite'),LAMPY_FAMILY_MEDIA_PATH:path.join(dir,'media'),LAMPY_PUBLIC_TEST_LOGIN:'1',LAMPY_PUBLIC_TEST_TRUST_LOOPBACK_PROXY:'1',LAMPY_APPLE_LOGIN_ENABLED:'1',LAMPY_APPLE_GRANT_CAPTURE:'1',LAMPY_APPLE_CLIENT_ID:'app.lampy.ios',LAMPY_APPLE_TEAM_ID:'B283NY984J',LAMPY_APPLE_KEY_ID:'ABCDEFGHIJ',LAMPY_APPLE_PRIVATE_KEY_PATH:pem,LAMPY_APPLE_GRANT_KEY_PATH:key}})).rejects.toThrow('Existing Apple grants cannot be read');
  db=openFamilySqliteDatabase(path.join(dir,'family.sqlite'));expect(await createSqliteFamilyRepository(db).withTransaction(tx=>tx.findAppleGrant('user'))).toEqual(original);
 } finally {await db.close();rmSync(dir,{recursive:true,force:true});}
});

it('retains distinct refresh grants and deduplicates the same token for later revocation',async()=>{
 const db=openFamilySqliteDatabase(':memory:'),h=fixture();
 try {
  await applyFamilyApiSchema(db);const repo=createSqliteFamilyRepository(db);
  const first=h.service.seal('user','subject','first'),same=h.service.seal('user','subject','first'),second=h.service.seal('user','subject','second');
  expect(first.fingerprint).toBe(same.fingerprint);expect(second.fingerprint).not.toBe(first.fingerprint);
  await repo.withTransaction(async tx=>{await tx.saveAccount({userId:'user',appleSubject:'subject',createdAt:new Date().toISOString()});await tx.saveAppleGrant(first);await tx.saveAppleGrant(same);await tx.saveAppleGrant(second);});
  const grants=await repo.withTransaction(tx=>tx.listAppleGrants('user'));expect(grants).toHaveLength(2);
  for(const grant of grants) await h.service.revoke(grant);expect(h.http).toHaveBeenCalledTimes(2);
 } finally {await db.close();}
});
