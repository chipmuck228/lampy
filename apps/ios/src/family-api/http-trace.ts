import type {IncomingMessage,ServerResponse} from 'node:http';
import {performance} from 'node:perf_hooks';
const TRACE_ID=/^diag-[a-f0-9]{16}-[1-9][0-9]{0,8}$/;
export function traceFamilyHttp(req:IncomingMessage,res:ServerResponse,enabled:boolean,write:(row:string)=>void=console.log){
  if(!enabled)return;
  const id=req.headers['x-lampy-request-id'];if(typeof id!=='string'||!TRACE_ID.test(id))return;
  const route=(req.url??'').split('?')[0];
  const kind=req.method==='GET'&&route==='/v2/me/families'?'DIRECTORY':req.method==='GET'&&/^\/v2\/families\/[^/]+\/albums$/.test(route)?'ALBUM_LIST':req.method==='POST'&&/^\/v2\/families\/[^/]+\/albums\/[^/]+\/validate$/.test(route)?'ALBUM_VALIDATE':req.method==='GET'&&/^\/v2\/families\/[^/]+\/album-access$/.test(route)?'ALBUM_ACCESS':null;
  if(!kind)return;
  const started=performance.now();let finished=false;
  const emit=(event:string,status:number)=>{try{write(`[family-http-trace] ${JSON.stringify({id,kind,event,status,ms:Math.round(performance.now()-started)})}`);}catch{/* Diagnostics never change the API response. */}};
  res.setHeader('x-lampy-request-id',id);emit('START',0);
  res.once('finish',()=>{if(!finished){finished=true;emit('FINISH',res.statusCode);}});
  res.once('close',()=>{if(!finished){finished=true;emit('DISCONNECT',res.headersSent?res.statusCode:0);}});
}
