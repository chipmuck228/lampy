import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createFamilyCommands} from './commands';
import {createMapAppleVerifier} from './apple';
import {openFamilySqliteDatabase} from './node-db';
import {applyFamilyApiSchema} from './schema';
import {createSqliteFamilyRepository} from './sqlite-repository';
import {createMemoryMediaBlobStore} from './media-blobs';
import {runFamilyCleanup} from './family-cleanup';
import type {EmailCodeSender} from './email-code-types';

it('a delivered code survives service restart, is claimed once across SQLite connections and expired email data is cleaned',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'lampy-email-codes-'));const file=path.join(dir,'accounts.sqlite');
 let db:ReturnType<typeof openFamilySqliteDatabase>|undefined,other:ReturnType<typeof openFamilySqliteDatabase>|undefined;
 const messages:Parameters<EmailCodeSender['send']>[0][]=[];let now=new Date('2026-11-22T00:00:00Z');
 const build=(database:ReturnType<typeof openFamilySqliteDatabase>)=>createFamilyCommands({repository:createSqliteFamilyRepository(database),apple:createMapAppleVerifier({}),publicTestLoginEnabled:true,
  clock:{now:()=>now},emailCode:{secret:'s'.repeat(64),sender:{async send(message){messages.push(message);}}}});
 try {
  db=openFamilySqliteDatabase(file);await applyFamilyApiSchema(db);
  const ticket=await build(db).emailCode.request({email:'user@example.com',intent:'login'});await db.close();db=undefined;
  db=openFamilySqliteDatabase(file);other=openFamilySqliteDatabase(file);
  const input={challengeId:ticket.challengeId,email:'user@example.com',intent:'login' as const,code:messages[0].code};
  const attempts=await Promise.allSettled([build(db).emailCode.verify(input),build(other).emailCode.verify(input)]);
  expect(attempts.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  now=new Date(now.getTime()+60001);await build(db).emailCode.request({email:'user@example.com',intent:'login'});
  expect(await db.getFirst('SELECT COUNT(*) AS n FROM family_email_code_challenges')).toEqual({n:1});
  now=new Date(now.getTime()+300001);await runFamilyCleanup(db,createMemoryMediaBlobStore(),now);
  expect(await db.getFirst('SELECT COUNT(*) AS n FROM family_email_code_challenges')).toEqual({n:0});
 } finally {await db?.close();await other?.close();await rm(dir,{recursive:true,force:true});}
});

it('an older slow delivery never replaces a newer accepted code and global sends obey the configured budget',async()=>{
 const db=openFamilySqliteDatabase(':memory:');await applyFamilyApiSchema(db);
 const messages:Parameters<EmailCodeSender['send']>[0][]=[];let now=new Date('2026-11-22T00:00:00Z');
 let release!:()=>void,started!:()=>void;const began=new Promise<void>(r=>{started=r;}),held=new Promise<void>(r=>{release=r;});
 const command=createFamilyCommands({repository:createSqliteFamilyRepository(db),apple:createMapAppleVerifier({}),clock:{now:()=>now},
  emailCode:{secret:'s'.repeat(64),dailyLimit:2,sender:{async send(message){messages.push(message);if(messages.length===1){started();await held;}}}}});
 try {
  const first=command.emailCode.request({email:'user@example.com',intent:'login'});const failure=expect(first).rejects.toMatchObject({code:'EMAIL_DELIVERY_FAILED'});
  await began;
  const pending=(await db.getFirst<{id:string}>('SELECT id FROM family_email_code_challenges'))!;
  await expect(command.emailCode.verify({email:'user@example.com',intent:'login',challengeId:pending.id,code:messages[0].code})).rejects.toMatchObject({code:'EMAIL_CODE_INVALID'});
  now=new Date(now.getTime()+60001);const newest=await command.emailCode.request({email:'user@example.com',intent:'login'});
  release();await failure;
  await expect(command.emailCode.verify({email:'user@example.com',intent:'login',challengeId:newest.challengeId,code:messages[1].code})).resolves.toHaveProperty('sessionToken');
  await expect(command.emailCode.request({email:'other@example.com',intent:'login'},undefined,'other-peer')).rejects.toMatchObject({code:'RATE_LIMITED'});
  expect(messages).toHaveLength(2);
 } finally {release?.();await db.close();}
});
