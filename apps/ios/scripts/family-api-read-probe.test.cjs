const test=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {readSession,runProbe}=require('./family-api-read-probe.cjs');

test('selects only the requested account and an unexpired existing session, opening the database read-only',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'family-probe-')),file=path.join(dir,'db.sqlite');
 try{
  const db=new DatabaseSync(file);db.exec(`CREATE TABLE family_accounts(user_id TEXT,email TEXT);CREATE TABLE family_test_credentials(user_id TEXT,login_normalized TEXT);CREATE TABLE family_sessions(token TEXT,user_id TEXT,expires_at TEXT);
    INSERT INTO family_accounts VALUES('a','a@example.test'),('b','b@example.test');INSERT INTO family_test_credentials VALUES('a','alias@example.test');
    INSERT INTO family_sessions VALUES('expired','a','2000-01-01'),('selected-secret','a','2099-01-01'),('other-secret','b','2100-01-01');`);db.close();
  assert.equal(readSession(file,' ALIAS@EXAMPLE.TEST '),'selected-secret');
  assert.throws(()=>readSession(file,'absent@example.test'),/NO_ACTIVE_SESSION_FOR_EMAIL/);
  const check=new DatabaseSync(file,{readOnly:true});assert.equal(check.prepare('SELECT COUNT(*) AS count FROM family_sessions').get().count,3);check.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('uses only GETs to the two fixed origins and prints no credentials or private response fields',async()=>{
 const output=[],requests=[];
 const fetchImpl=async(url,init)=>{
  requests.push({url,init});const body=url.endsWith('/v2/me/families')?{families:[{familyId:'private-id',name:'private-name'}]}:{name:'private-book',opening:'private-opening',items:['private-note']};
  return {status:200,text:async()=>JSON.stringify(body)};
 };
 const report=await runProbe({token:'private-token',fetchImpl,write:line=>output.push(line)});
 assert.equal(report.length,4);assert.ok(requests.every(r=>r.init.method==='GET'&&r.init.redirect==='error'&&r.init.headers.authorization==='Bearer private-token'));
 assert.ok(requests.every(r=>['http://127.0.0.1:8788','https://family-test.yunpura.com'].includes(new URL(r.url).origin)));
 assert.doesNotMatch(output.join('\n'),/private-/);assert.ok(report.every(row=>row.status===200));
});
test('bounds a fetch that ignores abort and keeps raw network errors out of the result',async()=>{
 const reports=await runProbe({token:'secret',timeoutMs:10,write:()=>{},fetchImpl:()=>new Promise(()=>{})});
 assert.equal(reports.length,2);assert.ok(reports.every(row=>row.status===0&&row.code==='TIMEOUT'));
 const failed=await runProbe({token:'secret',write:()=>{},fetchImpl:async()=>{throw new Error('secret/body/url');}});
 assert.ok(failed.every(row=>row.code==='NETWORK'));assert.doesNotMatch(JSON.stringify(failed),/secret/);
});
