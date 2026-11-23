import type { DeleteAccountResult, SignInResult } from './types';

export const EMAIL_CODE_NAMESPACE = 'lampy-email-v1';
export type EmailCodeIntent = 'login' | 'link' | 'reauth' | 'change' | 'delete';
// reauth/delete resolve the current mailbox from the authenticated session; other intents require email.
export type EmailCodeRequest = {email?:string;intent:EmailCodeIntent;language?:'zh'|'en'};
export type EmailCodeTicket = {challengeId:string;expiresAt:string;resendAfterSeconds:number};
export type EmailCodeVerification = {challengeId:string;email?:string;code:string;intent:EmailCodeIntent;confirmation?:string};
export type EmailCodeResult = (SignInResult & {needsProfile:boolean}) | {linked:true;userId:string} | {reauthenticated:true;userId:string} | DeleteAccountResult;
export type EmailCodeStatus = {signedIn:boolean;linked:boolean;maskedEmail?:string;nickname?:string;appleLinked?:boolean;reauthenticationExpiresAt?:string};
export type EmailCodeChallenge = {
  sequence?:number;id:string;email:string;scope:string;intent:EmailCodeIntent;digest:string;
  userId:string|null;sessionDigest:string|null;createdAt:string;expiresAt:string;attempts:number;status:'pending'|'active';
};
export type EmailCodeSender = {send(input:{to:string;code:string;intent:EmailCodeIntent;language:'zh'|'en'}):Promise<void>};
