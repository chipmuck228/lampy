import {createHmac,randomBytes,randomInt,timingSafeEqual} from 'node:crypto';
import {FamilyError,FAMILY_ERROR} from './errors';
import {isPlausibleEmail,normalizeEmail} from './email-normalize';
import {RECENT_AUTH_MS,assertAccountActive,assertRecentAuthentication,attachVerifiedLoginIdentity,loginIdentityKey} from './login-identity';
import {assertDeletionFamilies,DELETE_ACCOUNT_CONFIRMATION,drainAccountMedia} from './account-deletion';
import {incrementLoginRateLimit} from './test-account-commands';
import type {FamilyRepository,FamilyTx} from './repository';
import type {FamilyClock,FamilyIds,LoginIdentity} from './types';
import type {MediaBlobStore} from './media-blobs';
import {EMAIL_CODE_NAMESPACE,type EmailCodeChallenge,type EmailCodeIntent,type EmailCodeRequest,type EmailCodeResult,type EmailCodeSender,type EmailCodeVerification} from './email-code-types';

export const EMAIL_CODE_TTL_MS=5*60_000;
const intents:EmailCodeIntent[]=['login','link','reauth','change','delete'];
export type EmailCodeOptions={secret:string;sender:EmailCodeSender;dailyLimit?:number};
export function maskEmail(email:string){const at=email.lastIndexOf('@');return `${email.slice(0,1)}***${email.slice(at)}`;}
export function createEmailCodeCommands(deps:{repository:FamilyRepository;clock:FamilyClock;ids:FamilyIds;sessionTtlMs:number;options?:EmailCodeOptions;
  blobs:MediaBlobStore;requireUser:(tx:FamilyTx,token?:string)=>Promise<string>}) {
  function open(){if(!deps.options||Buffer.byteLength(deps.options.secret)<32)throw new FamilyError('EMAIL_CODE_CLOSED','Email verification is not available.');return deps.options;}
  function mac(value:string){return createHmac('sha256',open().secret).update(value).digest('hex');}
  function email(raw:string){const value=normalizeEmail(raw);if(!isPlausibleEmail(value))throw new FamilyError(FAMILY_ERROR.BAD_REQUEST,'Enter a valid email address.');return value;}
  function invalid(){return new FamilyError('EMAIL_CODE_INVALID','The code is incorrect, expired or already used.');}
  function key(address:string,userId:string):LoginIdentity{return {provider:'email-otp',namespace:EMAIL_CODE_NAMESPACE,subject:address,userId,createdAt:deps.clock.now().toISOString(),verifiedAt:deps.clock.now().toISOString()};}
  async function bound(tx:FamilyTx,token:string|undefined,intent:EmailCodeIntent,address:string) {
    if(intent==='login')return null;
    const userId=await deps.requireUser(tx,token);
    if(intent==='link'||intent==='change')assertRecentAuthentication(await tx.findSession(token!),deps.clock.now());
    const own=(await tx.listLoginIdentities(userId)).find(i=>i.provider==='email-otp'&&i.namespace===EMAIL_CODE_NAMESPACE);
    if((intent==='reauth'||intent==='delete')&&own?.subject!==address)throw new FamilyError('EMAIL_NOT_LINKED','Enter the email linked to this account.');
    if(intent==='link'&&own&&own.subject!==address)throw new FamilyError('EMAIL_ALREADY_LINKED','Use change email for an existing binding.');
    if(intent==='change'&&!own)throw new FamilyError('EMAIL_NOT_LINKED','Link an email first.');
    if(intent==='delete'){
      if((await tx.listLoginIdentities(userId)).some(i=>i.provider==='apple'))throw new FamilyError('APPLE_DELETION_AUTH_REQUIRED','Confirm the linked Apple identity to delete this account.');
      await assertDeletionFamilies(tx,userId);
    }
    return userId;
  }
  return {
    enabled:()=>!!deps.options&&Buffer.byteLength(deps.options.secret)>=32,
    async status(token:string) {
      open();return deps.repository.withTransaction(async tx=>{
        const userId=await deps.requireUser(tx,token);
        const own=(await tx.listLoginIdentities(userId)).find(i=>i.provider==='email-otp'&&i.namespace===EMAIL_CODE_NAMESPACE);
        const session=await tx.findSession(token);
        const authenticated=Date.parse(session?.authenticatedAt??'');
        const recent=Number.isFinite(authenticated)&&authenticated<=deps.clock.now().getTime()&&authenticated+RECENT_AUTH_MS>deps.clock.now().getTime()&&
          (await tx.listLoginIdentities(userId)).some(i=>loginIdentityKey(i)===session?.authenticatedIdentity);
        const profile=await tx.findProfile(userId);
        return {signedIn:true,linked:!!own,appleLinked:(await tx.listLoginIdentities(userId)).some(i=>i.provider==='apple'),...(profile?.nickname?{nickname:profile.nickname}:{}),...(own?{maskedEmail:maskEmail(own.subject)}:{}),
          ...(recent?{reauthenticationExpiresAt:new Date(authenticated+RECENT_AUTH_MS).toISOString()}:{})};
      });
    },
    async request(input:EmailCodeRequest,token?:string,peer='unknown') {
      const options=open();const address=email(input.email);
      if(!intents.includes(input.intent))throw new FamilyError(FAMILY_ERROR.BAD_REQUEST,'Invalid verification purpose.');
      const id=randomBytes(32).toString('hex'),code=randomInt(1_000_000).toString().padStart(6,'0');
      const now=deps.clock.now();const scope=mac(JSON.stringify(['scope',address,input.intent]));
      const admitted=await deps.repository.withTransaction(async tx=>{
        const userId=await bound(tx,token,input.intent,address);
        await tx.pruneEmailCodeChallenges(now.toISOString());
        const nextUtcMidnight=Date.parse(now.toISOString().slice(0,10)+'T00:00:00.000Z')+86400_000;
        const limits=[
          {bucket:`email-code:cooldown:${mac(address)}`,windowMs:60_000,max:1},
          {bucket:`email-code:address:${mac(address)}`,windowMs:3600_000,max:5},
          {bucket:`email-code:peer:${mac(peer)}`,windowMs:3600_000,max:20},
          {bucket:`email-code:day:${now.toISOString().slice(0,10)}`,windowMs:86400_000,max:options.dailyLimit??200,resetAt:nextUtcMidnight},
        ];
        const counters=[];let retryAfterSeconds=0;
        for(const limit of limits){const row=await tx.findRateLimit(limit.bucket);const active=row&&now.getTime()-Date.parse(row.windowStartedAt)<limit.windowMs;
          if(active&&row.hitCount>=limit.max)retryAfterSeconds=Math.max(retryAfterSeconds,Math.ceil(((limit.resetAt??(Date.parse(row.windowStartedAt)+limit.windowMs))-now.getTime())/1000));
          counters.push({bucket:limit.bucket,windowStartedAt:active?row.windowStartedAt:now.toISOString(),hitCount:active?row.hitCount+1:1});}
        if(retryAfterSeconds)return {error:new FamilyError(FAMILY_ERROR.RATE_LIMITED,'Too many email requests. Try again later.',retryAfterSeconds)};
        for(const row of counters)await tx.saveRateLimit(row);
        const row:EmailCodeChallenge={id,email:address,scope,intent:input.intent,userId,sessionDigest:userId?mac(`session:${token}`):null,
          digest:mac(JSON.stringify(['code',id,address,input.intent,code])),createdAt:now.toISOString(),expiresAt:new Date(now.getTime()+EMAIL_CODE_TTL_MS).toISOString(),attempts:0,status:'pending'};
        await tx.saveEmailCodeChallenge(row);return {row};
      });
      if(admitted.error)throw admitted.error;
      const row=admitted.row!;let timer:ReturnType<typeof setTimeout>|undefined;
      try {
        await Promise.race([options.sender.send({to:address,code,intent:input.intent,language:input.language==='en'?'en':'zh'}),
          new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('delivery timeout')),20_000);})]);
        await deps.repository.withTransaction(async tx=>{
          const latest=await tx.latestEmailCodeChallenge(scope);
          if(latest?.id!==id||Date.parse(row.expiresAt)<=deps.clock.now().getTime())throw invalid();
          if(row.userId){const current=await deps.requireUser(tx,token);if(current!==row.userId)throw invalid();}
          await tx.activateEmailCodeChallenge(id,scope);
        });
      } catch {
        await deps.repository.withTransaction(tx=>tx.deleteEmailCodeChallenge(id));
        throw new FamilyError('EMAIL_DELIVERY_FAILED','The verification email could not be sent.');
      } finally {if(timer)clearTimeout(timer);}
      return {challengeId:id,expiresAt:row.expiresAt,resendAfterSeconds:60};
    },
    async verify(input:EmailCodeVerification,token?:string,peer='unknown'):Promise<EmailCodeResult> {
      open();const address=email(input.email);
      if(!/^[a-f0-9]{64}$/.test(input.challengeId)||!/^\d{6}$/.test(input.code)||!intents.includes(input.intent))throw invalid();
      await incrementLoginRateLimit(deps.repository,`email-code:verify:${mac(peer)}`,deps.clock.now(),{windowMs:15*60_000,max:50});
      // Commit wrong-attempt counters and successful claims before account work; rollback must never resurrect a code.
      const claim=await deps.repository.withTransaction(async tx=>{
        const row=await tx.findEmailCodeChallenge(input.challengeId);
        if(!row||row.status!=='active'||row.email!==address||row.intent!==input.intent||Date.parse(row.expiresAt)<=deps.clock.now().getTime()||row.attempts>=5)return null;
        if(row.userId&&(row.sessionDigest!==mac(`session:${token}`)||await deps.requireUser(tx,token)!==row.userId))return null;
        if(!/^[a-f0-9]{64}$/.test(row.digest))return null;
        const matches=timingSafeEqual(Buffer.from(row.digest,'hex'),Buffer.from(mac(JSON.stringify(['code',row.id,address,row.intent,input.code])),'hex'));
        if(!matches){await tx.saveEmailCodeChallenge({...row,attempts:row.attempts+1});return null;}
        await tx.deleteEmailCodeChallenge(row.id);return row;
      });
      if(!claim)throw invalid();
      if(input.intent==='delete'&&input.confirmation!==DELETE_ACCOUNT_CONFIRMATION)throw new FamilyError(FAMILY_ERROR.BAD_REQUEST,'Explicit account deletion confirmation is required.');
      const result=await deps.repository.withTransaction(async tx=>{
        if(Date.parse(claim.expiresAt)<=deps.clock.now().getTime())throw invalid();
        const existing=await tx.findLoginIdentity('email-otp',address,EMAIL_CODE_NAMESPACE);
        if(claim.userId) {
          const userId=await deps.requireUser(tx,token);if(userId!==claim.userId||mac(`session:${token}`)!==claim.sessionDigest)throw invalid();
          if(input.intent==='delete') {
            if(existing?.userId!==userId)throw invalid();
            if((await tx.listLoginIdentities(userId)).some(i=>i.provider==='apple'))throw new FamilyError('APPLE_DELETION_AUTH_REQUIRED','Confirm the linked Apple identity to delete this account.');
            await assertDeletionFamilies(tx,userId);
            await tx.purgeAccount(userId);
            return {deleted:true as const,appleRevocation:'not-linked' as const,mediaCleanup:'pending' as const};
          }
          if(input.intent==='reauth') {
            if(existing?.userId!==userId)throw invalid();
            const session=(await tx.findSession(token!))!;
            await tx.saveSession({...session,authenticatedAt:deps.clock.now().toISOString(),authenticatedIdentity:loginIdentityKey(key(address,userId))});
            return {reauthenticated:true as const,userId};
          }
          if(existing&&existing.userId!==userId)throw new FamilyError(FAMILY_ERROR.CONFLICT,'This email belongs to another account. Accounts will not be merged.');
          if(input.intent==='change') {
            assertRecentAuthentication(await tx.findSession(token!),deps.clock.now());
            const old=(await tx.listLoginIdentities(userId)).find(i=>i.provider==='email-otp'&&i.namespace===EMAIL_CODE_NAMESPACE);
            if(!old)throw new FamilyError('EMAIL_NOT_LINKED','Link an email first.');
            const authorizer=(await tx.findSession(token!))!;
            if(!(await tx.listLoginIdentities(userId)).some(i=>loginIdentityKey(i)===authorizer.authenticatedIdentity))throw new FamilyError('REAUTHENTICATION_REQUIRED','Sign in again.');
            await tx.removeLoginIdentity(old);
          }
          if(input.intent==='change')await tx.attachLoginIdentity(key(address,userId));
          else await attachVerifiedLoginIdentity(tx,token!,key(address,userId),deps.clock.now());
          if(input.intent==='change') {
            const session=(await tx.findSession(token!))!;
            await tx.saveSession({...session,authenticatedAt:deps.clock.now().toISOString(),authenticatedIdentity:loginIdentityKey(key(address,userId))});
            await tx.deleteOtherSessions(userId,token!);
          }
          return {linked:true as const,userId};
        }
        let userId=existing?.userId;
        if(!userId){userId=deps.ids.userId();await tx.saveAccount({userId,createdAt:deps.clock.now().toISOString()});await tx.attachLoginIdentity(key(address,userId));}
        await assertAccountActive(tx,userId);
        const credential=await tx.findTestCredentialByUserId(userId);
        if(credential&&!credential.enabled)throw new FamilyError(FAMILY_ERROR.AUTH_FAILED,'Account is unavailable.');
        const session={token:deps.ids.sessionToken(),userId,expiresAt:new Date(deps.clock.now().getTime()+deps.sessionTtlMs).toISOString(),
          authenticatedAt:deps.clock.now().toISOString(),authenticatedIdentity:loginIdentityKey(key(address,userId))};
        await tx.saveSession(session);
        return {userId,sessionToken:session.token,expiresAt:session.expiresAt,needsProfile:!(await tx.findProfile(userId))?.nickname};
      });
      if('deleted' in result){let cleaned=false;try{cleaned=await drainAccountMedia(deps.repository,deps.blobs);}catch{/* durable cleanup is retried later */}
        return {...result,mediaCleanup:cleaned?'completed':'pending'};}
      return result;
    },
  };
}
