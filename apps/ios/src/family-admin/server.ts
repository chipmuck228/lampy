import {readOperations} from './operations';
import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {isIP} from 'node:net';
import {existsSync,realpathSync} from 'node:fs';
import {openFamilySqliteDatabase} from '../family-api/node-db';
import {createDirectoryMediaBlobStore} from '../family-api/media-blobs';
import {createAdminAuth,validPasswordHash,verifyAdminPassword,secureEqual,sessionCookie,expiredCookie} from './auth';
import {createAdminService} from './service';
import {ADMIN_HTML,ADMIN_CSS,ADMIN_JS} from './ui';

export type AdminEnv=Record<string,string|undefined>;
export function adminConfig(env:AdminEnv){
 const origin=env.LAMPY_ADMIN_ORIGIN??'',username=env.LAMPY_ADMIN_USERNAME??'',passwordHash=env.LAMPY_ADMIN_PASSWORD_HASH??'';
 const url=new URL(origin);
 if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password||!url.hostname||!/^[A-Za-z0-9_.@-]{3,80}$/.test(username)||!validPasswordHash(passwordHash))throw Error('Invalid admin origin or credentials.');
 const database=env.LAMPY_FAMILY_DATABASE_PATH??'',media=env.LAMPY_FAMILY_MEDIA_PATH??'';
 if(!database||!media||!existsSync(database)||!existsSync(media))throw Error('Existing family database and media directory required.');
 const port=Number(env.LAMPY_ADMIN_PORT??8790);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid admin port.');
 const opsFile=env.LAMPY_ADMIN_OPS_FILE??'';if(opsFile&&opsFile!=='/var/lib/lampy-ops/public/status.json')throw Error('Invalid operations source.');
 return {origin,host:url.host,username,passwordHash,database:realpathSync(database),media:realpathSync(media),port,opsFile};
}
async function body(req:IncomingMessage){
 if(req.headers['content-type']!=='application/json')throw Error('BAD_REQUEST');
 if(Number(req.headers['content-length'])>8192){req.resume();throw Error('PAYLOAD_TOO_LARGE');}
 const chunks:Buffer[]=[];let total=0;
 for await(const part of req){const b=Buffer.from(part);total+=b.length;if(total>8192)throw Error('PAYLOAD_TOO_LARGE');chunks.push(b);}
 const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('BAD_REQUEST');
 return value as Record<string,unknown>;
}
function headers(res:ServerResponse){
 res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
 res.setHeader('Cache-Control','no-store, private');res.setHeader('Pragma','no-cache');
 res.setHeader('Strict-Transport-Security','max-age=31536000');
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
}
function json(res:ServerResponse,status:number,value:unknown){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(value));}
function errorCode(error:unknown){return error&&typeof error==='object'&&'code'in error?String(error.code):error instanceof Error?error.message:'';}
export async function startFamilyAdmin(options:{env?:AdminEnv;port?:number;now?:()=>number}={}){
 const config=adminConfig(options.env??process.env),clock=options.now??Date.now;
 const db=openFamilySqliteDatabase(config.database);let service:Awaited<ReturnType<typeof createAdminService>>;
 try{service=await createAdminService(db,createDirectoryMediaBlobStore(config.media),config.username,()=>new Date(clock()));await service.prune();}catch(e){await db.close();throw e;}
 const auth=createAdminAuth(clock);let hashing=false;
 const server=createServer((req,res)=>{void(async()=>{
  headers(res);
  if(req.headers.host!==config.host)return json(res,421,{error:'HOST_MISMATCH'});
  const url=new URL(req.url??'/',config.origin),route=url.pathname,method=req.method;
  if(method==='GET'&&route==='/favicon.ico'){res.statusCode=204;res.end();return;}
  if(method==='GET'&&['/','/admin.css','/admin.js'].includes(route)){
   res.setHeader('Content-Type',route==='/'?'text/html; charset=utf-8':route.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');res.end(route==='/'?ADMIN_HTML:route.endsWith('.css')?ADMIN_CSS:ADMIN_JS);return;
  }
  if(method!=='GET'&&method!=='POST')return json(res,405,{error:'METHOD_NOT_ALLOWED'});
  if(method==='POST'&&req.headers.origin!==config.origin)return json(res,403,{error:'ORIGIN_REQUIRED'});
  if(route==='/api/login'&&method==='POST'){
   const supplied=req.headers['x-lampy-admin-client'];const peer=typeof supplied==='string'&&isIP(supplied)?supplied:req.socket.remoteAddress??'unknown';
   if(hashing||!auth.allowLogin(peer))return json(res,429,{error:'TRY_LATER'});
   const input=await body(req);
   if(typeof input.username!=='string'||typeof input.password!=='string'||input.username.length>80||input.password.length>256)return json(res,400,{error:'BAD_REQUEST'});
   if(hashing)return json(res,429,{error:'TRY_LATER'});
   hashing=true;let verified=false;
   try{verified=await verifyAdminPassword(input.password,config.passwordHash);}finally{hashing=false;}
   if(!verified||!secureEqual(input.username,config.username))return json(res,401,{error:'LOGIN_FAILED'});
   // Rotate the session, including when a previously signed-in tab signs in again.
   const old=auth.session(req.headers.cookie,false);if(old)auth.revoke(old.key);
   await service.loginAudit('login');const session=auth.issue();res.setHeader('Set-Cookie',sessionCookie(session.token));return json(res,200,{username:config.username,csrf:session.csrf});
  }
  const session=auth.session(req.headers.cookie,route!=='/api/session'&&route!=='/api/operations'&&!route.endsWith('/validation'));
  if(!session){res.setHeader('Set-Cookie',expiredCookie());return json(res,401,{error:'SIGN_IN_REQUIRED'});}
  if(method==='POST'&&(!req.headers['x-csrf-token']||!secureEqual(String(req.headers['x-csrf-token']),session.csrf)))return json(res,403,{error:'CSRF_REQUIRED'});
  if(route==='/api/operations'&&method==='GET')return json(res,200,await readOperations(config.opsFile,clock()));
  if(route==='/api/session'&&method==='GET')return json(res,200,{username:config.username,csrf:session.csrf,expiresAt:session.expiresAt});
  if(route==='/api/logout'&&method==='POST'){auth.revoke(session.key);res.setHeader('Set-Cookie',expiredCookie());await service.loginAudit('logout');return json(res,200,{ok:true});}
  if(route==='/api/reports'&&method==='GET')return json(res,200,await service.list(url.searchParams.get('status')??'pending',Number(url.searchParams.get('page')??'0')));
  const match=/^\/api\/reports\/([A-Za-z0-9_-]{1,200})(?:\/(history|decision|media|validation)(?:\/(med_[a-f0-9]+))?)?$/.exec(route);
  if(!match)return json(res,404,{error:'NOT_FOUND'});
  const [,id,action,objectId]=match;
  if(!action&&method==='GET')return json(res,200,await service.read(id));
  if(action==='validation'&&method==='GET')return json(res,200,await service.validate(id));
  if(action==='history'&&method==='GET')return json(res,200,await service.history(id));
  if(action==='decision'&&method==='POST'){
   const input=await body(req);return json(res,200,await service.decide(id,{action:input.action,reason:input.reason,version:input.version}));
  }
  if(action==='media'&&objectId&&method==='GET'){
   const media=await service.media(id,objectId);let start=0,end=media.bytes.length-1;
   const range=req.headers.range;
   if(range){const r=/^bytes=(\d*)-(\d*)$/.exec(range);
    if(!r||(!r[1]&&!r[2]))return json(res,416,{error:'INVALID_RANGE'});
    if(!r[1])start=Math.max(0,media.bytes.length-Number(r[2]));else start=Number(r[1]);
    if(r[1]&&r[2])end=Math.min(end,Number(r[2]));
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start<0||start>=media.bytes.length){res.setHeader('Content-Range',`bytes */${media.bytes.length}`);return json(res,416,{error:'INVALID_RANGE'});}
    res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${media.bytes.length}`);
   }
   res.setHeader('Content-Type',media.mimeType);res.setHeader('Accept-Ranges','bytes');res.setHeader('Content-Length',end-start+1);res.setHeader('Content-Disposition','inline');res.end(Buffer.from(media.bytes.subarray(start,end+1)));return;
  }
  return json(res,404,{error:'NOT_FOUND'});
 })().catch(error=>{if(res.headersSent){res.destroy();return;}const code=errorCode(error);
  const status=['NOT_FOUND','SHARE_NOT_FOUND','MEDIA_NOT_FOUND'].includes(code)?404:code==='CONFLICT'?409:code==='PAYLOAD_TOO_LARGE'?413:code==='BAD_REQUEST'||error instanceof SyntaxError?400:503;
  const safeCode=['NOT_FOUND','SHARE_NOT_FOUND','MEDIA_NOT_FOUND','CONFLICT','PAYLOAD_TOO_LARGE','BAD_REQUEST'].includes(code)?code:status===400?'BAD_REQUEST':'UNAVAILABLE';
  json(res,status,{error:safeCode});
 });});
 server.requestTimeout=10000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
 const cleaner=setInterval(()=>{void service.prune().catch(()=>{});},3600000);cleaner.unref();
 try{await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(options.port??config.port,'127.0.0.1',()=>{server.off('error',reject);resolve();});});}catch(e){clearInterval(cleaner);await db.close();throw e;}
 return {port:(server.address() as {port:number}).port,async close(){clearInterval(cleaner);auth.clear();server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await db.close();}};
}
