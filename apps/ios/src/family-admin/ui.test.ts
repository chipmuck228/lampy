import {JSDOM} from 'jsdom';
import {ADMIN_HTML,ADMIN_JS} from './ui';

let dom:JSDOM;
afterEach(()=>dom?.window.close());
async function until(check:()=>boolean){for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}throw Error('UI did not settle');}
async function fixture(){
 dom=new JSDOM(ADMIN_HTML,{url:'https://admin.example.test',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,d=w.document;
 const polls:(()=>void)[]=[],nativeInterval=w.setInterval.bind(w);
 w.setInterval=((fn:()=>void,ms?:number)=>{if(ms===5000)polls.push(fn);return nativeInterval(fn,ms);}) as typeof w.setInterval;
 Object.defineProperty(w.HTMLDialogElement.prototype,'showModal',{value:function(){this.setAttribute('open','');}});
 Object.defineProperty(w.HTMLMediaElement.prototype,'pause',{value:jest.fn()});Object.defineProperty(w.HTMLMediaElement.prototype,'load',{value:jest.fn()});
 Object.defineProperty(w.HTMLDialogElement.prototype,'close',{value:function(){this.removeAttribute('open');}});
 let signedIn=false,version='first';
 const report={reportId:'report_test',reason:'privacy',status:'pending',createdAt:'2026-10-21T00:00:00Z',detail:'<script>alert(1)</script>'};
 const detail=()=>({report:{...report},familyName:'Test family',authorNickname:'Test author',share:{note:'<img src=x onerror=alert(1)> private record',occurredAtPrecision:'unknown',media:[{objectId:'med_abc',mimeType:'image/png'},{objectId:'med_def',mimeType:'audio/mp4'}]},hidden:false,sharingRestricted:false,authorAvailable:true,version});
 const fetch=jest.fn(async(url:string,options?:{body?:string})=>{
  let status=200,data:unknown={};
  if(url==='/api/login'){signedIn=true;data={username:'developer',csrf:'csrf'};}
  else if(url==='/api/logout'){signedIn=false;data={ok:true};}
  else if(!signedIn){status=401;data={error:'SIGN_IN_REQUIRED'};}
  else if(url==='/api/operations')data={enabled:true,available:true,generatedAt:new Date().toISOString(),units:[{unit:'lampy-family.service',state:'active'}],logs:[{unit:'lampy-family.service',event:'SERVICE_ERROR',at:new Date().toISOString(),message:'secret raw'}],backup:{event:'BACKUP_COMPLETE',lastSuccess:new Date().toISOString(),files:3}};
  else if(url==='/api/session')data={username:'developer',csrf:'csrf'};
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
 return {w,d,get,fetch,submit,login,open,pollOperations:()=>polls.forEach(fn=>fn())};
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

it('shows fixed-field operational status without raw logs and clears it on logout',async()=>{
 const f=await fixture();await f.login();f.get('tab-operations').click();await until(()=>!!f.get('ops-units').textContent);
 expect(f.get('ops-units').textContent).toContain('家庭 API');expect(f.get('ops-backup').textContent).toContain('媒体 3 份');expect(f.get('ops-logs').textContent).toContain('服务错误');expect(f.get('ops-logs').textContent).not.toContain('secret');
 f.get('logout').click();await until(()=>!f.get('login').hidden);expect(f.get('operations').hidden).toBe(true);expect(f.get('ops-units').textContent).toBe('');expect(f.get('ops-logs').textContent).toBe('');
});

it('keeps reports separate, polls only the active operations tab, and supports keyboard tabs',async()=>{
 const f=await fixture();await f.login();
 const count=()=>f.fetch.mock.calls.filter(c=>c[0]==='/api/operations').length;
 expect(f.get('operations').hidden).toBe(true);expect(count()).toBe(0);
 f.pollOperations();expect(count()).toBe(0);
 f.get('tab-operations').click();await until(()=>!!f.get('ops-units').textContent);
 expect(f.get('workspace').hidden).toBe(true);expect(f.get('tab-operations').getAttribute('aria-selected')).toBe('true');
 f.pollOperations();await until(()=>count()===2);
 f.get('tab-operations').dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));
 expect(f.get('workspace').hidden).toBe(false);expect(f.get('operations').hidden).toBe(true);
 expect(f.d.activeElement).toBe(f.get('tab-reports'));expect(f.d.querySelector('.report-row')).not.toBeNull();
 f.pollOperations();expect(count()).toBe(2);
 f.get('logout').click();await until(()=>!f.get('login').hidden);
 expect(f.get('admin-tabs').hidden).toBe(true);f.pollOperations();expect(count()).toBe(2);
});
it('does not reopen operations when a response arrives after switching back to reports',async()=>{
 const f=await fixture();await f.login();const original=f.fetch.getMockImplementation()!;
 let release:(value:any)=>void=()=>{};
 f.fetch.mockImplementation((url,options)=>url==='/api/operations'?new Promise(resolve=>{release=resolve;}):original(url,options));
 f.get('tab-operations').click();f.get('tab-reports').click();
 release({ok:true,status:200,json:async()=>({enabled:true,available:false})});
 await new Promise(resolve=>setTimeout(resolve,0));
 expect(f.get('workspace').hidden).toBe(false);expect(f.get('operations').hidden).toBe(true);
});
