const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { evaluate } = require('./family-public-preflight.cjs');
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lampy-public-preflight-'));
  const db = path.join(root, 'family.sqlite'), media = path.join(root, 'media');
  fs.writeFileSync(db, 'not a real database'); fs.mkdirSync(media);
  return { root, db, media, env: { LAMPY_FAMILY_API_MODE:'production', LAMPY_APPLE_CLIENT_ID:'app.lampy.ios', LAMPY_FAMILY_INVITE_ORIGIN:'https://family.yunpura.com', EXPO_PUBLIC_FAMILY_API_BASE_URL:'https://family.yunpura.com', LAMPY_FAMILY_INVITES_ENABLED:'1', LAMPY_FAMILY_HISTORY_ENABLED:'1', LAMPY_FAMILY_DATABASE_PATH:db, LAMPY_FAMILY_MEDIA_PATH:media, LAMPY_FAMILY_PREFLIGHT_VOLUME_ROOT:root } };
}
test('configuration success never claims real deployment, schema, identity or device acceptance', () => {
 const x=fixture();try { const r=evaluate(x.env);assert.equal(r.configChecksPassed,true);assert.equal(r.publicReady,false);assert.equal(r.identityLoopAccepted,false);assert.ok(r.notVerified.includes('schema26-and-backup-restore'));assert.equal(fs.readFileSync(x.db,'utf8'),'not a real database');assert.equal(fs.readdirSync(x.root).length,2); } finally {fs.rmSync(x.root,{recursive:true});}
});
test('rejects local, placeholder, HTTP, credential-bearing and mismatched origins',()=>{
 const x=fixture();try { for(const u of ['http://family.yunpura.com','https://127.0.0.1','https://[::1]','https://family.local','https://family.example.invalid','https://example.com','https://user:secret@family.yunpura.com','https://family.yunpura.com/invite','https://family.yunpura.com#secret']) assert.equal(evaluate({...x.env,LAMPY_FAMILY_INVITE_ORIGIN:u}).configChecksPassed,false,u);assert.equal(evaluate({...x.env,EXPO_PUBLIC_FAMILY_API_BASE_URL:'https://other.yunpura.com'}).configChecksPassed,false); }finally{fs.rmSync(x.root,{recursive:true});}
});
test('rejects exposed controlled authentication, injected test tokens and nonloopback backend',()=>{
 const x=fixture();try { for(const changed of [{LAMPY_TEST_ACCOUNT_LOGIN:'1'},{LAMPY_CONTROLLED_EMAIL_ACCOUNTS:'true'},{LAMPY_FAMILY_API_TEST_TOKENS:'secret'},{LAMPY_FAMILY_API_HOST:'0.0.0.0'},{LAMPY_APPLE_CLIENT_ID:'wrong'},{LAMPY_FAMILY_API_PORT:'not-a-port'}]) assert.equal(evaluate({...x.env,...changed}).configChecksPassed,false); }finally{fs.rmSync(x.root,{recursive:true});}
});
test('missing storage is not created and sibling or symlink escape is rejected',()=>{
 const x=fixture();const other=fs.mkdtempSync(path.join(os.tmpdir(),'lampy-outside-'));try {const missing=path.join(x.root,'missing.sqlite');assert.equal(evaluate({...x.env,LAMPY_FAMILY_DATABASE_PATH:missing}).configChecksPassed,false);assert.equal(fs.existsSync(missing),false);const outside=path.join(other,'family.sqlite');fs.writeFileSync(outside,'private');fs.symlinkSync(outside,path.join(x.root,'link.sqlite'));assert.equal(evaluate({...x.env,LAMPY_FAMILY_DATABASE_PATH:path.join(x.root,'link.sqlite')}).configChecksPassed,false);assert.equal(evaluate({...x.env,LAMPY_FAMILY_PREFLIGHT_VOLUME_ROOT:other}).configChecksPassed,false);}finally{fs.rmSync(x.root,{recursive:true});fs.rmSync(other,{recursive:true});}
});
test('CLI returns nonzero on missing config and never prints secret values',()=>{
 const r=spawnSync(process.execPath,[require.resolve('./family-public-preflight.cjs')],{env:{LAMPY_FAMILY_API_TEST_TOKENS:'DO_NOT_PRINT_ME'},encoding:'utf8'});assert.equal(r.status,2);assert.ok(!r.stdout.includes('DO_NOT_PRINT_ME'));assert.equal(JSON.parse(r.stdout).kind,'configuration-only');
});
