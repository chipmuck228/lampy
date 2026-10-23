'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{randomBytes}=require('node:crypto');
async function syncDir(p){const fd=await fs.open(p,'r');try{await fd.sync();}finally{await fd.close();}}
async function jsonWrite(file,value,mode=0o600){const tmp=file+'.tmp-'+randomBytes(6).toString('hex');try{const fd=await fs.open(tmp,'wx',mode);try{await fd.writeFile(JSON.stringify(value)+'\n');await fd.sync();}finally{await fd.close();}await fs.rename(tmp,file);await syncDir(path.dirname(file));}finally{await fs.rm(tmp,{force:true});}}
module.exports={syncDir,jsonWrite};
