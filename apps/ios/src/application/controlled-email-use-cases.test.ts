import { createFamilyUseCases, createMemoryFamilySessionStore } from './family-use-cases';
import { createPendingFamilyOperationDisk, createPendingFamilyOperationStore } from '../infrastructure/pending-family-operations';
import { createFamilyApiClient, createDispatchTransport } from '../infrastructure/family-http-client';
import { dispatchFamilyApi } from '../family-api/http';
import { createFamilyCommands } from '../family-api/commands';
import { createFamilyStore } from '../family-api/store';
import { createMapAppleVerifier } from '../family-api/apple';
import { ARGON2ID_TEST, createArgon2idPasswordHasher } from '../family-api/password';
const input={email:'a@example.com',password:'a-safe-password',nickname:'小禾'};
function deferred<T>() {let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {resolve,promise};}
function harness() {
 const store=createFamilyStore();const commands=createFamilyCommands({store,apple:createMapAppleVerifier({}),testAccountLoginEnabled:true,controlledEmailAccountsEnabled:true,passwordHasher:createArgon2idPasswordHasher(ARGON2ID_TEST)});
 const client=createFamilyApiClient(createDispatchTransport(r=>dispatchFamilyApi(commands,r)));const session=createMemoryFamilySessionStore();
 const service=createFamilyUseCases({client,session,pending:createPendingFamilyOperationStore(createPendingFamilyOperationDisk())});return {service,client,session,commands,store};
}
it('registers, restores authenticated profile, edits nickname and keeps device logout scoped',async()=>{
 const h=harness();await h.service.registerControlledEmail(input,()=>true);expect(await h.service.getMyProfile(()=>true)).toMatchObject({nickname:'小禾'});
 await h.service.updateMyProfile('风里的日子',()=>true);expect(await h.service.getMyProfile(()=>true)).toMatchObject({nickname:'风里的日子'});
 const other=await h.commands.signInWithControlledEmail(input);await h.service.signOut();expect(await h.commands.getMyProfile(other.sessionToken)).toMatchObject({nickname:'风里的日子'});
});
it('a late login after leaving cannot persist its session; only that discarded token is revoked',async()=>{
 const h=harness();await h.commands.registerControlledEmail(input);const result=await h.commands.signInWithControlledEmail(input);const gate=deferred<typeof result>();h.client.signInWithControlledEmail=()=>gate.promise;let current=true;
 const login=h.service.signInWithControlledEmail(input,()=>current);await Promise.resolve();current=false;gate.resolve(result);
 await expect(login).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});expect(await h.session.getSessionToken()).toBeNull();expect(h.store.sessions.find(s=>s.token===result.sessionToken)).toBeUndefined();
});
it('A finishing after B signs in neither overwrites B nor revokes B',async()=>{
 const h=harness();await h.commands.registerControlledEmail(input);const a=await h.commands.signInWithControlledEmail(input);const bInput={...input,email:'b@example.com',nickname:'另一个'};const b=await h.commands.registerControlledEmail(bInput);const gate=deferred<typeof a>();
 h.client.signInWithControlledEmail=({email})=>email===input.email ? gate.promise : Promise.resolve(b);
 const old=h.service.signInWithControlledEmail(input,()=>true);await Promise.resolve();await h.service.signInWithControlledEmail(bInput,()=>true);gate.resolve(a);
 await expect(old).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});expect(await h.session.getUserId()).toBe(b.userId);expect(await h.commands.getMyProfile(b.sessionToken)).toMatchObject({nickname:'另一个'});
});
it('profile reads from an old account cannot be returned after account switch',async()=>{
 const h=harness();await h.service.registerControlledEmail(input,()=>true);const oldProfile=await h.service.getMyProfile(()=>true);const gate=deferred<typeof oldProfile>();h.client.getMyProfile=()=>gate.promise;
 const read=h.service.getMyProfile(()=>true);await Promise.resolve();await h.session.setSession({userId:'other',sessionToken:'other-token'});gate.resolve(oldProfile);
 await expect(read).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
});
it('cancellation during secure-store persistence clears only its own token before newer commits',async()=>{
 const h=harness();const result=await h.commands.registerControlledEmail(input);h.client.signInWithControlledEmail=async()=>result;
 const started=deferred<void>(),release=deferred<void>();const original=h.session.setSession;h.session.setSession=async value=>{started.resolve();await release.promise;return original(value);};let current=true;
 const pending=h.service.signInWithControlledEmail(input,()=>current);await started.promise;current=false;release.resolve();
 await expect(pending).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});expect(await h.session.getSessionToken()).toBeNull();
});
it('legacy Apple and test-login results cannot overwrite a newer email login',async()=>{
 const h=harness();const email=await h.commands.registerControlledEmail(input);const old=await h.commands.registerControlledEmail({...input,email:'old@example.com'});const gate=deferred<typeof old>();h.client.signInWithApple=()=>gate.promise;
 const previous=h.service.signInWithApple('old');await h.service.signInWithControlledEmail(input,()=>true);gate.resolve(old);await expect(previous).rejects.toMatchObject({code:'STALE_FAMILY_REQUEST'});
 expect(await h.session.getUserId()).toBe(email.userId);expect(await h.service.getMyProfile(()=>true)).toMatchObject({nickname:'小禾'});
});
