const {test}=require('node:test');const assert=require('node:assert/strict');const {createHash}=require('node:crypto');
const {probe}=require('./family-share-read-probe.cjs');
const shares=[{share_id:'shr_private',family_id:'fam_private',author_user_id:'secret-author'}];
const sessions=[{user_id:'secret-author',token:'secret-token',expires_at:'2099-01-01T00:00:00Z'}];
const bytes=new Uint8Array([1,2,3]);const hash=createHash('sha256').update(bytes).digest('hex');
const json=(body,status=200)=>({status,ok:status>=200&&status<300,json:async()=>body});
test('GET-only detail, metadata and content verification redact all private values',async()=>{
 const logs=[];let calls=0;
 const result=await probe({shares,sessions,write:line=>logs.push(line),fetchImpl:async(url,options)=>{
  calls++;assert.equal(options.method,'GET');assert.equal(options.headers.authorization,'Bearer secret-token');
  if(url.endsWith('/content'))return {status:200,ok:true,arrayBuffer:async()=>bytes.buffer};
  if(url.endsWith('/med_private'))return json({byteLength:3,contentSha256:hash});
  return json({snapshot:{note:'secret-note',media:[{objectId:'med_private'}]}});
 }});
 assert.equal(calls,6);assert.equal(result.filter(row=>row.integrity==='MATCH').length,2);
 assert.doesNotMatch(logs.join(''),/secret|shr_private|fam_private|med_private|https:|127\.0\.0\.1/);
});
test('reports exact refusal stage and safe error code without requesting content',async()=>{
 let calls=0;const result=await probe({shares,sessions,write:()=>{},fetchImpl:async()=>{calls++;return json({error:{code:'FORBIDDEN',message:'secret-note'}},403);}});
 assert.equal(calls,2);assert.ok(result.every(row=>row.stage==='DETAIL'&&row.code==='FORBIDDEN'&&row.status===403));
});
test('detects changed bytes and distinguishes a public-path failure',async()=>{
 const result=await probe({shares,sessions,write:()=>{},fetchImpl:async url=>{
  if(url.startsWith('https:'))return json({error:{code:'FORBIDDEN'}},403);
  if(url.endsWith('/content'))return {status:200,ok:true,arrayBuffer:async()=>new Uint8Array([9]).buffer};
  if(url.endsWith('/med_private'))return json({byteLength:3,contentSha256:hash});
  return json({snapshot:{media:[{objectId:'med_private'}]}});
 }});
 assert.ok(result.some(row=>row.integrity==='MISMATCH'));assert.ok(result.some(row=>row.via==='https'&&row.status===403));
});
test('expired sessions never issue requests',async()=>{
 let called=false;await probe({shares,sessions:[{...sessions[0],expires_at:'2000-01-01T00:00:00Z'}],write:()=>{},fetchImpl:async()=>{called=true;}});assert.equal(called,false);
});
