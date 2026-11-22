import {createFamilyCommands} from './commands';
import {createMapAppleVerifier} from './apple';
import {createFamilyStore} from './store';
import {createMemoryFamilyRepository,type FamilyRepository} from './repository';
import {openFamilySqliteDatabase} from './node-db';
import {applyFamilyApiSchema} from './schema';
import {createSqliteFamilyRepository} from './sqlite-repository';
import {EMAIL_CODE_NAMESPACE,type EmailCodeIntent,type EmailCodeSender,type EmailCodeTicket} from './email-code-types';
import {DELETE_ACCOUNT_CONFIRMATION} from './account-deletion';
import {dispatchFamilyApi} from './http';

for(const sqlite of [false,true])describe(sqlite?'SQLite email codes':'memory email codes',()=>{
  let db:ReturnType<typeof openFamilySqliteDatabase>|undefined;
  let repository:FamilyRepository,now:Date,failed:boolean;
  let deliveries:Parameters<EmailCodeSender['send']>[0][];
  let c:ReturnType<typeof createFamilyCommands>;
  beforeEach(async()=>{
    now=new Date('2026-11-22T00:00:00.000Z');failed=false;deliveries=[];
    if(sqlite){db=openFamilySqliteDatabase(':memory:');await applyFamilyApiSchema(db);repository=createSqliteFamilyRepository(db);}
    else repository=createMemoryFamilyRepository(createFamilyStore());
    c=createFamilyCommands({repository,clock:{now:()=>now},apple:createMapAppleVerifier({apple:{appleSubject:'apple'}}),publicTestLoginEnabled:true,appleLoginEnabled:true,loginManagementEnabled:true,
      emailCode:{secret:'s'.repeat(64),sender:{async send(message){if(failed)throw new Error('private SMTP error');deliveries.push(message);}}}});
  });
  afterEach(async()=>{await db?.close();db=undefined;});
  const advance=(ms=60_001)=>{now=new Date(now.getTime()+ms);};
  async function request(address='person@example.com',intent:EmailCodeIntent='login',token?:string){return c.emailCode.request({email:address,intent},token,'192.0.2.1');}
  function verify(ticket:EmailCodeTicket,address='person@example.com',intent:EmailCodeIntent='login',token?:string,code=deliveries.at(-1)!.code){return c.emailCode.verify({challengeId:ticket.challengeId,email:address,intent,code},token,'192.0.2.1');}
  async function login(address='person@example.com') {const result=await verify(await request(address),address);if(!('sessionToken'in result))throw new Error('No session');return result;}

  it('creates one stable identity and authenticates it without a password; public sessions can access profile/family',async()=>{
    expect(c.health().emailCodeLogin).toBe(true);
    const first=await login('Person@Example.com');expect(first.needsProfile).toBe(true);
    await c.updateMyProfile(first.sessionToken,'小禾');await c.createNamedFamily(first.sessionToken,'家','first');
    advance();const again=await login('person@example.com');expect(again.userId).toBe(first.userId);expect(again.needsProfile).toBe(false);
    expect((await c.listFamilies(again.sessionToken)).families).toHaveLength(1);
    expect(await c.emailCode.status(again.sessionToken)).toMatchObject({signedIn:true,linked:true,maskedEmail:'p***@example.com',reauthenticationExpiresAt:new Date(now.getTime()+300000).toISOString()});
    const stored=await repository.withTransaction(tx=>tx.findLoginIdentity('email-otp','person@example.com',EMAIL_CODE_NAMESPACE));
    expect(stored?.userId).toBe(first.userId);expect(stored?.verifiedAt).toBeTruthy();
  });
  it('stores only keyed digests and activates codes only after delivery is accepted',async()=>{
    const ticket=await request();const row=await repository.withTransaction(tx=>tx.findEmailCodeChallenge(ticket.challengeId));
    expect(row?.status).toBe('active');expect(row?.digest).toHaveLength(64);expect(row).not.toHaveProperty('code');
    expect(ticket).not.toHaveProperty('code');expect(ticket).not.toHaveProperty('email');expect(row?.digest).not.toBe(deliveries[0].code);
  });
  it('commits wrong-attempt counts, blocks the sixth attempt even if correct and never accepts an expired code',async()=>{
    const t=await request();const correct=deliveries[0].code;const wrong=correct==='000000'?'111111':'000000';
    for(let i=0;i<5;i++)await expect(verify(t,undefined,undefined,undefined,wrong)).rejects.toMatchObject({code:'EMAIL_CODE_INVALID'});
    expect((await repository.withTransaction(tx=>tx.findEmailCodeChallenge(t.challengeId)))?.attempts).toBe(5);
    await expect(verify(t)).rejects.toMatchObject({code:'EMAIL_CODE_INVALID'});
    advance();const newer=await request();advance(300_000);await expect(verify(newer)).rejects.toMatchObject({code:'EMAIL_CODE_INVALID'});
  });
  it('claims a valid code exactly once under concurrent/replayed verification',async()=>{
    const t=await request();const results=await Promise.allSettled([verify(t),verify(t)]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    await expect(verify(t)).rejects.toMatchObject({code:'EMAIL_CODE_INVALID'});
  });
  it('requires the same purpose, target and session and does not merge an Apple email automatically',async()=>{
    const t=await request();await expect(verify(t,'different@example.com')).rejects.toMatchObject({code:'EMAIL_CODE_INVALID'});
    await expect(verify(t,undefined,'delete')).rejects.toMatchObject({code:'EMAIL_CODE_INVALID'});
    await repository.withTransaction(tx=>tx.saveAccount({userId:'old-apple',appleSubject:'old-sub',email:'person@example.com',createdAt:now.toISOString()}));
    const result=await verify(t);expect('userId'in result&&result.userId).not.toBe('old-apple');
  });
  it('keeps the old delivered code usable if a resend fails and invalidates it after a successful resend',async()=>{
    const first=await request();const code=deliveries[0].code;advance();failed=true;
    await expect(request()).rejects.toMatchObject({code:'EMAIL_DELIVERY_FAILED'});failed=false;
    // Failure did not replace the first active challenge.
    expect((await repository.withTransaction(tx=>tx.findEmailCodeChallenge(first.challengeId)))?.status).toBe('active');
    advance();const latest=await request();await expect(verify(first,undefined,undefined,undefined,code)).rejects.toMatchObject({code:'EMAIL_CODE_INVALID'});
    await expect(verify(latest)).resolves.toHaveProperty('sessionToken');
  });
  it('enforces resend and per-address limits before calling the sender',async()=>{
    await request();await expect(request()).rejects.toMatchObject({code:'RATE_LIMITED',retryAfterSeconds:60});expect(deliveries).toHaveLength(1);
    for(let i=1;i<5;i++){advance();await request();}advance();await expect(request()).rejects.toMatchObject({code:'RATE_LIMITED',retryAfterSeconds:3300});expect(deliveries).toHaveLength(5);
  });
  it('binds email to a freshly authenticated existing user without changing the family identity',async()=>{
    const challenge=await c.beginAppleAuth('login');
    const appleCommands=createFamilyCommands({repository,clock:{now:()=>now},apple:createMapAppleVerifier({a:{appleSubject:'apple',nonce:challenge.nonce}}),publicTestLoginEnabled:true,appleLoginEnabled:true});
    const apple=await appleCommands.completeAppleAuth({challengeId:challenge.challengeId,identityToken:'a'});if(!('sessionToken'in apple))throw new Error('No session');
    await c.createNamedFamily(apple.sessionToken,'家','create');const t=await request(undefined,'link',apple.sessionToken);
    await expect(verify(t,undefined,'link','other-token')).rejects.toMatchObject({code:'EMAIL_CODE_INVALID'});
    await expect(verify(t,undefined,'link',apple.sessionToken)).resolves.toEqual({linked:true,userId:apple.userId});
    advance();const email=await login();expect(email.userId).toBe(apple.userId);expect((await c.listFamilies(email.sessionToken)).families).toHaveLength(1);
  });
  it('reauthenticates before changing an email, keeps the same user and invalidates other sessions',async()=>{
    const user=await login();advance(300_001);
    await expect(request('new@example.com','change',user.sessionToken)).rejects.toMatchObject({code:'REAUTHENTICATION_REQUIRED'});
    expect(await c.emailCode.status(user.sessionToken)).not.toHaveProperty('reauthenticationExpiresAt');
    const reauth=await request(undefined,'reauth',user.sessionToken);await expect(verify(reauth,undefined,'reauth',user.sessionToken)).resolves.toHaveProperty('reauthenticated',true);
    expect(await c.emailCode.status(user.sessionToken)).toHaveProperty('reauthenticationExpiresAt',new Date(now.getTime()+300000).toISOString());
    const change=await request('new@example.com','change',user.sessionToken);await verify(change,'new@example.com','change',user.sessionToken);
    expect(await repository.withTransaction(tx=>tx.findLoginIdentity('email-otp','person@example.com',EMAIL_CODE_NAMESPACE))).toBeNull();
    advance();const again=await login('new@example.com');expect(again.userId).toBe(user.userId);
  });
  it('prevents a verified replacement from taking another account’s identity and burns the claimed code',async()=>{
    const a=await login('a@example.com');const b=await login('b@example.com');advance();
    const t=await request('b@example.com','change',a.sessionToken);
    await expect(verify(t,'b@example.com','change',a.sessionToken)).rejects.toMatchObject({code:'CONFLICT'});
    await expect(verify(t,'b@example.com','change',a.sessionToken)).rejects.toMatchObject({code:'EMAIL_CODE_INVALID'});
    expect((await c.emailCode.status(b.sessionToken)).linked).toBe(true);
  });
  it('suspension prevents a delivered login code from issuing a session',async()=>{
    const a=await login();advance();const t=await request();await repository.withTransaction(tx=>tx.setAccountStatus(a.userId,'suspended'));
    await expect(verify(t)).rejects.toMatchObject({code:'UNAUTHENTICATED'});
  });
  it('does not bypass a disabled controlled account through its linked email',async()=>{
    const a=await login();
    await repository.withTransaction(tx=>tx.saveTestCredential({credentialId:'disabled',userId:a.userId,loginNormalized:'controlled@example.com',passwordHash:'unused',enabled:false,operatorProvisioned:true,createdAt:now.toISOString()}));
    advance();const t=await request();await expect(verify(t)).rejects.toMatchObject({code:'AUTH_FAILED'});
    expect((await repository.withTransaction(tx=>tx.findLoginIdentity('email-otp','person@example.com',EMAIL_CODE_NAMESPACE)))?.userId).toBe(a.userId);
  });
  it('deletes an email-only account only with a distinct code and explicit confirmation',async()=>{
    const a=await login();advance();const t=await request(undefined,'delete',a.sessionToken);
    const result=await c.emailCode.verify({email:'person@example.com',code:deliveries.at(-1)!.code,challengeId:t.challengeId,intent:'delete',confirmation:DELETE_ACCOUNT_CONFIRMATION},a.sessionToken);
    expect(result).toMatchObject({deleted:true,appleRevocation:'not-linked'});
    expect(await repository.withTransaction(tx=>tx.findAccountByUserId(a.userId))).toBeNull();
    expect(await repository.withTransaction(tx=>tx.findSession(a.sessionToken))).toBeNull();
  });
  it('cannot delete without confirmation or abandon a family that still has other members',async()=>{
    const a=await login();advance();const t=await request(undefined,'delete',a.sessionToken);
    await expect(verify(t,undefined,'delete',a.sessionToken)).rejects.toMatchObject({code:'BAD_REQUEST'});
    expect(await repository.withTransaction(tx=>tx.findAccountByUserId(a.userId))).not.toBeNull();
    const b=await login('other@example.com');const family=await c.createNamedFamily(a.sessionToken,'家','family');
    const invitation=await c.inviteMember(a.sessionToken,family.familyId,'invite');await c.acceptInvitation(b.sessionToken,invitation.code,'accept');
    advance();const count=deliveries.length;
    await expect(request(undefined,'delete',a.sessionToken)).rejects.toMatchObject({code:'ACCOUNT_HAS_MANAGED_FAMILY'});
    expect(deliveries).toHaveLength(count);
  });
  it('remains closed without configured delivery and rejects invalid addresses without sending',async()=>{
    const closed=createFamilyCommands({repository,apple:createMapAppleVerifier({})});expect(closed.health().emailCodeLogin).toBe(false);
    const response=await dispatchFamilyApi(closed,{method:'POST',path:'/v2/auth/email-code/request',headers:{},body:{email:'person@example.com',intent:'login'}});
    expect(response.status).toBe(404);
    await expect(request('victim@example.com\r\nBcc:other@example.com')).rejects.toMatchObject({code:'BAD_REQUEST'});expect(deliveries).toHaveLength(0);
  });
});
