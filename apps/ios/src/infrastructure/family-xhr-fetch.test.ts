import {fetch as mediaFetch} from 'expo/fetch';
import {familyXhrFetch} from './family-xhr-fetch';
jest.mock('expo/fetch',()=>({fetch:jest.fn()}));

it('uses XHR independently of the global fetch and propagates cancellation', async()=>{
 const previousFetch=globalThis.fetch, previousXhr=globalThis.XMLHttpRequest;
 const globalFetch=jest.fn();
 let xhr: {onabort:()=>void; abort:jest.Mock}|undefined;
 class FakeXhr {
  onabort=()=>{}; open=jest.fn(); setRequestHeader=jest.fn(); send=jest.fn();
  abort=jest.fn(()=>this.onabort());
  constructor(){xhr=this;}
 }
 try {
  globalThis.fetch=globalFetch;
  globalThis.XMLHttpRequest=FakeXhr as unknown as typeof XMLHttpRequest;
  const controller=new AbortController();
  const result=familyXhrFetch('https://family-test.yunpura.com/health',{signal:controller.signal});
  const rejected=expect(result).rejects.toMatchObject({name:'AbortError'});
  expect(globalFetch).not.toHaveBeenCalled();
  expect(xhr).toBeDefined();
  controller.abort();
  await rejected;
  expect(xhr!.abort).toHaveBeenCalledTimes(1);
  expect((familyXhrFetch as typeof fetch & {polyfill?:boolean}).polyfill).toBe(true);
 }finally{globalThis.fetch=previousFetch;globalThis.XMLHttpRequest=previousXhr;}
});

it.each([200,403,204])('reads JSON as XHR text without Blob reads and preserves status %s/auth', async(status)=>{
 const previousXhr=globalThis.XMLHttpRequest;
 let instance: FakeJsonXhr | undefined;
 class FakeJsonXhr {
  status=status; statusText=''; responseText='{"families":[]}'; responseType=''; withCredentials=false;
  onload=()=>{}; onerror=()=>{}; onabort=()=>{}; ontimeout=()=>{};
  open=jest.fn();setRequestHeader=jest.fn();abort=jest.fn();
  getAllResponseHeaders=()=> 'Content-Type: application/json\r\nX-Lampy-Request-Id: diag-test\r\n';
  send=jest.fn(()=>this.onload());
  constructor(){instance=this;}
 }
 const readerDescriptor=Object.getOwnPropertyDescriptor(globalThis,'FileReader');
 const blobRead=jest.fn(()=>{throw Error('JSON must not read a Blob');});
 Object.defineProperty(globalThis,'FileReader',{configurable:true,writable:true,value:class {readAsText=blobRead;}});
 try {
  globalThis.XMLHttpRequest=FakeJsonXhr as unknown as typeof XMLHttpRequest;
  const response=await familyXhrFetch('https://family-test.yunpura.com/v2/me/families',{headers:{accept:'application/json',authorization:'Bearer test-only'}});
  expect(instance!.responseType).toBe('text');
  expect(instance!.setRequestHeader).toHaveBeenCalledWith('authorization','Bearer test-only');
  expect(response.status).toBe(status);expect(response.headers.get('content-type')).toBe('application/json');
  await expect(response.text()).resolves.toBe(status===204?'':'{"families":[]}');expect(blobRead).not.toHaveBeenCalled();
 } finally {globalThis.XMLHttpRequest=previousXhr;if(readerDescriptor)Object.defineProperty(globalThis,'FileReader',readerDescriptor);else Reflect.deleteProperty(globalThis,'FileReader');}
});

it('cancels the JSON XHR when its existing deadline aborts',async()=>{
 const previousXhr=globalThis.XMLHttpRequest;
 let abort: jest.Mock | undefined;
 class PendingXhr {
  onabort=()=>{};open=jest.fn();setRequestHeader=jest.fn();send=jest.fn();
  abort=jest.fn(()=>this.onabort());constructor(){abort=this.abort;}
 }
 try {
  globalThis.XMLHttpRequest=PendingXhr as unknown as typeof XMLHttpRequest;
  const controller=new AbortController();
  const work=familyXhrFetch('https://family-test.yunpura.com/v2/me/families',{headers:{accept:'application/json'},signal:controller.signal});
  const rejected=expect(work).rejects.toMatchObject({name:'AbortError'});controller.abort();await rejected;
  expect(abort).toHaveBeenCalledTimes(1);
 }finally{globalThis.XMLHttpRequest=previousXhr;}
});

