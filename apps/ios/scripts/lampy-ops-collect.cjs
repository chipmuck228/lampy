'use strict';
const fs=require('node:fs/promises'),{execFileSync}=require('node:child_process');
const {collect,UNITS}=require('./ops/collector.cjs'),{jsonWrite}=require('./ops/files.cjs');
async function main(){
 if(process.getuid?.()!==0||process.argv.length!==2)throw Error('CONFIG');
 const states={};for(const unit of UNITS)try{states[unit]=execFileSync('/usr/bin/systemctl',['show',unit,'--property=ActiveState','--value'],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','ignore']}).trim();}catch{states[unit]='unknown';}
 const output=execFileSync('/usr/bin/journalctl',[...UNITS.flatMap(u=>['-u',u]),'--since','30 minutes ago','-n','100','--no-pager','-o','json'],{encoding:'utf8',maxBuffer:1024*1024,timeout:5000});
 const entries=output.split('\n').filter(Boolean).map(line=>{try{return JSON.parse(line);}catch{return {};}});
 const backup=await fs.readFile('/var/lib/lampy-ops/backup-status.json','utf8').then(JSON.parse).catch(()=>({}));
 const resumeRequired=await fs.stat('/var/lib/lampy-ops/resume.json').then(()=>true).catch(()=>false);
 const snapshot=collect({states,entries,backup,resumeRequired});
 await jsonWrite('/var/lib/lampy-ops/public/status.json',snapshot,0o640);
}
if(require.main===module)main().catch(()=>{process.stderr.write('{"event":"OPS_COLLECT_FAILED"}\n');process.exitCode=1;});
module.exports={main};
