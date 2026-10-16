// Operator-only GET probes. Existing session credentials stay in this process.
const {existsSync}=require('node:fs');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const PUBLIC_ORIGIN='https://family-test.yunpura.com';

function readSession(databasePath,email,now=new Date()) {
  if(!databasePath||!path.isAbsolute(databasePath)||!existsSync(databasePath))throw new Error('DATABASE_CONFIG_REQUIRED');
  const normalized=String(email||'').trim().toLowerCase();
  if(!normalized||!normalized.includes('@'))throw new Error('TEST_ACCOUNT_EMAIL_REQUIRED');
  const {DatabaseSync}=require('node:sqlite');
  const db=new DatabaseSync(databasePath,{readOnly:true});
  try {
    const rows=db.prepare(`SELECT s.token,s.expires_at FROM family_sessions s
      JOIN family_accounts a ON a.user_id=s.user_id
      LEFT JOIN family_test_credentials c ON c.user_id=a.user_id
      WHERE lower(trim(a.email))=? OR c.login_normalized=?
      ORDER BY s.expires_at DESC`).all(normalized,normalized);
    const session=rows.find(row=>typeof row.token==='string'&&new Date(row.expires_at).getTime()>now.getTime());
    if(!session)throw new Error('NO_ACTIVE_SESSION_FOR_EMAIL');
    return session.token;
  } finally {db.close();}
}

async function measure(url,token,fetchImpl,timeoutMs) {
  const started=performance.now(),controller=new AbortController();let timer;
  try {
    const work=(async()=>{
      const response=await fetchImpl(url,{method:'GET',headers:{accept:'application/json',authorization:`Bearer ${token}`},redirect:'error',signal:controller.signal});
      const text=await response.text();let body;try{body=JSON.parse(text);}catch{/* report format only */}
      const rawCode=body?.error?.code;
      return {status:response.status,body,code:typeof rawCode==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(rawCode)?rawCode:undefined};
    })();
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('TIMEOUT'));},timeoutMs);});
    const result=await Promise.race([work,deadline]);
    return {...result,ms:Math.round(performance.now()-started)};
  } catch {
    return {status:0,code:controller.signal.aborted?'TIMEOUT':'NETWORK',ms:Math.round(performance.now()-started)};
  } finally {clearTimeout(timer);}
}

async function runProbe({token,port=8788,fetchImpl=globalThis.fetch,write=console.log,timeoutMs=10000}) {
  const localPort=Number(port);
  if(!Number.isInteger(localPort)||localPort<1||localPort>65535)throw new Error('PORT_CONFIG_REQUIRED');
  const report=[];
  function publish(label,result){
    const row={probe:label,status:result.status,ms:result.ms,...(result.code?{code:result.code}:{})};report.push(row);write(JSON.stringify(row));
  }
  for(const [label,origin] of [['local',`http://127.0.0.1:${localPort}`],['https',PUBLIC_ORIGIN]]) {
    const directory=await measure(`${origin}/v2/me/families`,token,fetchImpl,timeoutMs);publish(`${label}-directory`,directory);
    if(directory.status!==200||!Array.isArray(directory.body?.families))continue;
    // Match the App's concurrent per-family GETs, but never print names, IDs or bodies.
    const families=directory.body.families.slice(0,10).filter(f=>typeof f.familyId==='string'&&f.familyId.length<=150);
    await Promise.all(families.map(async(family,index)=>{
      const result=await measure(`${origin}/v2/families/${encodeURIComponent(family.familyId)}/albums`,token,fetchImpl,timeoutMs);
      publish(`${label}-album-${index+1}`,result);
    }));
  }
  return report;
}

async function main(){
  let token;
  try{token=readSession(process.env.LAMPY_FAMILY_DATABASE_PATH,process.env.FAMILY_PROBE_EMAIL);}
  catch(error){const allowed=['DATABASE_CONFIG_REQUIRED','TEST_ACCOUNT_EMAIL_REQUIRED','NO_ACTIVE_SESSION_FOR_EMAIL'];console.error(allowed.includes(error.message)?error.message:'SESSION_READ_FAILED');process.exitCode=1;return;}
  try{await runProbe({token,port:process.env.LAMPY_FAMILY_API_PORT||8788});}
  catch{console.error('PROBE_CONFIG_FAILED');process.exitCode=1;}
}
if(require.main===module)void main();
module.exports={readSession,runProbe};