it('routes binary downloads through native Expo fetch with original authorization and cancellation',async()=>{
 const controller=new AbortController(),buffer=new Uint8Array([1,2,3]).buffer;
 const response={status:200,arrayBuffer:async()=>buffer} as Response;
 jest.mocked(mediaFetch).mockResolvedValueOnce(response as Awaited<ReturnType<typeof mediaFetch>>);
 const headers={accept:'*/*',authorization:'Bearer test-only'};
 const result=await familyXhrFetch('https://family-test.yunpura.com/v2/families/f/shares/s/media/m/content',{method:'GET',headers,signal:controller.signal});
 expect(result).toBe(response);await expect(result.arrayBuffer()).resolves.toBe(buffer);
 expect(mediaFetch).toHaveBeenLastCalledWith(expect.any(String),{method:'GET',headers,signal:controller.signal});
});
it('finishes JSON renewal while a binary native body is still pending, without Blob/FileReader',async()=>{
 const previousXhr=globalThis.XMLHttpRequest,reader=Object.getOwnPropertyDescriptor(globalThis,'FileReader');
 let finish!:(bytes:ArrayBuffer)=>void,finished=false;
 const body=new Promise<ArrayBuffer>(resolve=>{finish=resolve;});
 jest.mocked(mediaFetch).mockResolvedValueOnce({status:200,arrayBuffer:()=>body} as Awaited<ReturnType<typeof mediaFetch>>);
 class JsonXhr {
  status=200;statusText='';responseText='{"shares":[]}';responseType='';
  onload=()=>{};onerror=()=>{};onabort=()=>{};ontimeout=()=>{};
  open=jest.fn();setRequestHeader=jest.fn();abort=jest.fn();
  getAllResponseHeaders=()=> 'Content-Type: application/json';send=()=>this.onload();
 }
 try {
  Object.defineProperty(globalThis,'FileReader',{configurable:true,writable:true,value:class {constructor(){throw Error('must not use FileReader');}}});
  globalThis.XMLHttpRequest=JsonXhr as unknown as typeof XMLHttpRequest;
  const download=familyXhrFetch('https://family-test.yunpura.com/v2/families/f/shares/s/media/m/content',{headers:{accept:'*/*',authorization:'Bearer test-only'}}).then(r=>r.arrayBuffer()).then(()=>{finished=true;});
  const renewal=await familyXhrFetch('https://family-test.yunpura.com/v2/families/f/shares',{headers:{accept:'application/json',authorization:'Bearer test-only'}});
  await expect(renewal.text()).resolves.toBe('{"shares":[]}');expect(finished).toBe(false);
  finish(new Uint8Array([1]).buffer);await download;expect(finished).toBe(true);
 }finally{globalThis.XMLHttpRequest=previousXhr;if(reader)Object.defineProperty(globalThis,'FileReader',reader);else Reflect.deleteProperty(globalThis,'FileReader');}
});

it('does not silently fall back to RN networking after a native media cancellation',async()=>{
 const previousXhr=globalThis.XMLHttpRequest;
 const xhr=jest.fn();globalThis.XMLHttpRequest=xhr as unknown as typeof XMLHttpRequest;
 try {
  jest.mocked(mediaFetch).mockRejectedValueOnce(Object.assign(new Error('cancelled'),{name:'AbortError'}));
  await expect(familyXhrFetch('https://family-test.yunpura.com/v2/families/f/shares/s/media/m/content',{headers:{accept:'*/*'}})).rejects.toMatchObject({name:'AbortError'});
  expect(xhr).not.toHaveBeenCalled();
 }finally{globalThis.XMLHttpRequest=previousXhr;}
});
