'use strict';
const fs=require('node:fs/promises'),{execFileSync}=require('node:child_process');
const {collect,UNITS,systemdRun}=require('./ops/collector.cjs'),{jsonWrite}=require('./ops/files.cjs');
async function main(){
 if(process.getuid?.()!==0||process.argv.length!==2)throw Error('CONFIG');
 const states={},runs={};for(const unit of UNITS)try{
  const output=execFileSync('/usr/bin/systemctl',['show',unit,'--property=ActiveState,ExecMainStartTimestamp,ExecMainExitTimestamp,ExecMainCode,ExecMainStatus,Result'],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','ignore'],env:{...process.env,TZ:'UTC',LC_ALL:'C'}});
  const props=Object.fromEntries(output.trim().split('\n').map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));states[unit]=props.ActiveState;runs[unit]=systemdRun(props);
 }catch{states[unit]='unknown';}
 const output=execFileSync('/usr/bin/journalctl',[...UNITS.flatMap(u=>['-u',u]),'--since','30 minutes ago','-n','100','--no-pager','-o','json'],{encoding:'utf8',maxBuffer:1024*1024,timeout:5000});
 const entries=output.split('\n').filter(Boolean).map(line=>{try{return JSON.parse(line);}catch{return {};}});
 const backup=await fs.readFile('/var/lib/lampy-ops/backup-status.json','utf8').then(JSON.parse).catch(()=>({}));
 const resumeRequired=await fs.stat('/var/lib/lampy-ops/resume.json').then(()=>true).catch(()=>false);
 let previous={};try{
  const handle=await fs.open('/var/lib/lampy-ops/public/status.json',require('node:fs').constants.O_RDONLY|require('node:fs').constants.O_NOFOLLOW);
  try{const stat=await handle.stat();if(stat.isFile()&&stat.uid===0&&(stat.mode&0o022)===0&&stat.size<=65536)previous=JSON.parse(await handle.readFile('utf8'));}finally{await handle.close();}
 }catch{/* First collection, or an invalid prior snapshot: no invented history. */}
 const snapshot=collect({states,runs,previous,entries,backup,resumeRequired});
 await jsonWrite('/var/lib/lampy-ops/public/status.json',snapshot,0o640);
}
if(require.main===module)main().catch(()=>{process.stderr.write('{"event":"OPS_COLLECT_FAILED"}\n');process.exitCode=1;});
module.exports={main};
