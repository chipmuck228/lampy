import type { DeleteAccountResult, SignInResult } from './types';

export const EMAIL_CODE_NAMESPACE = 'lampy-email-v1';
export type EmailCodeIntent = 'login' | 'link' | 'reauth' | 'change' | 'delete';
export type EmailCodeRequest = {email:string;intent:EmailCodeIntent;language?:'zh'|'en'};
export type EmailCodeTicket = {challengeId:string;expiresAt:string;resendAfterSeconds:number};
export type EmailCodeVerification = {challengeId:string;email:string;code:string;intent:EmailCodeIntent;confirmation?:string};
export type EmailCodeResult = (SignInResult & {needsProfile:boolean}) | {linked:true;userId:string} | {reauthenticated:true;userId:string} | DeleteAccountResult;
export type EmailCodeStatus = {signedIn:boolean;linked:boolean;maskedEmail?:string;reauthenticationExpiresAt?:string};
export type EmailCodeChallenge = {
  sequence?:number;id:string;email:string;scope:string;intent:EmailCodeIntent;digest:string;
  userId:string|null;sessionDigest:string|null;createdAt:string;expiresAt:string;attempts:number;status:'pending'|'active';
};
export type EmailCodeSender = {send(input:{to:string;code:string;intent:EmailCodeIntent;language:'zh'|'en'}):Promise<void>};
