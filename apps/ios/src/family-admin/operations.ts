import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
const UNITS=['lampy-family.service','lampy-family-admin.service','lampy-family-cleanup.service','lampy-family-backup@automatic.service','lampy-family-backup@manual.service','lampy-family-backup@prune.service'];
const STATES=['active','inactive','failed','activating','deactivating','reloading','unknown'];
const EVENTS=['SERVICE_STARTED','SERVICE_STOPPED','SERVICE_MESSAGE','SERVICE_ERROR','CLEANUP_COMPLETE','CLEANUP_FAILED','BACKUP_COMPLETE','BACKUP_FAILED','BACKUP_PRUNE_COMPLETE','RESTORE_REHEARSAL_COMPLETE'];
const number=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:0;
const date=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))?v:null;
export function projectOperations(value:unknown,now=Date.now()){
 const v=value as Record<string,any>;
 const at=date(v?.generatedAt);
 if(v?.format!==1||!at||now-Date.parse(at)>30000||Date.parse(at)-now>60000||!Array.isArray(v.units)||!Array.isArray(v.logs)||v.logs.length>100)throw Error('OPS_UNAVAILABLE');
 const b=v.backup??{};
 // Project fixed fields a second time; never relay arbitrary JSON or messages.
 return {enabled:true,available:true,generatedAt:at,units:UNITS.map(unit=>({unit,state:STATES.includes(v.units.find((r:any)=>r?.unit===unit)?.state)?v.units.find((r:any)=>r?.unit===unit).state:'unknown'})),
  logs:v.logs.filter((r:any)=>UNITS.includes(r?.unit)&&EVENTS.includes(r.event)&&date(r.at)).map((r:any)=>({unit:r.unit,event:r.event,at:date(r.at),...(r.counts?{counts:{checked:number(r.counts.checked),completed:number(r.counts.completed),failed:number(r.counts.failed),removedFiles:number(r.counts.removedFiles)}}:{})})),
  backup:{event:['BACKUP_COMPLETE','BACKUP_FAILED','BACKUP_RUNNING'].includes(b.event)?b.event:'UNKNOWN',lastSuccess:date(b.lastSuccess),attemptedAt:date(b.attemptedAt),files:number(b.files),bytes:number(b.bytes)},resumeRequired:v.resumeRequired===true,cloudSnapshots:'NOT_VERIFIED'};
}
export async function readOperations(file:string,now=Date.now()){
 if(!file)return {enabled:false,available:false};
 try{
  const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const stat=await handle.stat();if(!stat.isFile()||stat.uid!==0||(stat.mode&0o022)!==0||stat.size>65536)throw Error('OPS_UNAVAILABLE');return projectOperations(JSON.parse(await handle.readFile('utf8')),now);}finally{await handle.close();}
 }catch{return {enabled:true,available:false};}
}
