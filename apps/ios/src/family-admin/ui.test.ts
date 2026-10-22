import {JSDOM} from 'jsdom';
import {ADMIN_HTML,ADMIN_JS} from './ui';

let dom:JSDOM;
afterEach(()=>dom?.window.close());
async function until(check:()=>boolean){for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}throw Error('UI did not settle');}
async function fixture(){
 dom=new JSDOM(ADMIN_HTML,{url:'https://admin.example.test',runScripts:'outside-only'});
 const w=dom.window,d=w.document;
 Object.defineProperty(w.HTMLDialogElement.prototype,'showModal',{value:function(){this.setAttribute('open','');}});
 Object.defineProperty(w.HTMLMediaElement.prototype,'pause',{value:jest.fn()});Object.defineProperty(w.HTMLMediaElement.prototype,'load',{value:jest.fn()});
 Object.defineProperty(w.HTMLDialogElement.prototype,'close',{value:function(){this.removeAttribute('open');}});
 let signedIn=false,version='first',restricted=true;
 const report={reportId:'report_test',reason:'privacy',status:'pending',createdAt:'2026-10-21T00:00:00Z',detail:'<script>alert(1)</script>'};
 const detail=()=>({report:{...report},familyName:'Test family',authorNickname:'Test author',share:{note:'<img src=x onerror=alert(1)> private record',occurredAtPrecision:'unknown',media:[{objectId:'med_abc',mimeType:'image/png'},{objectId:'med_def',mimeType:'audio/mp4'}]},hidden:false,sharingRestricted:false,authorAvailable:true,version});
 const fetch=jest.fn(async(url:string,options?:{body?:string})=>{
  let status=200,data:unknown={};
  if(url==='/api/login'){signedIn=true;data={username:'developer',csrf:'csrf'};}
  else if(url==='/api/logout'){signedIn=false;data={ok:true};}
  else if(!signedIn){status=401;data={error:'SIGN_IN_REQUIRED'};}
  else if(url==='/api/session')data={username:'developer',csrf:'csrf'};
  else if(url.startsWith('/api/restricted-authors?'))data={authors:restricted?[{userId:'usr_test',nickname:'<b>Test author</b>',restrictedAt:'2026-10-01T00:00:00Z',version:'restriction-v1'}]:[],hasMore:false};
  else if(url.endsWith('/release')){restricted=false;data={released:true};}
  else if(url.startsWith('/api/reports?'))data={reports:[report],hasMore:false};
  else if(url.endsWith('/history'))data={events:[]};
  else if(url.endsWith('/validation'))data={version};
  else if(url.endsWith('/decision')){expect(JSON.parse(options!.body!).version).toBe(version);version='second';report.status='restricted';data=detail();}
  else data=detail();
  return {ok:status===200,status,json:async()=>data};
 });
 Object.assign(w,{fetch});if(d.readyState!=='complete')await new Promise<void>(resolve=>w.addEventListener('load',()=>resolve(),{once:true}));w.eval(ADMIN_JS);w.dispatchEvent(new w.Event('pageshow'));
 const get=(id:string)=>d.getElementById(id)!;
 const submit=(id:string)=>get(id).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 async function login(){await until(()=>!(get('login-submit') as HTMLButtonElement).disabled);(get('login-name') as HTMLInputElement).value='developer';(get('login-password') as HTMLInputElement).value='secret';submit('login-form');await until(()=>!get('workspace').hidden);await until(()=>!!d.querySelector('.report-row'));}
 async function open(){(d.querySelector('.report-row') as HTMLButtonElement).click();await until(()=>!get('detail').hidden);await until(()=>get('history').textContent!.includes('暂无处理记录'));}
 return {w,d,get,fetch,submit,login,open};
}
it('requires explicit confirmation and renders untrusted content only as text',async()=>{
 const f=await fixture();await f.login();await f.open();expect(f.get('note').textContent).toContain('<img');expect(f.get('note').querySelector('img')).toBeNull();expect(f.get('report-detail').querySelector('script')).toBeNull();
 (f.get('action') as HTMLSelectElement).value='restrict';(f.get('reason') as HTMLTextAreaElement).value='confirmed issue';f.submit('decision-form');
 expect(f.get('confirm').hasAttribute('open')).toBe(true);expect(f.fetch.mock.calls.some(c=>c[0].endsWith('/decision'))).toBe(false);
 f.get('send-confirm').click();await until(()=>f.get('notice').textContent==='处理已完成。');
 const calls=f.fetch.mock.calls.filter(c=>c[0].endsWith('/decision'));expect(calls).toHaveLength(1);expect(JSON.parse(calls[0][1]!.body!)).toMatchObject({action:'restrict',reason:'confirmed issue',version:'first'});
});
it('cancels a decision without writing and clears private content on logout',async()=>{
 const f=await fixture();await f.login();await f.open();(f.get('reason') as HTMLTextAreaElement).value='test reason';f.submit('decision-form');f.get('cancel-confirm').click();
 expect(f.fetch.mock.calls.some(c=>c[0].endsWith('/decision'))).toBe(false);
 f.get('logout').click();await until(()=>!f.get('login').hidden);expect(f.get('note').textContent).toBe('');expect(f.get('report-detail').textContent).toBe('');expect(f.get('metadata').textContent).toBe('');expect(f.get('confirm-target').textContent).toBe('');
});
it('does not load images until explicitly requested',async()=>{
 const f=await fixture();await f.login();await f.open();expect(f.get('media').querySelector('img')).toBeNull();(f.get('media').querySelector('button') as HTMLButtonElement).click();expect(f.get('media').querySelector('img')?.getAttribute('src')).toBe('/api/reports/report_test/media/med_abc');
});

