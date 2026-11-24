/* Date opening proofs: synthetic ordered moments; existing licensed coffee image. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const out=path.resolve(process.argv[2]||'');if(!process.argv[2])throw Error('Output directory required');
const previous=Module._extensions['.ts'];Module._extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
try{
 const {albumEpubDocuments,buildAlbumEpub}=require('../src/application/album-epub.ts');
 const image=new Uint8Array(fs.readFileSync(path.join(__dirname,'../assets/first-run/coffee.jpg')));
 const moods=['高兴','平静','感动','疲惫','难过','烦乱','说不清',''];
 const cases=[['2026-07-01',['平静','平静','高兴']],['2026-07-13',['平静','高兴','感动','','疲惫','平静','说不清']],['2026-07-31',Array.from({length:40},(_,i)=>moods[i%moods.length])]];
 for(const [id,language] of [['zh','zh-Hans'],['en','en']]){
  const entries=cases.flatMap(([day,feelings],d)=>feelings.map((feeling,i)=>({momentId:`synthetic-${d}-${i}`,collectedAt:'',sourceRevisionAtCollect:1,presence:'ready',revision:1,note:language==='en'?'A small moment from this day.':'留住这一天的一个片刻。',feeling,occurredAt:day+`T${String(8+Math.floor(i/6)).padStart(2,'0')}:${String(i%6*10).padStart(2,'0')}:00Z`,occurredAtPrecision:'exact',recordedAt:'',media:d===0&&i===0?[{assetId:'coffee',role:'image',availability:'available',intrinsicRatio:1400/932,widthPx:1400,heightPx:932,durationMs:null}]:[]})));
  const options={input:{album:{id:'synthetic',schemaVersion:1,name:language==='en'?'Days in July':'七月的日子',opening:null,cover:{kind:'image',momentId:entries[0].momentId,assetId:'coffee'},entries:[],createdAt:'',updatedAt:''},entries},assets:{coffee:{path:'media/coffee.jpg',mime:'image/jpeg',bytes:image}},id:'dates-'+id,language,design:'imagebook',createdAt:'2026-11-24',dates:Object.fromEntries(entries.map(e=>[e.momentId,{label:e.occurredAt.slice(0,10),chapter:language==='en'?'July 2026':'2026年7月'}]))};
  const root=path.join(out,id);fs.mkdirSync(root,{recursive:true});
  for(const [name,bytes]of Object.entries(albumEpubDocuments(options))){const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes,{flag:'wx'});}
  fs.mkdirSync(path.join(root,'OEBPS/media'),{recursive:true});fs.writeFileSync(path.join(root,'OEBPS/media/coffee.jpg'),image,{flag:'wx'});
  fs.writeFileSync(path.join(out,'Lampy-Chronicle-dates-'+id+'.epub'),buildAlbumEpub(options),{flag:'wx'});
 }
 console.log('DATE_FIXTURES_OK');
}finally{if(previous)Module._extensions['.ts']=previous;else delete Module._extensions['.ts'];}
