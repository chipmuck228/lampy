import {Platform} from 'react-native';
import {accountApiBaseUrl,emailCodeEntryOpen,safeAccountEndpoint} from './account-config';
const saved={...process.env};
afterEach(()=>{process.env={...saved};});
it('defaults closed and rejects credentials/query strings and public HTTP',()=>{
 delete process.env.EXPO_PUBLIC_EMAIL_CODE_LOGIN_ENABLED;expect(emailCodeEntryOpen()).toBe(false);
 for(const url of ['http://public.example.com','https://user:password@example.com','https://example.com/?token=secret','https://example.com/#fragment'])expect(safeAccountEndpoint(url)).toBe(false);
 expect(safeAccountEndpoint('https://accounts.example.com')).toBe(true);
});
it('opens only with an explicit flag and usable account backend, without enabling family routes',()=>{
 const config={flag:'1',account:'https://accounts.example.com',family:''};
 expect(emailCodeEntryOpen(config)).toBe(true);expect(accountApiBaseUrl(config.account,'')).toBe('https://accounts.example.com');
 expect(emailCodeEntryOpen({...config,family:'https://different.example.com'})).toBe(Platform.OS==='android');
 expect(emailCodeEntryOpen({...config,flag:'0'})).toBe(false);
});
