'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {preflight,createBackup,pruneBackups,rehearse,jsonWrite,ID}=require('./ops/backup.cjs');
const WRITERS=['lampy-family.service','lampy-family-admin.service','lampy-family-cleanup.service'];
const TIMER='lampy-family-cleanup.timer',RESUME=['lampy-family.service','lampy-family-admin.service',TIMER];
const STATE='/var/lib/lampy-ops';
const realSystem={state(unit){return execFileSync('/usr/bin/systemctl',['show',unit,'--property=ActiveState','--value'],{encoding:'utf8',timeout:30000}).trim();},async stop(unit){execFileSync('/usr/bin/systemctl',['stop',unit],{stdio:'ignore',timeout:60000});},async start(unit){execFileSync('/usr/bin/systemctl',['start',unit],{stdio:'ignore',timeout:60000});}};
async function readPlan(state){try{return JSON.parse(await fs.readFile(path.join(state,'resume.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw Error('RESUME_PLAN_INVALID');}}
async function resume(state,system,owner,stale=false){
 const p=await readPlan(state);if(!p||(!stale&&p.owner!==owner))return;
 if(!/^[a-f0-9]{32}$/.test(p.owner)||!Array.isArray(p.units)||p.units.some(u=>!RESUME.includes(u)))throw Error('RESUME_PLAN_INVALID');
 let failed=false;for(const unit of RESUME.filter(u=>p.units.includes(u)))try{await system.start(unit);}catch{failed=true;}
 if(failed)throw Error('SERVICE_RESUME_FAILED');await fs.rm(path.join(state,'resume.json'));
}
async function maintenance(action,c,{system=realSystem,state=STATE,owner,perform=createBackup,now=new Date()}={}){
 if(!['automatic','manual','prune','rehearse'].includes(action)||!/^[a-f0-9]{32}$/.test(owner||''))throw Error('INVALID_OPERATION');
 if(await readPlan(state))throw Error('PREVIOUS_RESUME_REQUIRED');
 const oldStatus=await fs.readFile(path.join(state,'backup-status.json'),'utf8').then(JSON.parse).catch(()=>({}));
 const update=async value=>jsonWrite(path.join(state,'backup-status.json'),{lastSuccess:oldStatus.lastSuccess??null,files:oldStatus.files??0,bytes:oldStatus.bytes??0,...value});
 try{
  if(action==='prune'){
   const result=await pruneBackups(c.root,now);if(result.rejected)throw Error('BACKUP_PRUNE_REJECTED');
   await pruneChecks(c.checkRoot,now);return result;
  }
  if(action==='rehearse'){
   if(!ID.test(c.id||''))throw Error('BACKUP_ID_REQUIRED');
   return await rehearse(c.root,c.id,c.checkRoot);
  }
  await preflight(c);const pruning=await pruneBackups(c.root,now);if(pruning.rejected)throw Error('BACKUP_PRUNE_REJECTED');
  await update({event:'BACKUP_RUNNING',attemptedAt:now.toISOString()});
  const units=RESUME.filter(u=>!['inactive','failed'].includes(system.state(u)));
  await jsonWrite(path.join(state,'resume.json'),{owner,units});
  let result;
  try{await system.stop(TIMER);for(const unit of WRITERS)await system.stop(unit);result=await perform(c,action,now);}
  finally{await resume(state,system,owner);}
  await update({event:'BACKUP_COMPLETE',lastSuccess:result.createdAt,attemptedAt:now.toISOString(),files:result.files,bytes:result.bytes});return result;
 }catch(e){await update({event:'BACKUP_FAILED',attemptedAt:now.toISOString()}).catch(()=>{});throw e;}
}
async function pruneChecks(root,now){
 const s=await fs.lstat(root);if(!s.isDirectory()||s.isSymbolicLink()||await fs.realpath(root)!==path.resolve(root))throw Error('CHECK_ROOT_INVALID');
 for(const name of await fs.readdir(root))if(/^rehearsal-[A-Za-z0-9]{6}$/.test(name)){
  const file=path.join(root,name),s=await fs.lstat(file);if(s.isDirectory()&&!s.isSymbolicLink()&&s.mtimeMs<now.getTime()-86400000)await fs.rm(file,{recursive:true});
 }
}
if(require.main===module){void(async()=>{
 if(process.getuid?.()!==0)throw Error('ROOT_REQUIRED');
 const [action,id,...extra]=process.argv.slice(2);if(extra.length||!['automatic','manual','prune','rehearse','resume','resume-stale'].includes(action)||((action!=='rehearse')&&id))throw Error('INVALID_OPERATION');
 const owner=process.env.INVOCATION_ID;
 if(action==='resume'||action==='resume-stale'){await resume(STATE,realSystem,owner,action==='resume-stale');return;}
 const c={database:process.env.LAMPY_BACKUP_DATABASE,media:process.env.LAMPY_BACKUP_MEDIA,root:process.env.LAMPY_BACKUP_ROOT,checkRoot:process.env.LAMPY_RESTORE_CHECK_ROOT,id};
 if(![c.database,c.media,c.root,c.checkRoot].every(v=>typeof v==='string'&&path.isAbsolute(v)))throw Error('CONFIG_REQUIRED');
 const report=await maintenance(action,c,{owner});process.stdout.write(JSON.stringify(report)+'\n');
})().catch(()=>{process.stderr.write('{"event":"BACKUP_FAILED"}\n');process.exitCode=1;});}
module.exports={maintenance,resume,pruneChecks};
