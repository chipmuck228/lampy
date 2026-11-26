const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lampy-invite-deploy-'));
 const working=path.join(root,'test/apps/ios'),target=path.join(working,'src/family-api/invite-web.ts');
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.mkdirSync(path.join(root,'bin'));fs.mkdirSync(path.join(root,'backup'));
 fs.writeFileSync(target,'previous web source');
 const source=path.join(root,'new.ts');fs.copyFileSync(path.join(__dirname,'../src/family-api/invite-web.ts'),source);
 function executable(name,body){const file=path.join(root,'bin',name);fs.writeFileSync(file,'#!/bin/bash\n'+body);fs.chmodSync(file,0o755);}
 executable('id','echo 0');executable('node','exit 0');executable('chown','exit 0');
 executable('systemctl',`case "$1" in
 is-active) exit 0;;
 show) if [[ "$*" == *ExecStart* ]]; then echo "$DEPLOY_FIXTURE/test/apps/ios/scripts/family-api.cjs"; elif [[ "$2" == lampy-family-test.service || "$DEPLOY_SHARE_SOURCE" == 1 ]]; then echo "$DEPLOY_FIXTURE/test/apps/ios"; fi;;
 restart) echo "$2" >> "$DEPLOY_FIXTURE/restarts";;
 esac`);
 executable('curl',`url="\${!#}";case "$url" in
 */health) echo '{"ok":true}';;
 */invite.js) if [[ "$DEPLOY_FAIL_CHECK" == 1 ]];then echo 'old web';else echo 'navigator.clipboard;const download=""';fi;;
 */invite) echo '<button id="copy"></button><p id="wechat"></p><textarea id="invite-link"></textarea>';;
 esac`);
 const script=path.join(root,'deploy.sh');fs.writeFileSync(script,fs.readFileSync(path.join(__dirname,'deploy-invite-web-test.sh'),'utf8').replace('[[ "$working" == /opt/*/apps/ios ]]','[[ "$working" == "$DEPLOY_FIXTURE/test/apps/ios" ]]').replace('/var/backups/',path.join(root,'backup/')));
 return {root,target,source,run(mode,extra={}){return spawnSync('/bin/bash',[script,mode,source],{encoding:'utf8',timeout:10000,env:{...process.env,PATH:path.join(root,'bin')+':'+process.env.PATH,DEPLOY_FIXTURE:root,...extra}});},restarts(){const f=path.join(root,'restarts');return fs.existsSync(f)?fs.readFileSync(f,'utf8').trim().split('\n'):[];},close(){fs.rmSync(root,{recursive:true,force:true});}};
}
test('preflight leaves the running code and service untouched',()=>{const f=fixture();try{const r=f.run('--check');assert.equal(r.status,0,r.stderr);assert.equal(fs.readFileSync(f.target,'utf8'),'previous web source');assert.deepEqual(f.restarts(),[]);}finally{f.close();}});
test('apply replaces one source file and restarts only the test service',()=>{const f=fixture();try{const r=f.run('--apply');assert.equal(r.status,0,r.stderr);assert.equal(fs.readFileSync(f.target,'utf8'),fs.readFileSync(f.source,'utf8'));assert.deepEqual(f.restarts(),['lampy-family-test.service']);assert.match(r.stdout,/TEST_INVITE_WEB_DEPLOYED/);}finally{f.close();}});
test('failed new-page verification restores old source and restarts test service',()=>{const f=fixture();try{const r=f.run('--apply',{DEPLOY_FAIL_CHECK:'1'});assert.equal(r.status,1);assert.equal(fs.readFileSync(f.target,'utf8'),'previous web source');assert.deepEqual(f.restarts(),['lampy-family-test.service','lampy-family-test.service']);}finally{f.close();}});
test('shared production source is rejected before mutation or restart',()=>{const f=fixture();try{const r=f.run('--apply',{DEPLOY_SHARE_SOURCE:'1'});assert.equal(r.status,2);assert.equal(fs.readFileSync(f.target,'utf8'),'previous web source');assert.deepEqual(f.restarts(),[]);}finally{f.close();}});
