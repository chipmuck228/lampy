'use strict';
// Operator-only GET diagnostics. Never print credentials, IDs, URLs or content.
const {performance}=require('node:perf_hooks');
const {createHash}=require('node:crypto');
const {existsSync}=require('node:fs');
const path=require('node:path');
const safeCode=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(value)?value:undefined;
async function request(origin,route,token,binary,fetchImpl) {
  const start=performance.now();
  try {
    const response=await fetchImpl(origin+route,{method:'GET',headers:{authorization:`Bearer ${token}`,accept:binary?'*/*':'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});
    if(binary&&response.ok){
      const bytes=new Uint8Array(await response.arrayBuffer());
      return {status:response.status,ms:Math.round(performance.now()-start),byteLength:bytes.length,hash:createHash('sha256').update(bytes).digest('hex')};
    }
    let body;try{body=await response.json();}catch{/* non-JSON response is reported without printing text */}
    return {status:response.status,ms:Math.round(performance.now()-start),code:safeCode(body?.error?.code),body};
  }catch{return {status:0,ms:Math.round(performance.now()-start),code:'NETWORK_OR_TIMEOUT'};}
}
async function probe({shares,sessions,port=8789,fetchImpl=globalThis.fetch,write=console.log,now=Date.now()}) {
  if(!Number.isInteger(Number(port))||Number(port)<1||Number(port)>65535)throw Error('PORT');
  const report=[];
  const publish=(fields,result,extra={})=>{const row={...fields,status:result.status,ms:result.ms,...(result.code?{code:result.code}:{}),...extra};report.push(row);write(JSON.stringify(row));};
  for(const [index,share] of shares.slice(0,4).entries()){
    const session=sessions.find(s=>s.user_id===share.author_user_id&&Date.parse(s.expires_at)>now);
    if(!session){write(JSON.stringify({record:index+1,code:'NO_ACTIVE_AUTHOR_SESSION'}));continue;}
    if(!/^shr_[a-zA-Z0-9_-]+$/.test(share.share_id)||!/^fam_[a-zA-Z0-9_-]+$/.test(share.family_id))throw Error('REFERENCE');
    for(const [via,origin] of [['local',`http://127.0.0.1:${Number(port)}`],['https','https://family.yunpura.com']]){
      const base=`/v2/families/${share.family_id}/shares/${share.share_id}`;
      const detail=await request(origin,base,session.token,false,fetchImpl);
      publish({record:index+1,via,stage:'DETAIL',viewer:'AUTHOR'},detail);
      if(detail.status!==200||!Array.isArray(detail.body?.snapshot?.media))continue;
      for(const [number,item] of detail.body.snapshot.media.slice(0,4).entries()){
        if(!/^med_[a-zA-Z0-9_-]+$/.test(item.objectId))throw Error('REFERENCE');
        const fields={record:index+1,via,media:number+1};
        const meta=await request(origin,base+`/media/${item.objectId}`,session.token,false,fetchImpl);
        publish({...fields,stage:'MEDIA_METADATA'},meta);
        if(meta.status!==200)continue;
        const content=await request(origin,base+`/media/${item.objectId}/content`,session.token,true,fetchImpl);
        const integrity=content.status===200&&content.byteLength===meta.body?.byteLength&&content.hash===meta.body?.contentSha256?'MATCH':content.status===200?'MISMATCH':'NOT_CHECKED';
        publish({...fields,stage:'MEDIA_CONTENT'},content,{integrity});
      }
    }
  }
  return report;
}
async function main(){
  const database=process.env.LAMPY_FAMILY_DATABASE_PATH;
  if(!database||!path.isAbsolute(database)||!existsSync(database))throw Error('DATABASE');
  const {DatabaseSync}=require('node:sqlite');
  const db=new DatabaseSync(database,{readOnly:true});let shares,sessions;
  try {
    db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=3000;');
    const schema=db.prepare('SELECT MAX(version) AS version FROM family_schema_migrations').get().version;
    if(![33,34].includes(Number(schema)))throw Error('SCHEMA');
    shares=db.prepare("SELECT share_id,family_id,author_user_id FROM family_shares WHERE status='active' ORDER BY shared_at DESC LIMIT 4").all();
    sessions=db.prepare('SELECT token,user_id,expires_at FROM family_sessions ORDER BY expires_at DESC').all();
  }finally{db.close();}
  console.log(JSON.stringify({probe:'FAMILY_SHARE_READ',records:shares.length,order:'NEWEST_FIRST',database:'READ_ONLY',requests:'GET_ONLY',viewer:'AUTHOR',privateValues:'NOT_PRINTED'}));
  await probe({shares,sessions,port:Number(process.env.LAMPY_FAMILY_API_PORT||8789)});
}
if(require.main===module)void main().catch(()=>{console.error('SHARE_READ_PROBE_FAILED');process.exitCode=1;});
module.exports={probe};
