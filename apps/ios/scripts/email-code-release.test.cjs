'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const cwd=path.join(__dirname,'..');
function run(env={}){return JSON.parse(execFileSync('bash',['-c',`set -e; source scripts/release-public-env.sh; source scripts/email-code-release-env.sh; node -e 'console.log(JSON.stringify({flag:process.env.EXPO_PUBLIC_EMAIL_CODE_LOGIN_ENABLED,base:process.env.EXPO_PUBLIC_ACCOUNT_API_BASE_URL,family:process.env.EXPO_PUBLIC_FAMILY_ENTRY_OPEN,paid:process.env.EXPO_PUBLIC_UNIFIED_PURCHASES}))'`],{cwd,env:{...process.env,LAMPY_EMAIL_CODE_RELEASE_URL:'',...env},encoding:'utf8',stdio:['ignore','pipe','pipe']}));}
test('a release clears inherited email flags and does not open family/purchases',()=>{
 assert.deepEqual(run({EXPO_PUBLIC_EMAIL_CODE_LOGIN_ENABLED:'1',EXPO_PUBLIC_ACCOUNT_API_BASE_URL:'https://leftover.example.com'}),{flag:'0',base:'',family:'',paid:'0'});
});
test('email release requires an explicit HTTPS URL and does not open other features',()=>{
 assert.deepEqual(run({LAMPY_EMAIL_CODE_RELEASE_URL:'https://accounts.example.com/'}),{flag:'1',base:'https://accounts.example.com',family:'',paid:'0'});
 for(const url of ['http://example.com','https://user:secret@example.com','https://example.com/?token=secret'])assert.throws(()=>run({LAMPY_EMAIL_CODE_RELEASE_URL:url}));
});
test('an existing iOS family profile cannot silently use another account backend',()=>{
 assert.throws(()=>execFileSync('bash',['-c','set -e; source scripts/release-public-env.sh; source scripts/appstore-v1-env.sh; source scripts/email-code-release-env.sh'],{cwd,env:{...process.env,LAMPY_EMAIL_CODE_RELEASE_URL:'https://different.example.com'},stdio:'pipe'}));
});
