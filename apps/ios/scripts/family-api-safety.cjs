const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
Module._extensions['.ts'] = function compile(module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},fileName:filename}).outputText,filename);
};
// Host-only tool: database file permissions and service-user execution are the access boundary.
// No public HTTP route calls the review operation. Does not load or print credentials.
(async()=>{
  const database=process.env.LAMPY_FAMILY_DATABASE_PATH;
  if(!database||!fs.existsSync(database))throw Error('Set LAMPY_FAMILY_DATABASE_PATH to the existing production database.');
  const [action,id,decision,...extra]=process.argv.slice(2);
  if(!['list','inspect','review'].includes(action)||extra.length)throw Error('Usage: family-api-safety.cjs list | inspect REPORT_ID | review REPORT_ID keep|restrict');
  const {openFamilySqliteDatabase}=require('../src/family-api/node-db.ts');
  const {createSqliteFamilyRepository}=require('../src/family-api/sqlite-repository.ts');
  const {reviewSafetyReport}=require('../src/family-api/safety-commands.ts');
  const db=openFamilySqliteDatabase(database);
  try {
    const schema=await db.getFirst('SELECT MAX(version) AS version FROM family_schema_migrations');
    if(!schema||schema.version<33)throw Error('Schema 33 required; migrate using the deployment procedure first.');
    const repository=createSqliteFamilyRepository(db);
    const result=await repository.withTransaction(async tx=>{
      if(action==='list')return (await tx.listSafetyReports()).filter(r=>r.status==='pending').map(({reportId,reason,createdAt})=>({reportId,reason,createdAt}));
      const report=await tx.findSafetyReport(id);
      if(!report)throw Error('Report unavailable.');
      if(action==='inspect') {
        const share=await tx.findShare(report.shareId);
        return {report,share:share?{shareId:share.shareId,status:share.status,snapshot:share.snapshot}:null};
      }
      if(!['keep','restrict'].includes(decision))throw Error('Review decision must be keep or restrict.');
      const operator=(process.env.LAMPY_SAFETY_OPERATOR||'').trim(),reason=(process.env.LAMPY_SAFETY_REASON||'').trim();
      if(!operator||!reason)throw Error('Set LAMPY_SAFETY_OPERATOR and LAMPY_SAFETY_REASON for an auditable decision.');
      await reviewSafetyReport(tx,{reportId:id,operator,reason,hide:decision==='restrict',now:new Date().toISOString()});
      return {reportId:id,status:(await tx.findSafetyReport(id)).status};
    });
    process.stdout.write(JSON.stringify(result)+'\n');
  } finally {await db.close();}
})().catch(()=>{process.stderr.write('Safety command failed; check arguments, schema, operator context and database permissions.\n');process.exitCode=1;});
