import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { openFamilySqliteDatabase } from './node-db';
import { applyFamilyApiSchema } from './schema';
import { createSqliteFamilyRepository } from './sqlite-repository';
it('host CLI lists minimal receipts, inspects explicitly and requires operator context for audited decisions',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'lampy-safety-cli-')),file=path.join(dir,'db');const db=openFamilySqliteDatabase(file);
 try {
  await applyFamilyApiSchema(db);await createSqliteFamilyRepository(db).withTransaction(async tx=>{await tx.saveAccount({userId:'b',appleSubject:'b',createdAt:new Date().toISOString()});await tx.saveSafetyReport({reportId:'report_test',reporterUserId:'a',authorUserId:'b',familyId:'f',shareId:'s',reason:'privacy',detail:'sensitive user explanation',createdAt:new Date().toISOString(),status:'pending'});});
  await db.close();
  const run=(args:string[],extra:Record<string,string>={})=>spawnSync(process.execPath,[path.resolve('scripts/family-api-safety.cjs'),...args],{encoding:'utf8',env:{...process.env,LAMPY_FAMILY_DATABASE_PATH:file,LAMPY_SAFETY_OPERATOR:'',LAMPY_SAFETY_REASON:'',...extra}});
  const list=run(['list']);expect(list.status).toBe(0);expect(list.stdout).toContain('report_test');expect(list.stdout).not.toContain('sensitive user explanation');expect(list.stdout).not.toContain('reporterUserId');
  const inspect=run(['inspect','report_test']);expect(inspect.status).toBe(0);expect(JSON.parse(inspect.stdout).report.detail).toBe('sensitive user explanation');
  expect(run(['review','report_test','keep']).status).toBe(1);
  const reviewed=run(['review','report_test','keep'],{LAMPY_SAFETY_OPERATOR:'operator',LAMPY_SAFETY_REASON:'checked'});expect(reviewed.status).toBe(0);expect(JSON.parse(reviewed.stdout).status).toBe('reviewed');
  expect(run(['author','report_test','restrict']).status).toBe(1);
  const ctx={LAMPY_SAFETY_OPERATOR:'developer',LAMPY_SAFETY_REASON:'confirmed repeated abuse'};
  expect(JSON.parse(run(['author','report_test','restrict'],ctx).stdout).sharingRestricted).toBe(true);
  expect(JSON.parse(run(['author','report_test','keep'],ctx).stdout).sharingRestricted).toBe(false);
  const reopened=openFamilySqliteDatabase(file);try{expect((await reopened.getAll('SELECT * FROM family_moderation_audit')).length).toBe(1);expect((await reopened.getAll('SELECT * FROM family_sharing_restriction_audit')).length).toBe(2);}finally{await reopened.close();}
 } finally {try{await db.close();}catch{}rmSync(dir,{recursive:true,force:true});}
});
