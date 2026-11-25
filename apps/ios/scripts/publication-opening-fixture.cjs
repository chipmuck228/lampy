/* Chronicle editorial opening proofs; synthetic writing and repository coffee photograph. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const out=path.resolve(process.argv[2]||'');if(!process.argv[2])throw Error('Output directory required');
const previous=Module._extensions['.ts'];Module._extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
try{
 const {albumEpubDocuments,buildAlbumEpub}=require('../src/application/album-epub.ts');
 const image=new Uint8Array(fs.readFileSync(path.join(__dirname,'../assets/first-run/coffee.jpg')));
 const variants=[['zh-default','zh-Hans','平常日子',null],['en-default','en','Ordinary Days',null],['zh-custom','zh-Hans','写给往后的我们','这一册，留给往后的我们。\n\n有一起走过的路，也有安静待在家里的下午。愿再翻开时，我们仍能想起那时的光、声音，还有彼此。'],['en-custom','en','The Days We Shared','For our future selves.\n\nThe roads we travelled, the afternoons at home, and the familiar voices we never thought to miss. May these pages bring a little of it back.'],['zh-long','zh-Hans','慢慢重温','一起走过的日子，有时安静，有时热闹。\n每一个看似平常的片刻，都值得留下来。\n'.repeat(20)],['en-long','en','A Little of Today','The light moved across the window. We sat for a while, listening to the familiar sounds of home.\nKeep these ordinary days, and come back to them when you wish.\n'.repeat(15)]];
 for(const [id,language,name,opening] of variants){
  const record={momentId:'one',collectedAt:'',sourceRevisionAtCollect:1,presence:'ready',revision:1,note:language==='en'?'An ordinary afternoon.':'一个平常的下午。',feeling:'',occurredAt:'2026-07-01',occurredAtPrecision:'day',recordedAt:'',media:[{assetId:'coffee',role:'image',availability:'available',intrinsicRatio:1400/932,widthPx:1400,heightPx:932,durationMs:null}]};
  const options={input:{album:{id:'synthetic',schemaVersion:1,name,opening,cover:{kind:'image',momentId:'one',assetId:'coffee'},entries:[],createdAt:'',updatedAt:''},entries:[record]},assets:{coffee:{path:'media/coffee.jpg',mime:'image/jpeg',bytes:image}},id:'opening-'+id,language,design:'imagebook',createdAt:'2026-11-24',dates:{}};
  const docs=albumEpubDocuments(options),root=path.join(out,id);fs.mkdirSync(root,{recursive:true});
  for(const [name,bytes] of Object.entries(docs)){const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes,{flag:'wx'});}
  fs.mkdirSync(path.join(root,'OEBPS/media'),{recursive:true});fs.writeFileSync(path.join(root,'OEBPS/media/coffee.jpg'),image,{flag:'wx'});
  if(id==='zh-default'||id==='en-default')fs.writeFileSync(path.join(out,'Lampy-Chronicle-'+id+'.epub'),buildAlbumEpub(options),{flag:'wx'});
 }
 console.log('OPENING_FIXTURES_OK');
}finally{if(previous)Module._extensions['.ts']=previous;else delete Module._extensions['.ts'];}
