import {EventEmitter} from 'node:events';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {traceFamilyHttp} from './http-trace';
const id='diag-0123456789abcdef-1';
function fixtures(traceId=id){
 const req={method:'GET',url:'/v2/families/private-family/albums?private=query',headers:{'x-lampy-request-id':traceId,authorization:'Bearer private-token'}} as unknown as IncomingMessage;
 const res=Object.assign(new EventEmitter(),{setHeader:jest.fn(),statusCode:200,headersSent:false}) as unknown as ServerResponse;
 const write=jest.fn();return {req,res,write};
}
it('is off by default and rejects arbitrary client text',()=>{
 const a=fixtures();traceFamilyHttp(a.req,a.res,false,a.write);expect(a.write).not.toHaveBeenCalled();expect(a.res.setHeader).not.toHaveBeenCalled();
 const b=fixtures('private-email-or-token');traceFamilyHttp(b.req,b.res,true,b.write);expect(b.write).not.toHaveBeenCalled();
});
it('correlates arrival and one completion without paths, credentials or response data',()=>{
 const f=fixtures();traceFamilyHttp(f.req,f.res,true,f.write);f.res.emit('finish');f.res.emit('close');
 expect(f.res.setHeader).toHaveBeenCalledWith('x-lampy-request-id',id);expect(f.write).toHaveBeenCalledTimes(2);
 const output=f.write.mock.calls.map(call=>call[0]).join('\n');expect(output).toContain('START');expect(output).toContain('FINISH');expect(output).toContain('ALBUM_LIST');expect(output).not.toContain('private');
});
it('records disconnects before a response instead of reporting a successful 200',()=>{
 const f=fixtures();traceFamilyHttp(f.req,f.res,true,f.write);f.res.emit('close');f.res.emit('finish');expect(f.write).toHaveBeenCalledTimes(2);expect(f.write.mock.calls[1][0]).toContain('"event":"DISCONNECT","status":0');
});

it('keeps logging failures out of request handling',()=>{const f=fixtures();expect(()=>{traceFamilyHttp(f.req,f.res,true,()=>{throw new Error('log failed');});f.res.emit('finish');}).not.toThrow();});
