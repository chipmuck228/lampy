import * as AppleAuthentication from 'expo-apple-authentication';

import { ApplicationError } from '../application/errors';

export type AppleIdentityTokenSource = {
  isAvailable(): Promise<boolean>;
  requestIdentityToken(nonce?: string): Promise<string>;
  requestAuthorization(nonce: string): Promise<import('../family-api/types').AppleAuthorization>;
};

export function createExpoAppleIdentityTokenSource(): AppleIdentityTokenSource {
  async function request(nonce?: string) {
      const available = await AppleAuthentication.isAvailableAsync();
      if (!available) {
        throw new ApplicationError('APPLE_UNAVAILABLE', 'Sign in with Apple is not available on this device.');
      }
      try {
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [],
          nonce,
        });
        if (!credential.identityToken) {
          throw new ApplicationError('APPLE_TOKEN_INVALID', 'Apple did not return an identity token.');
        }
        return {identityToken:credential.identityToken,authorizationCode:credential.authorizationCode || undefined};
      } catch (error) {
        if (error instanceof ApplicationError) throw error;
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_REQUEST_CANCELED') {
          throw new ApplicationError('APPLE_SIGN_IN_CANCELLED', 'Sign in with Apple was cancelled.');
        }
        throw new ApplicationError(
          'APPLE_TOKEN_INVALID',
          error instanceof Error ? error.message : 'Sign in with Apple failed.',
        );
      }
  }
  return {
    isAvailable:()=>AppleAuthentication.isAvailableAsync(),
    requestIdentityToken:async(nonce?:string)=>(await request(nonce)).identityToken,
    requestAuthorization:async(nonce:string)=>{
      const credential=await request(nonce);
      if(!credential.authorizationCode) throw new ApplicationError('APPLE_GRANT_REQUIRED','Apple authorization code is missing.');
      return credential;
    },
  };
}
