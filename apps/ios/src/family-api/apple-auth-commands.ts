import { randomBytes } from 'node:crypto';
import { FamilyError, FAMILY_ERROR } from './errors';
import type { FamilyRepository, FamilyTx } from './repository';
import type { AppleVerifier, AppleAuthInput, FamilyClock, FamilyIds, SignInResult } from './types';

export function createAppleAuthCommands(deps: {repository:FamilyRepository;apple:AppleVerifier;clock:FamilyClock;ids:FamilyIds;sessionTtlMs:number;enabled:boolean;requireUser:(tx:FamilyTx,token?:string)=>Promise<string>}) {
  function open() { if(!deps.enabled) throw new FamilyError(FAMILY_ERROR.FORBIDDEN,'Apple sign-in is not enabled.'); }
  function invalid() { return new FamilyError(FAMILY_ERROR.APPLE_TOKEN_INVALID,'Apple request expired or was already used. Please start again.'); }
  return {
    async beginAppleAuth(intent:'login'|'link',sessionToken?:string,peer='unknown') {
      open();
      return deps.repository.withTransaction(async tx => {
        const userId = intent === 'link' ? await deps.requireUser(tx,sessionToken) : null;
        const now=deps.clock.now(); const bucket='apple-challenge:'+peer;
        const row=await tx.findRateLimit(bucket);
        const active=row && now.getTime()-Date.parse(row.windowStartedAt)<60_000;
        if(active && row.hitCount>=10) throw new FamilyError(FAMILY_ERROR.RATE_LIMITED,'Try again later.');
        await tx.saveRateLimit({bucket,windowStartedAt:active?row.windowStartedAt:now.toISOString(),hitCount:active?row.hitCount+1:1});
        await tx.pruneAppleChallenges(now.toISOString());
        const c={id:randomBytes(32).toString('hex'),nonce:randomBytes(32).toString('hex'),intent,userId,sessionToken:intent==='link'?sessionToken! : null,expiresAt:new Date(now.getTime()+5*60_000).toISOString()};
        await tx.saveAppleChallenge(c);
        return {challengeId:c.id,nonce:c.nonce,expiresAt:c.expiresAt};
      });
    },
    async getAppleLink(token:string) {
      return deps.repository.withTransaction(async tx => { const userId=await deps.requireUser(tx,token);return {linked:(await tx.listLoginIdentities(userId)).some(i=>i.provider==='apple')}; });
    },
    async completeAppleAuth(input:AppleAuthInput,token?:string):Promise<SignInResult | {linked:true;userId:string}> {
      open();
      if(!/^[a-f0-9]{64}$/.test(input.challengeId) || !input.identityToken || input.identityToken.length>8192) throw invalid();
      // Claim before network verification: failures require a fresh authorization, never replay.
      const c=await deps.repository.withTransaction(async tx=>{
        const c=await tx.findAppleChallenge(input.challengeId);
        if(!c || Date.parse(c.expiresAt)<=deps.clock.now().getTime()) throw invalid();
        if(c.intent==='link' && (c.sessionToken!==token || await deps.requireUser(tx,token)!==c.userId)) throw invalid();
        await tx.deleteAppleChallenge(c.id);return c;
      });
      const identity=await deps.apple.verifyIdentityToken(input.identityToken,c.nonce);
      if(!identity.appleSubject?.trim()) throw invalid();
      return deps.repository.withTransaction(async tx=>{
        if(Date.parse(c.expiresAt)<=deps.clock.now().getTime()) throw invalid();
        const existing=await tx.findLoginIdentity('apple',identity.appleSubject);
        if(c.intent==='link') {
          const userId=await deps.requireUser(tx,token);
          if(userId!==c.userId || token!==c.sessionToken) throw invalid();
          const own=(await tx.listLoginIdentities(userId)).find(i=>i.provider==='apple');
          if((existing && existing.userId!==userId) || (own && own.subject!==identity.appleSubject)) throw new FamilyError(FAMILY_ERROR.CONFLICT,'This Apple identity is already linked. Accounts will not be merged.');
          await tx.attachLoginIdentity({provider:'apple',subject:identity.appleSubject,userId,createdAt:deps.clock.now().toISOString()});
          return {linked:true as const,userId};
        }
        let userId=existing?.userId;
        if(!userId) {
          userId=deps.ids.userId();
          // Email is not an identity key. Do not overwrite a profile or merge accounts by email.
          await tx.saveAccount({userId,appleSubject:identity.appleSubject,createdAt:deps.clock.now().toISOString()});
        } else {
          // Disabled controlled accounts cannot bypass suspension with linked Apple credentials.
          const credential=await tx.findTestCredentialByUserId(userId);
          if(credential && !credential.enabled) throw new FamilyError(FAMILY_ERROR.AUTH_FAILED,'Account is unavailable.');
        }
        const session={token:deps.ids.sessionToken(),userId,expiresAt:new Date(deps.clock.now().getTime()+deps.sessionTtlMs).toISOString()};
        await tx.saveSession(session);return {userId,sessionToken:session.token,expiresAt:session.expiresAt};
      });
    },
  };
}
