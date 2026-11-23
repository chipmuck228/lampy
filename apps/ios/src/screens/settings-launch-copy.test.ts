/* eslint-disable @typescript-eslint/no-require-imports */
import {isAppstoreLaunchBuild} from '../infrastructure/launch-release-config';
const flags={EXPO_PUBLIC_APPSTORE_V1:'1',EXPO_PUBLIC_FAMILY_API_BASE_URL:'https://family.yunpura.com',EXPO_PUBLIC_FAMILY_ENTRY_OPEN:'1',EXPO_PUBLIC_CONTROLLED_EMAIL_ACCOUNTS:'0',EXPO_PUBLIC_FAMILY_INTERNAL_TEST:'0',EXPO_PUBLIC_EMAIL_CODE_LOGIN_ENABLED:'1',EXPO_PUBLIC_UNIFIED_PURCHASES:'1',EXPO_PUBLIC_ALBUM_EXPORT_ENABLED:'1',EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED:'1'};
function load(language:string){
 const before=Object.keys(flags).map(key=>process.env[key]);let content='',date='';
 try{
  Object.assign(process.env,flags);
  jest.isolateModules(()=>{
   jest.doMock('expo-localization',()=>({getLocales:()=>[{languageTag:language}]}));
   const help=require('./settings-help-copy').SETTINGS_HELP_CHAPTERS;
   const privacy=require('./settings-privacy-copy');const terms=require('./settings-terms-copy').SETTINGS_TERMS_CHAPTERS;
   date=privacy.SETTINGS_PRIVACY_UPDATED;
   content=[...help,...privacy.SETTINGS_PRIVACY_CHAPTERS,...terms].flatMap(c=>[c.title,...c.paragraphs]).join('\n');
  });
 }finally{Object.keys(flags).forEach((key,i)=>{if(before[i]===undefined)delete process.env[key];else process.env[key]=before[i];});}
 return {content,date};
}
it('launch disclosures match enabled email, purchases and exports and preserve family safeguards',()=>{
 const {content,date}=load('zh-CN');expect(date).toBe('2026年11月23日');
 for(const word of ['Resend','验证码','签名交易','EPUB','PDF','三十分钟','清理队列','30天','举报','来源IP','Apple 授权'])expect(content).toContain(word);
 expect(content).not.toMatch(/关闭购买|素纸或手作|最多1分钟|通过Apple登录，设置昵称/);
});
it('all launch disclosures have English translations',()=>{
 const {content,date}=load('en-US');expect(content).not.toMatch(/[\u4e00-\u9fff]/);expect(date).toBe('November 23, 2026');expect(content).toContain('Resend');expect(content).toContain('thirty minutes');
});
it('partial or internal configurations never select launch copy',()=>{
 expect(isAppstoreLaunchBuild(true,'1','1','1','1')).toBe(true);
 expect(isAppstoreLaunchBuild(false,'1','1','1','1')).toBe(false);
 for(let i=0;i<4;i++){const flags=['1','1','1','1'];flags[i]='0';expect(isAppstoreLaunchBuild(true,...flags as [string,string,string,string])).toBe(false);}
});
