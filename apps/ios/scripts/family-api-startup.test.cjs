'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdtemp,writeFile,rm}=require('node:fs/promises');
const {once}=require('node:events');
const path=require('node:path');
const os=require('node:os');
const net=require('node:net');

async function freePort(){
  const server=net.createServer();
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const port=server.address().port;
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  return port;
}

for(const enabled of [false,true]){
  test('real Node API starts without mobile modules; email enabled='+enabled,{timeout:30000},async()=>{
    const dir=await mkdtemp(path.join(os.tmpdir(),'lampy-api-start-'));
    let child,exited;
    try{
      const guard=path.join(dir,'no-mobile.cjs');
      await writeFile(guard,"const Module=require('node:module');\nconst load=Module._load;\nModule._load=function(request,...args){\n  if(/^(react-native(?:\\/|$)|expo(?:-|\\/|$)|@expo\\/)/.test(request))throw new Error('Server imported mobile module: '+request);\n  return load.call(this,request,...args);\n};");
      const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('LAMPY_')&&!key.startsWith('EXPO_PUBLIC_')&&key!=='NODE_OPTIONS'));
      const port=await freePort();
      Object.assign(env,{
        LAMPY_FAMILY_API_MODE:'production',LAMPY_FAMILY_API_HOST:'127.0.0.1',
        LAMPY_FAMILY_API_PORT:String(port),LAMPY_FAMILY_DATABASE_PATH:path.join(dir,'family.sqlite'),
        LAMPY_FAMILY_MEDIA_PATH:path.join(dir,'media'),LAMPY_APPLE_CLIENT_ID:'test.lampy.node-smoke',
        LAMPY_FAMILY_INVITES_ENABLED:'1',LAMPY_FAMILY_INVITE_ORIGIN:'https://family.example.com',
        LAMPY_EMAIL_CODE_ENABLED:enabled?'1':'0',LAMPY_EMAIL_CODE_SECRET:'s'.repeat(64),
        LAMPY_SMTP_HOST:'smtp.example.com',LAMPY_SMTP_PORT:'465',LAMPY_SMTP_USER:'resend',
        LAMPY_SMTP_PASSWORD:'test-only-not-a-real-key',LAMPY_EMAIL_FROM:'accounts@example.com',
      });
      child=spawn(process.execPath,['--require',guard,path.join(__dirname,'family-api.cjs')],{env,stdio:['ignore','pipe','pipe']});
      exited=once(child,'exit');
      let output='';
      for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output=(output+chunk).slice(-16000);});
      let health;
      const deadline=Date.now()+15000;
      while(Date.now()<deadline){
        assert.equal(child.exitCode,null,output);
        if(output.includes('SERVICE_STARTED')){
          const response=await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(2000)});
          assert.equal(response.status,200,output);health=await response.json();break;
        }
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      assert.ok(health,'API did not start: '+output);
      assert.equal(health.ok,true);
      assert.equal(health.emailCodeLogin,enabled);
      assert.ok(!output.includes('Server imported mobile module:'),output);
      // No auth/send endpoint is called: SMTP is configured but no email is sent.
    }finally{
      if(child&&child.exitCode===null){
        child.kill('SIGTERM');
        const timer=setTimeout(()=>child.kill('SIGKILL'),3000);
        try{await exited;}finally{clearTimeout(timer);}
      }
      await rm(dir,{recursive:true,force:true});
    }
  });
}
