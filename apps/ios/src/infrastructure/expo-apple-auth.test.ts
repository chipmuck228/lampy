import { createExpoAppleIdentityTokenSource } from './expo-apple-auth';
import * as Apple from 'expo-apple-authentication';
jest.mock('expo-apple-authentication',()=>({isAvailableAsync:jest.fn(),signInAsync:jest.fn()}));
beforeEach(()=>{jest.clearAllMocks();(Apple.isAvailableAsync as jest.Mock).mockResolvedValue(true);});
it('passes server nonce unchanged to native authorization and requests no profile scopes',async()=>{
 (Apple.signInAsync as jest.Mock).mockResolvedValue({identityToken:'token'});
 expect(await createExpoAppleIdentityTokenSource().requestIdentityToken('server-nonce')).toBe('token');
 expect(Apple.signInAsync).toHaveBeenCalledWith({requestedScopes:[],nonce:'server-nonce'});
});
it('native cancellation and unsupported devices fail without a token',async()=>{
 (Apple.signInAsync as jest.Mock).mockRejectedValue({code:'ERR_REQUEST_CANCELED'});
 await expect(createExpoAppleIdentityTokenSource().requestIdentityToken('nonce')).rejects.toMatchObject({code:'APPLE_SIGN_IN_CANCELLED'});
 (Apple.isAvailableAsync as jest.Mock).mockResolvedValue(false);await expect(createExpoAppleIdentityTokenSource().requestIdentityToken('nonce')).rejects.toMatchObject({code:'APPLE_UNAVAILABLE'});
 expect(Apple.signInAsync).toHaveBeenCalledTimes(1);
});
it('returns the fresh authorization code for explicit account deletion',async()=>{
 (Apple.signInAsync as jest.Mock).mockResolvedValue({identityToken:'token',authorizationCode:'once-only-code'});
 expect(await createExpoAppleIdentityTokenSource().requestAuthorization('delete-nonce')).toEqual({identityToken:'token',authorizationCode:'once-only-code'});
});
