import {familyXhrFetch} from './family-xhr-fetch';

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
