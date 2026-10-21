// Interactive only: never accept a password on argv or print it to stdout.
const {randomBytes,scryptSync}=require('node:crypto');
const {StringDecoder}=require('node:string_decoder');
if(!process.stdin.isTTY){process.stderr.write('Run in an interactive terminal.\n');process.exit(1);}
async function secret(prompt){
 process.stderr.write(prompt);process.stdin.setRawMode(true);process.stdin.resume();
 return new Promise((resolve,reject)=>{let value='';const decoder=new StringDecoder('utf8');const done=error=>{process.stdin.off('data',data);process.stdin.setRawMode(false);process.stdin.pause();process.stderr.write('\n');error?reject(error):resolve(value);};
 const data=chunk=>{for(const char of decoder.write(chunk)){if(char==='\u0003'){done(Error('Cancelled'));return;}if(char==='\r'||char==='\n'){done();return;}if(char==='\u007f'||char==='\b'){value=Array.from(value).slice(0,-1).join('');}else if(char>=' ')value+=char;if(value.length>256){done(Error('Too long'));return;}}};process.stdin.on('data',data);});
}
(async()=>{const password=await secret('New admin password (16–256 characters, hidden): '),confirm=await secret('Repeat password: ');
 if(password!==confirm||Array.from(password).length<16||password.length>256)throw Error('Passwords must match and contain 16–256 characters.');
 const salt=randomBytes(16),hash=scryptSync(password,salt,32,{N:131072,r:8,p:1,maxmem:256*1024*1024});
 process.stdout.write(`LAMPY_ADMIN_PASSWORD_HASH=scrypt$131072$8$1$${salt.toString('hex')}$${hash.toString('hex')}\n`);
})().catch(()=>{process.stderr.write('Password setup cancelled or invalid.\n');process.exitCode=1;});
