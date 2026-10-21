import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFamilyCommands } from './commands';
import { createMapAppleVerifier } from './apple';
import { createFamilyStore } from './store';
import { createMemoryFamilyRepository } from './repository';
import { createArgon2idPasswordHasher, ARGON2ID_TEST } from './password';
import { applyFamilyApiSchema } from './schema';
import { openFamilySqliteDatabase } from './node-db';
import { createSqliteFamilyRepository } from './sqlite-repository';
import { dispatchFamilyApi } from './http';
const input={email:' Person@Example.com ',password:'safe-password-123',nickname:' 小禾 '};
function harness(enabled=true) {
  const store=createFamilyStore();
  const repository=createMemoryFamilyRepository(store);
  const commands=createFamilyCommands({repository,apple:createMapAppleVerifier({apple:{appleSubject:'apple',email:'person@example.com'}}),testAccountLoginEnabled:true,controlledEmailAccountsEnabled:enabled,passwordHasher:createArgon2idPasswordHasher(ARGON2ID_TEST)});
  return {commands,store,repository};
}
it('normalizes identity, registers and signs in atomically; passwords are hashed and profile contains no email',async()=>{
  const {commands,store}=harness();const registered=await commands.registerControlledEmail(input,'peer');
  expect(store.accounts).toHaveLength(1);expect(store.testCredentials[0].loginNormalized).toBe('person@example.com');
  expect(store.testCredentials[0].passwordHash).toMatch(/^argon2id\$/);expect(store.testCredentials[0].passwordHash).not.toContain(input.password);
  expect(await commands.getMyProfile(registered.sessionToken)).toMatchObject({userId:registered.userId,nickname:'小禾',avatar:'system'});
  expect(JSON.stringify(await commands.getMyProfile(registered.sessionToken))).not.toContain('example.com');
  const signed=await commands.signInWithControlledEmail({email:'PERSON@example.com',password:input.password});expect(signed.userId).toBe(registered.userId);
  expect(store.sessions).toHaveLength(2);await commands.signOut(registered.sessionToken);expect(await commands.getMyProfile(signed.sessionToken)).toMatchObject({nickname:'小禾'});
});
it('never binds to Apple by an unverified email; nicknames can repeat and edits are scoped to the session',async()=>{
  const {commands}=harness();const a=await commands.registerControlledEmail(input);
  const b=await commands.registerControlledEmail({...input,email:'b@example.com'});
  const apple=await commands.signInWithApple('apple');expect(apple.userId).not.toBe(a.userId);
  await commands.updateMyProfile(a.sessionToken,'新昵称');expect(await commands.getMyProfile(b.sessionToken)).toMatchObject({nickname:'小禾'});
  await expect(commands.getMyProfile('fake')).rejects.toMatchObject({code:'UNAUTHENTICATED'});
  await expect(commands.updateMyProfile(a.sessionToken,'\n')).rejects.toMatchObject({code:'BAD_REQUEST'});
  await expect(commands.updateMyProfile(a.sessionToken,'字'.repeat(25))).rejects.toMatchObject({code:'BAD_REQUEST'});
});
it('requires both switches, reports duplicate identity, preserves originals on errors and does not leak disabled credentials',async()=>{
  const {commands,store,repository}=harness();await commands.registerControlledEmail(input);
  await expect(commands.registerControlledEmail({...input,email:'person@example.com'})).rejects.toMatchObject({code:'EMAIL_ACCOUNT_EXISTS'});
  expect(store.accounts).toHaveLength(1);expect(store.profiles).toHaveLength(1);
  await expect(commands.signInWithControlledEmail({...input,password:'wrong'})).rejects.toMatchObject({code:'AUTH_FAILED'});
  await commands.disableTestAccount('person@example.com');await expect(commands.signInWithControlledEmail(input)).rejects.toMatchObject({code:'AUTH_FAILED'});
  await expect(harness(false).commands.registerControlledEmail(input)).rejects.toMatchObject({code:'EMAIL_ACCOUNT_CLOSED'});
  const closed=createFamilyCommands({repository,apple:createMapAppleVerifier({}),controlledEmailAccountsEnabled:true});
  expect(closed.health().controlledEmailAccounts).toBe(false);await expect(closed.registerControlledEmail(input)).rejects.toMatchObject({code:'EMAIL_ACCOUNT_CLOSED'});
});
it('has deterministic duplicate behavior for concurrent registration and rate limits login and registration across identities',async()=>{
  const {commands,store}=harness();const attempts=await Promise.allSettled([commands.registerControlledEmail(input),commands.registerControlledEmail(input)]);
  expect(attempts.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(store.accounts).toHaveLength(1);
  const other=harness().commands;
  for(let i=0;i<8;i++) await other.registerControlledEmail({...input,email:`user${i}@example.com`},'same-peer');
  await expect(other.registerControlledEmail({...input,email:'last@example.com'},'same-peer')).rejects.toMatchObject({code:'RATE_LIMITED'});
  const login=harness().commands;for(let i=0;i<8;i++) await expect(login.signInWithControlledEmail({email:`missing${i}@example.com`,password:input.password},'peer')).rejects.toMatchObject({code:'AUTH_FAILED'});
  await expect(login.signInWithControlledEmail(input,'peer')).rejects.toMatchObject({code:'RATE_LIMITED'});
});
it('HTTP uses authenticated /me identity, ignores injected userId/avatar/email and rejects closed registration',async()=>{
 const {commands}=harness();const created=await dispatchFamilyApi(commands,{method:'POST',path:'/v2/auth/email/register',headers:{},body:input,peer:'local'});
 expect(created.status).toBe(201);const session=(created.body as {sessionToken:string}).sessionToken;
 const response=await dispatchFamilyApi(commands,{method:'PATCH',path:'/v2/me/profile',headers:{authorization:`Bearer ${session}`},body:{nickname:'自己',userId:'someone-else',avatar:'remote',email:'other@example.com'}});
 expect(response.status).toBe(200);expect(response.body).toMatchObject({nickname:'自己',avatar:'system'});
 const closed=await dispatchFamilyApi(harness(false).commands,{method:'POST',path:'/v2/auth/email/register',headers:{},body:input});expect(closed.status).toBe(503);
});
it('migration 26 keeps existing accounts and SQLite registration, nickname and independent sessions survive restart',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'lampy-email-'));const filename=path.join(dir,'family.sqlite');let db=openFamilySqliteDatabase(filename);
 try {
  await applyFamilyApiSchema(db);expect(await db.getFirst('SELECT MAX(version) AS version FROM family_schema_migrations')).toEqual({version:33});
  const build=()=>createFamilyCommands({repository:createSqliteFamilyRepository(db),apple:createMapAppleVerifier({}),testAccountLoginEnabled:true,controlledEmailAccountsEnabled:true,passwordHasher:createArgon2idPasswordHasher(ARGON2ID_TEST)});
  const first=build();const a=await first.registerControlledEmail(input);await first.updateMyProfile(a.sessionToken,'长大的日子');await db.close();db=openFamilySqliteDatabase(filename);
  const second=build();const b=await second.signInWithControlledEmail(input);expect(b.userId).toBe(a.userId);expect(await second.getMyProfile(a.sessionToken)).toMatchObject({nickname:'长大的日子'});
  await second.signOut(a.sessionToken);expect(await second.getMyProfile(b.sessionToken)).toMatchObject({nickname:'长大的日子'});
  const closed=createFamilyCommands({repository:createSqliteFamilyRepository(db),apple:createMapAppleVerifier({})});await expect(closed.getMyProfile(b.sessionToken)).rejects.toMatchObject({code:'UNAUTHENTICATED'});
 } finally {await db.close();await rm(dir,{recursive:true,force:true});}
});
