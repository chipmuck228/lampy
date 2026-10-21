import {createHash, randomBytes, scrypt, scryptSync, timingSafeEqual} from 'node:crypto';

const OPTIONS={N:131072,r:8,p:1,maxmem:256*1024*1024};
const HASH=/^scrypt\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{64})$/;
export function validPasswordHash(value:string){return HASH.test(value);}
export function hashAdminPassword(password:string){
 if(Array.from(password).length<16||password.length>256)throw Error('Use 16–256 characters.');
 const salt=randomBytes(16);
 return `scrypt$131072$8$1$${salt.toString('hex')}$${scryptSync(password,salt,32,OPTIONS).toString('hex')}`;
}
export async function verifyAdminPassword(password:string,hash:string):Promise<boolean>{
 const match=HASH.exec(hash);if(!match||password.length>256)return false;
 const value=await new Promise<Buffer>((resolve,reject)=>scrypt(password,Buffer.from(match[1],'hex'),32,OPTIONS,(err,key)=>err?reject(err):resolve(key)));
 return timingSafeEqual(value,Buffer.from(match[2],'hex'));
}
export function secureEqual(a:string,b:string){return timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());}
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export const ADMIN_COOKIE='__Host-lampy_admin';
export function createAdminAuth(now:()=>number=Date.now){
 const sessions=new Map<string,{csrf:string;created:number;touched:number}>();
 const rates=new Map<string,{start:number;count:number}>();const pepper=randomBytes(32).toString('hex');
 function prune(){for(const [key,s]of sessions)if(now()-s.created>=8*3600000||now()-s.touched>=30*60000)sessions.delete(key);for(const [key,r]of rates)if(now()-r.start>=15*60000)rates.delete(key);}
 return {
  allowLogin(peer:string){prune();const key=digest(pepper+peer);if(!rates.has(key)&&rates.size>=1024)return false;
   const r=rates.get(key)??{start:now(),count:0};r.count++;rates.set(key,r);
   const global=rates.get('global')??{start:now(),count:0};global.count++;rates.set('global',global);
   return r.count<=10&&global.count<=60;
  },
  issue(){prune();if(sessions.size>=8)sessions.delete(sessions.keys().next().value!);const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');sessions.set(digest(token),{csrf,created:now(),touched:now()});return {token,csrf};},
  session(cookie:string|undefined,touch=true){prune();const values=(cookie??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(ADMIN_COOKIE+'='));if(values.length!==1)return null;const token=values[0].slice(ADMIN_COOKIE.length+1);if(!/^[a-f0-9]{64}$/.test(token))return null;const key=digest(token),s=sessions.get(key);if(!s)return null;if(touch)s.touched=now();return {key,csrf:s.csrf,expiresAt:new Date(s.created+8*3600000).toISOString()};},
  revoke(key:string){sessions.delete(key);},
  clear(){sessions.clear();rates.clear();},
 };
}
export const sessionCookie=(token:string)=>`${ADMIN_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800`;
export const expiredCookie=()=>`${ADMIN_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
