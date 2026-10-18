import * as AppleAuthentication from 'expo-apple-authentication';

import { ApplicationError } from '../application/errors';

export type AppleIdentityTokenSource = {
  isAvailable(): Promise<boolean>;
  requestIdentityToken(nonce?: string): Promise<string>;
  requestAuthorization(nonce:string):Promise<{identityToken:string;authorizationCode:string|null}>;
};

export function createExpoAppleIdentityTokenSource(): AppleIdentityTokenSource {
  return {
    async isAvailable() {
      return AppleAuthentication.isAvailableAsync();
    },
    async requestIdentityToken(nonce?: string) {
      return (await this.requestAuthorization(nonce || '')).identityToken;
    },
    async requestAuthorization(nonce: string) {
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
        return {identityToken:credential.identityToken,authorizationCode:credential.authorizationCode};
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
    },
  };
}
