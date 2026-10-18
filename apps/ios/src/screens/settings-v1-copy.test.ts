/* eslint-disable @typescript-eslint/no-require-imports */
type Chapters=readonly {title:string;paragraphs:readonly string[]}[];
function text(chapters:Chapters){return chapters.flatMap(c=>[c.title,...c.paragraphs]).join('\n');}
function load(formal:boolean,language='zh-CN') {
 const keys=['EXPO_PUBLIC_APPSTORE_V1','EXPO_PUBLIC_FAMILY_API_BASE_URL','EXPO_PUBLIC_FAMILY_ENTRY_OPEN','EXPO_PUBLIC_CONTROLLED_EMAIL_ACCOUNTS','EXPO_PUBLIC_FAMILY_INTERNAL_TEST'];
 const before=keys.map(key=>process.env[key]);let result!:{help:Chapters;privacy:Chapters;terms:Chapters;date:string};
 try {
  [formal?'1':'0','https://family.yunpura.com','1','0','0'].forEach((value,index)=>{process.env[keys[index]]=value;});
  jest.isolateModules(()=>{
   jest.doMock('expo-localization',()=>({getLocales:()=>[{languageTag:language}]}));
   result={help:require('./settings-help-copy').SETTINGS_HELP_CHAPTERS,privacy:require('./settings-privacy-copy').SETTINGS_PRIVACY_CHAPTERS,terms:require('./settings-terms-copy').SETTINGS_TERMS_CHAPTERS,date:require('./settings-privacy-copy').SETTINGS_PRIVACY_UPDATED};
  });
 }finally{keys.forEach((key,index)=>{if(before[index]===undefined)delete process.env[key];else process.env[key]=before[index];});}
 return result;
}
it('formal copy describes actual family storage and deletion without claiming families are closed',()=>{
 const copy=load(true);expect(copy.date).toBe('2026年10月18日');
 const privacy=text(copy.privacy),terms=text(copy.terms),help=text(copy.help);
 expect(privacy).toContain('未主动分享的个人内容不会上传');expect(privacy).toContain('家庭共享内容保存在服务器');expect(privacy).toContain('清理队列');expect(privacy).toContain('30天');
 expect(privacy).toContain('所有会话失效');expect(privacy).toContain('本机私人记录和个人册不随账号删除');
 expect(help).toContain('最多1分钟');expect(help).toContain('有记录的日期显示条数');expect(help).toContain('素纸或手作');
 expect(terms).toContain('关闭购买、个人及家庭成品导出和打印入口');
 for(const content of [privacy,terms,help])expect(content).not.toMatch(/家庭入口.*关闭|账号注册.*未向你开放|导出后再删除|举报按钮|屏蔽按钮|自动恢复个人/);
});
it('English release pages translate every heading and paragraph',()=>{
 const copy=load(true,'en-US');expect(copy.date).toBe('October 18, 2026');
 const content=text([...copy.help,...copy.privacy,...copy.terms]);expect(content).not.toMatch(/[\u4e00-\u9fff]/);
 expect(content).toContain('family service');expect(content).toContain('does not delete local private moments');
});
it('ordinary closed profile retains its existing scope',()=>{
 const copy=load(false);expect(copy.date).toBe('2026年10月2日');expect(copy.help).toHaveLength(6);
 expect(text(copy.privacy)).toContain('家庭入口、测试登录和开发诊断在当前正式版本中关闭');
});