it('creates explicit audio controls without autoplay and clears them on logout',async()=>{
 const f=await fixture();await f.login();await f.open();expect(f.get('media').querySelector('audio')).toBeNull();
 const button=Array.from(f.get('media').querySelectorAll('button')).find(b=>b.textContent==='载入声音')!;button.click();
 const audio=f.get('media').querySelector('audio')!;expect(audio.controls).toBe(true);expect(audio.autoplay).toBe(false);expect(audio.preload).toBe('none');
 f.get('logout').click();await until(()=>!f.get('login').hidden);expect(f.get('media').querySelector('audio')).toBeNull();
});

it('releases a listed author independently of a report, with a reason, explicit confirmation and logout clearing',async()=>{
 const f=await fixture();await f.login();f.get('load-restrictions').click();
 await until(()=>!!f.get('restriction-list').querySelector('textarea'));
 expect(f.get('restriction-list').textContent).toContain('<b>Test author</b>');expect(f.get('restriction-list').querySelector('b')).toBeNull();
 const button=f.get('restriction-list').querySelector('button')!;button.click();expect(f.get('notice').textContent).toBe('请填写处理原因。');
 (f.get('restriction-list').querySelector('textarea') as HTMLTextAreaElement).value='review completed';button.click();
 expect(f.get('confirm').hasAttribute('open')).toBe(true);expect(f.fetch.mock.calls.some(c=>c[0].endsWith('/release'))).toBe(false);
 f.get('cancel-confirm').click();expect(f.fetch.mock.calls.some(c=>c[0].endsWith('/release'))).toBe(false);
 button.click();f.get('send-confirm').click();await until(()=>f.get('notice').textContent==='处理已完成。');
 const call=f.fetch.mock.calls.find(c=>c[0].endsWith('/release'))!;expect(call[0]).toBe('/api/restricted-authors/usr_test/release');expect(JSON.parse(call[1]!.body!)).toMatchObject({reason:'review completed',version:'restriction-v1'});
 expect(f.get('restriction-list').textContent).toContain('当前没有受限制的账号。');
 f.get('logout').click();await until(()=>!f.get('login').hidden);expect(f.get('restriction-list').textContent).toBe('');
});
