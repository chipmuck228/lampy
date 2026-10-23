'use strict';
const UNITS=['lampy-family.service','lampy-family-admin.service','lampy-family-cleanup.service','lampy-family-backup@automatic.service','lampy-family-backup@manual.service','lampy-family-backup@prune.service'];
const STATES=['active','inactive','failed','activating','deactivating','reloading','unknown'];
const EVENTS=['SERVICE_STARTED','SERVICE_STOPPED','SERVICE_MESSAGE','SERVICE_ERROR','CLEANUP_COMPLETE','CLEANUP_FAILED','BACKUP_COMPLETE','BACKUP_FAILED','BACKUP_PRUNE_COMPLETE','RESTORE_REHEARSAL_COMPLETE'];
function stamp(v){return typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))?v:null;}
const count=v=>Number.isSafeInteger(v)&&v>=0&&v<=Number.MAX_SAFE_INTEGER?v:0;
const TASKS=UNITS.slice(2);
function systemdRun(p={},now=new Date()){
 const parse=v=>typeof v==='string'&&v.length<80&&/ UTC$/.test(v)&&Number.isFinite(Date.parse(v))?new Date(Date.parse(v)).toISOString():null;
 const start=parse(p.ExecMainStartTimestamp),end=parse(p.ExecMainExitTimestamp);
 if(!start||!end||end<start||Date.parse(end)>now.getTime()+60000||!['inactive','failed'].includes(p.ActiveState))return null;
 const code=Number(p.ExecMainCode),status=Number(p.ExecMainStatus);
 if(!Number.isInteger(code)||code===0||!Number.isInteger(status))return null;
 return {at:end,result:p.Result==='success'&&code===1&&status===0?'success':'failed'};
}
function collect({entries=[],states={},runs={},previous={},backup={},now=new Date(),resumeRequired=false}){
 const logs=[];
 for(const entry of entries.slice(-100)){
  const unit=entry._SYSTEMD_UNIT;if(!UNITS.includes(unit))continue;
  const micros=Number(entry.__REALTIME_TIMESTAMP),time=Number.isFinite(micros)&&micros>0?new Date(micros/1000):null;
  if(!time||!Number.isFinite(time.getTime())||time.getTime()>now.getTime()+60000||time.getTime()<now.getTime()-30*60000)continue;
  let event='SERVICE_MESSAGE',counts;
  try{
   const value=JSON.parse(entry.MESSAGE);
   if(['SERVICE_STARTED','SERVICE_STOPPED','SERVICE_ERROR','BACKUP_COMPLETE','BACKUP_FAILED','BACKUP_PRUNE_COMPLETE','RESTORE_REHEARSAL_COMPLETE'].includes(value.event))event=value.event;
   else if(unit==='lampy-family-cleanup.service'&&['checked','completed','failed','removedFiles'].every(k=>Number.isSafeInteger(value[k]))){event=value.failed?'CLEANUP_FAILED':'CLEANUP_COMPLETE';counts={checked:count(value.checked),completed:count(value.completed),failed:count(value.failed),removedFiles:count(value.removedFiles)};}
  }catch{/* No raw MESSAGE, even for errors: it may contain credentials or user text. */}
  if(event==='SERVICE_MESSAGE'&&Number(entry.PRIORITY)<=3)event='SERVICE_ERROR';
  logs.push({unit,event,at:time.toISOString(),...(counts?{counts}:{})});
 }
 const latest=unit=>{
  const candidates=[(Array.isArray(previous?.units)?previous.units:[]).find(r=>r?.unit===unit)?.lastRun,runs[unit],...logs.filter(r=>r.unit===unit&&['CLEANUP_COMPLETE','CLEANUP_FAILED','BACKUP_COMPLETE','BACKUP_FAILED','BACKUP_PRUNE_COMPLETE'].includes(r.event)).map(r=>({at:r.at,result:r.event.endsWith('_FAILED')?'failed':'success'}))];
  return candidates.filter(r=>stamp(r?.at)&&['success','failed'].includes(r.result)&&Date.parse(r.at)<=now.getTime()+60000).map(r=>({at:r.at,result:r.result})).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)||(a.result==='failed'?-1:b.result==='failed'?1:0))[0]??null;
 };
 return {format:1,generatedAt:now.toISOString(),units:UNITS.map(unit=>({unit,state:STATES.includes(states[unit])?states[unit]:'unknown',...(TASKS.includes(unit)?{lastRun:latest(unit)}:{})})),logs,
  backup:{event:['BACKUP_COMPLETE','BACKUP_FAILED','BACKUP_RUNNING'].includes(backup.event)?backup.event:'UNKNOWN',lastSuccess:stamp(backup.lastSuccess),attemptedAt:stamp(backup.attemptedAt),files:count(backup.files),bytes:count(backup.bytes)},resumeRequired:resumeRequired===true,cloudSnapshots:'NOT_VERIFIED'};
}
module.exports={UNITS,STATES,EVENTS,collect,systemdRun};
