const fs=require('node:fs');
const Module=require('node:module');
const ts=require('typescript');
Module._extensions['.ts']=function(module,file){module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},fileName:file}).outputText,file);};
require('../src/family-admin/server.ts').startFamilyAdmin().then(server=>{
 process.stdout.write('{"event":"SERVICE_STARTED"}\n');
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{void server.close().then(()=>process.exit(0),()=>process.exit(1));});
}).catch(()=>{process.stderr.write('Admin startup failed. Check schema 33 or 34, paths, origin and credential configuration.\n');process.exitCode=1;});
