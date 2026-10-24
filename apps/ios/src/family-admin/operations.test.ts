import {projectOperations,readOperations} from './operations';
import {mkdtemp,writeFile,rm,symlink,chmod} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
const now=Date.parse('2026-10-23T00:00:00.000Z');
const snapshot=()=>({format:1,generatedAt:new Date(now).toISOString(),units:[{unit:'lampy-family.service',state:'active',secret:'never'}],logs:[{unit:'lampy-family.service',at:new Date(now).toISOString(),event:'SERVICE_ERROR',message:'private token',path:'/secret'}],backup:{event:'BACKUP_COMPLETE',lastSuccess:new Date(now).toISOString(),files:3,bytes:100,secret:'private'},cloudSnapshots:'verified-forged'});
it('returns only allowlisted operations fields and never relays raw logs or a forged cloud verification',()=>{
 const result=projectOperations(snapshot(),now);expect(result.units[0].state).toBe('active');expect(result.logs).toHaveLength(1);expect(result.cloudSnapshots).toBe('NOT_VERIFIED');expect(JSON.stringify(result)).not.toMatch(/secret|private|token|message|path|forged/);
});
it('rejects stale snapshots, future timestamps and unbounded log arrays',()=>{
 expect(()=>projectOperations(snapshot(),now+30001)).toThrow('OPS_UNAVAILABLE');expect(()=>projectOperations(snapshot(),now-60001)).toThrow('OPS_UNAVAILABLE');expect(()=>projectOperations({...snapshot(),logs:new Array(101).fill({})},now)).toThrow();
});
it('does not expose missing, symlinked or writable operational files',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'lampy-ops-reader-'));try{
  const file=path.join(dir,'status.json');expect(await readOperations('',now)).toEqual({enabled:false,available:false});expect(await readOperations(file,now)).toEqual({enabled:true,available:false});
  await writeFile(file,JSON.stringify(snapshot()),{mode:0o600});
  if(process.getuid?.()===0)expect((await readOperations(file,now)).available).toBe(true);
  await symlink(file,path.join(dir,'link'));expect((await readOperations(path.join(dir,'link'),now)).available).toBe(false);
  await chmod(file,0o666);expect((await readOperations(file,now)).available).toBe(false);
 }finally{await rm(dir,{recursive:true,force:true});}
});

it('projects task history without private fields and rejects invalid outcomes or future execution dates',()=>{
 const v=snapshot();v.units.push({unit:'lampy-family-cleanup.service',state:'inactive',secret:'never',lastRun:{at:new Date(now).toISOString(),result:'failed',message:'private'}} as any);
 const result=projectOperations(v,now);expect(result.units[2].lastRun).toEqual({at:new Date(now).toISOString(),result:'failed'});expect(JSON.stringify(result)).not.toContain('private');
 (v.units[1] as any).lastRun.result='pretend-success';expect(projectOperations(v,now).units[2].lastRun).toBeNull();
 (v.units[1] as any).lastRun={at:new Date(now+60001).toISOString(),result:'success'};expect(projectOperations(v,now).units[2].lastRun).toBeNull();
});
