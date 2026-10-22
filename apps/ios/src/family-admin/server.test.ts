import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {request as httpRequest} from 'node:http';
import {createFamilyCommands} from '../family-api/commands';
import {createMapAppleVerifier} from '../family-api/apple';
import {openFamilySqliteDatabase} from '../family-api/node-db';
import {applyFamilyApiSchema} from '../family-api/schema';
import {createSqliteFamilyRepository} from '../family-api/sqlite-repository';
import {createDirectoryMediaBlobStore} from '../family-api/media-blobs';
import {sampleAudioBytes,sampleJpegBytes} from '../family-api/media-validate';
import {HISTORY_CONFIRMATION} from '../family-api/history-policy';
import {startFamilyAdmin,adminConfig,type AdminEnv} from './server';
import {hashAdminPassword} from './auth';
import {createAdminService} from './service';
import {runFamilyDataRetention} from '../family-api/data-retention';
import {reviewSafetyReport,restrictReportedAuthor} from '../family-api/safety-commands';

// Production-cost scrypt needs headroom on shared CI hosts.
jest.setTimeout(20000);

let dir:string,server:Awaited<ReturnType<typeof startFamilyAdmin>>,db:ReturnType<typeof openFamilySqliteDatabase>;
const password='dedicated admin test passphrase';let hash:string;
beforeAll(()=>{hash=hashAdminPassword(password);});
afterEach(async()=>{await server?.close();await db?.close();if(dir)await rm(dir,{recursive:true,force:true});});
async function fixture(now?:()=>number){
 dir=await mkdtemp(path.join(tmpdir(),'lampy-admin-'));db=openFamilySqliteDatabase(path.join(dir,'family.sqlite'));await applyFamilyApiSchema(db);
 const repository=createSqliteFamilyRepository(db),blobs=createDirectoryMediaBlobStore(path.join(dir,'media'));
 const commands=createFamilyCommands({repository,mediaBlobs:blobs,apple:createMapAppleVerifier({a:{appleSubject:'a'},b:{appleSubject:'b'}}),historySharingEnabled:true,inviteLinksEnabled:true,familyAlbumsEnabled:true});
 const a=await commands.signInWithApple('a'),b=await commands.signInWithApple('b'),family=await commands.createNamedFamily(a.sessionToken,'Test home','home');
 const invite=await commands.createInviteLink(a.sessionToken,family.familyId);await commands.acceptInviteLink(b.sessionToken,invite.token);
 const photo=await commands.uploadMedia(b.sessionToken,{bytes:sampleJpegBytes(),mimeType:'image/jpeg'});
 const audio=await commands.uploadMedia(b.sessionToken,{bytes:sampleAudioBytes(),mimeType:'audio/mp4'});
 const input={sourceMomentId:'test',sourceRevision:1,note:'<img src=x onerror=alert(1)> private family text',emotion:'',occurredAtPrecision:'unknown',mediaObjectIds:[photo.objectId,audio.objectId],expectedMediaCount:2,audienceConfirmation:HISTORY_CONFIRMATION};
 const share=await commands.historyShares.shareMoment(b.sessionToken,family.familyId,input);
 const report=await commands.safety.report(a.sessionToken,family.familyId,share.shareId,{requestId:'report',reason:'privacy',detail:'<script>alert(1)</script>'});
 const env:AdminEnv={LAMPY_ADMIN_ORIGIN:'https://admin.example.test',LAMPY_ADMIN_USERNAME:'developer',LAMPY_ADMIN_PASSWORD_HASH:hash,LAMPY_FAMILY_DATABASE_PATH:path.join(dir,'family.sqlite'),LAMPY_FAMILY_MEDIA_PATH:path.join(dir,'media')};
 server=await startFamilyAdmin({env,port:0,now});
 return {commands,a,b,family,photo,audio,share,report,input,env};
}
function request(route:string,method='GET',data?:unknown,headers:Record<string,string>={}){
 return new Promise<{status:number;headers:Record<string,unknown>;bytes:Buffer;body:any}>((resolve,reject)=>{
  const req=httpRequest({host:'127.0.0.1',port:server.port,path:route,method,headers:{Host:'admin.example.test',...(data===undefined?{}:{'Content-Type':'application/json',Origin:'https://admin.example.test'}),...headers}},res=>{
   const chunks:Buffer[]=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const bytes=Buffer.concat(chunks);let body;try{body=JSON.parse(bytes.toString());}catch{body=bytes.toString();}resolve({status:res.statusCode!,headers:res.headers,bytes,body});});
  });req.on('error',reject);req.end(data===undefined?undefined:JSON.stringify(data));
 });
}
async function login(){const r=await request('/api/login','POST',{username:'developer',password});expect(r.status).toBe(200);const cookie=(r.headers['set-cookie'] as string[])[0];expect(cookie).toMatch(/Secure; HttpOnly; SameSite=Strict/);return {Cookie:cookie.split(';')[0],'X-CSRF-Token':r.body.csrf};}
it('requires independent authentication, origin and CSRF, and clears sessions on logout',async()=>{
 await fixture();expect((await request('/api/reports')).status).toBe(401);
 expect((await request('/api/login','POST',{username:'developer',password},{Origin:'https://evil.test'})).status).toBe(403);
 const h=await login();expect((await request('/api/reports','GET',undefined,h)).status).toBe(200);
 expect((await request('/api/logout','POST',{}, {Cookie:h.Cookie})).status).toBe(403);
 expect((await request('/api/logout','POST',{},h)).status).toBe(200);
 expect((await request('/api/reports','GET',undefined,h)).status).toBe(401);
 expect((await request('/api/reports','GET',undefined,{...h,Host:'evil.test'})).status).toBe(421);
});
it('lists without bodies, scopes media to a live reported share, supports ranges and never caches content',async()=>{
 const f=await fixture();const h=await login(),base='/api/reports/'+f.report.reportId;
 const list=await request('/api/reports?status=pending','GET',undefined,h);expect(JSON.stringify(list.body)).not.toContain('private family text');
 const detail=await request(base,'GET',undefined,h);expect(detail.body.share.note).toContain('<img');expect(detail.headers['cache-control']).toContain('no-store');
 const media=base+'/media/'+f.photo.objectId;expect((await request(media)).status).toBe(401);
 const bytes=await request(media,'GET',undefined,{...h,Range:'bytes=0-1'});expect(bytes.status).toBe(206);expect(bytes.bytes.length).toBe(2);expect(bytes.headers['content-range']).toMatch(/^bytes 0-1\//);
 const otherBytes=sampleJpegBytes();otherBytes[11]=2;
 const privatePhoto=await f.commands.uploadMedia(f.b.sessionToken,{bytes:otherBytes,mimeType:'image/jpeg'});
 expect(privatePhoto.objectId).not.toBe(f.photo.objectId);
 expect((await request(base+'/media/'+privatePhoto.objectId,'GET',undefined,h)).status).toBe(404);
 const sound=await request(base+'/media/'+f.audio.objectId,'GET',undefined,{...h,Range:'bytes=0-1'});expect(sound.status).toBe(206);expect(sound.headers['content-type']).toBe('audio/mp4');
 expect((await request(base+'/media/med_deadbeef','GET',undefined,h)).status).toBe(404);
 await f.commands.historyShares.revokeShare(f.b.sessionToken,f.family.familyId,f.share.shareId);
 expect((await request(media,'GET',undefined,h)).status).toBe(404);expect((await request(base,'GET',undefined,h)).body.share).toBeNull();
 const audit=await db.getAll<{event:string}>('SELECT event FROM family_admin_audit');expect(audit.map(r=>r.event)).toContain('media');
});
it('requires a reason and current version, reuses live moderation, and preserves existing restriction on keep',async()=>{
 const f=await fixture(),h=await login(),base='/api/reports/'+f.report.reportId;
 let detail=(await request(base,'GET',undefined,h)).body;
 expect((await request(base+'/decision','POST',{action:'restrict',reason:'',version:detail.version},h)).status).toBe(400);
 expect((await request(base+'/decision','POST',{action:'restrict',reason:'confirmed',version:'stale'},h)).status).toBe(409);
 let r=await request(base+'/decision','POST',{action:'restrict-author',reason:'confirmed repeated abuse',version:detail.version},h);expect(r.status).toBe(200);expect(r.body.sharingRestricted).toBe(true);detail=r.body;
 await expect(f.commands.historyShares.shareMoment(f.b.sessionToken,f.family.familyId,{...f.input,sourceMomentId:'other',mediaObjectIds:[],expectedMediaCount:0})).rejects.toMatchObject({code:'SHARING_RESTRICTED'});
 r=await request(base+'/decision','POST',{action:'restrict',reason:'confirmed privacy issue',version:detail.version},h);expect(r.body.hidden).toBe(true);detail=r.body;
 await expect(f.commands.historyShares.getShare(f.a.sessionToken,f.family.familyId,f.share.shareId)).rejects.toMatchObject({code:'FORBIDDEN'});
 r=await request(base+'/decision','POST',{action:'keep',reason:'review complete',version:detail.version},h);expect(r.body.hidden).toBe(true);detail=r.body;
 r=await request(base+'/decision','POST',{action:'release-author',reason:'appeal reviewed',version:detail.version},h);expect(r.body.sharingRestricted).toBe(false);expect(r.body.hidden).toBe(true);
 const history=await request(base+'/history','GET',undefined,h);expect(history.body.events.length).toBe(4);expect(JSON.stringify(history.body)).not.toContain('private family text');
});
it('fails closed on invalid deployment config and rejects unknown routes',async()=>{
 const f=await fixture();expect(()=>adminConfig({...f.env,LAMPY_ADMIN_ORIGIN:'http://admin.example.test'})).toThrow();expect(()=>adminConfig({...f.env,LAMPY_ADMIN_PASSWORD_HASH:'plaintext'})).toThrow();const h=await login();expect((await request('/api/users','GET',undefined,h)).status).toBe(404);
});

it('expires access without background validation extending idle lifetime',async()=>{
 let at=Date.now();const f=await fixture(()=>at),h=await login(),base='/api/reports/'+f.report.reportId;
 at+=29*60000;expect((await request(base+'/validation','GET',undefined,h)).status).toBe(200);
 at+=60000;expect((await request('/api/session','GET',undefined,h)).status).toBe(401);
 expect((await request(base+'/media/'+f.photo.objectId,'GET',undefined,h)).status).toBe(401);
});
it('rolls back a moderation write if its access audit cannot be recorded',async()=>{
 const f=await fixture();let diskFull=false;
 const wrapped={...db,run:async(sql:string,args?:unknown[])=>{if(diskFull&&sql.startsWith('INSERT INTO family_admin_audit'))throw Error('disk full');return db.run(sql,args);}};
 const svc=await createAdminService(wrapped,createDirectoryMediaBlobStore(path.join(dir,'media')),'developer');
 const detail=await svc.read(f.report.reportId);diskFull=true;
 await expect(svc.decide(f.report.reportId,{action:'restrict',reason:'test atomicity',version:detail.version})).rejects.toThrow('disk full');
 expect(await createSqliteFamilyRepository(db).withTransaction(tx=>tx.findModeration(f.share.shareId))).toBeNull();
});

it('does not expose retired media through a deleted account report',async()=>{
 const f=await fixture(),h=await login(),base='/api/reports/'+f.report.reportId;
 await createSqliteFamilyRepository(db).withTransaction(tx=>tx.purgeAccount(f.b.userId));
 expect((await request(base,'GET',undefined,h)).status).toBe(404);
 expect((await request(base+'/media/'+f.photo.objectId,'GET',undefined,h)).status).toBe(404);
});

it('allows only one concurrent password derivation even when request bodies arrive together',async()=>{
 await fixture();const results=await Promise.all(Array.from({length:3},()=>request('/api/login','POST',{username:'developer',password})));
 expect(results.filter(r=>r.status===200)).toHaveLength(1);expect(results.filter(r=>r.status===429)).toHaveLength(2);
});

it('lists and explicitly releases an active author restriction after its report has expired, without restoring hidden content',async()=>{
 const f=await fixture(),h=await login(),repo=createSqliteFamilyRepository(db);
 const old=new Date(Date.now()-100*86400000).toISOString();
 await repo.withTransaction(async tx=>{
  await reviewSafetyReport(tx,{reportId:f.report.reportId,operator:'op',reason:'rule',hide:true,now:old});
  await restrictReportedAuthor(tx,{reportId:f.report.reportId,operator:'op',reason:'rule',restricted:true,now:old});
 });
 expect((await runFamilyDataRetention(db)).resolvedReports).toBe(1);
 expect((await request('/api/reports/'+f.report.reportId,'GET',undefined,h)).status).toBe(404);
 expect((await request('/api/restricted-authors')).status).toBe(401);
 const listed=await request('/api/restricted-authors?page=0','GET',undefined,h);
 expect(listed.body.authors).toHaveLength(1);const author=listed.body.authors[0];expect(author.userId).toBe(f.b.userId);
 expect(JSON.stringify(listed.body)).not.toMatch(/private family text|private record|contentSha256|snapshot/);
 const route='/api/restricted-authors/'+f.b.userId+'/release';
 expect((await request(route,'POST',{reason:'approved',version:author.version},{Cookie:h.Cookie})).status).toBe(403);
 expect((await request(route,'POST',{reason:'',version:author.version},h)).status).toBe(400);
 expect((await request(route,'POST',{reason:'approved',version:'stale'},h)).status).toBe(409);
 expect((await request(route,'POST',{reason:'approved',version:author.version},h)).status).toBe(200);
 expect((await request(route,'POST',{reason:'approved',version:author.version},h)).status).toBe(409);
 await repo.withTransaction(async tx=>{expect((await tx.findSharingRestriction(f.b.userId))?.restricted).toBe(false);expect((await tx.findModeration(f.share.shareId))?.hidden).toBe(true);});
 expect((await request('/api/restricted-authors?page=0','GET',undefined,h)).body.authors).toEqual([]);
 expect((await db.getAll<{event:string}>('SELECT event FROM family_admin_audit')).map(r=>r.event)).toContain('release-author-direct');
});
