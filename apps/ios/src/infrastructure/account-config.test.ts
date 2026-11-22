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
it.each(['http://10.review.example','http://192.168.review.example','http://172.16.review.example','http://172.31.review.example','http://10.0.0.1.example','http://192.168.1.1.example','http://172.15.0.1','http://172.32.0.1','http://192.169.0.1','http://11.0.0.1','http://10.0.0.256'])('rejects public HTTP and private-looking DNS names: %s',url=>{
 expect(safeAccountEndpoint(url)).toBe(false);
});
it.each(['http://localhost:8788','http://127.0.0.1:8788','http://[::1]:8788','http://10.0.2.2:8788','http://192.168.1.2:8788','http://172.16.0.1','http://172.31.255.255'])('retains local/private HTTP development support: %s',url=>{
 expect(safeAccountEndpoint(url)).toBe(true);
});
