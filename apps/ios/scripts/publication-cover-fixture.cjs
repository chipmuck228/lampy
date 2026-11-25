/* Chronicle cover acceptance fixtures; synthetic records and licensed repository photos only. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const out=path.resolve(process.argv[2]||'');if(!process.argv[2])throw Error('Output directory required');
const previous=Module._extensions['.ts'];
Module._extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
try{
 const {albumEpubDocuments}=require('../src/application/album-epub.ts');
 const media=(id,w,h)=>({assetId:id,role:'image',availability:'available',widthPx:w,heightPx:h,intrinsicRatio:w/h,durationMs:null});
 const entries=[['early','2026-07-01'],['late','2026-11-12']].map(([id,day],i)=>({momentId:id,collectedAt:'',sourceRevisionAtCollect:1,presence:'ready',revision:1,note:'样张记录。',feeling:'',occurredAt:day+'T12:00:00Z',occurredAtPrecision:'day',recordedAt:'',media:[media(i?'coffee':'window',i?1400:1200,i?932:1800)]}));
 const assets={window:{path:'media/window.jpg',mime:'image/jpeg'},coffee:{path:'media/coffee.jpg',mime:'image/jpeg'}};
 const variants=[['selected','平常日子',{kind:'image',momentId:'late',assetId:'coffee'}],['automatic','我们一起走过的日子',{kind:'words'}],['portrait','家里的四季',{kind:'image',momentId:'early',assetId:'window'}],['english','A YEAR TO REMEMBER',{kind:'image',momentId:'late',assetId:'coffee'}],['long-title','愿这些一起走过的普通日子，成为往后慢慢回看的珍藏',{kind:'words'}],['no-photo','我们的第一册',{kind:'words'}]];
 for(const [id,name,cover] of variants){
  const input={album:{id:'synthetic',schemaVersion:1,name,opening:null,cover,entries:[],createdAt:'',updatedAt:''},entries:id==='no-photo'?entries.map(e=>({...e,media:[]})):entries};
  const options={input,assets:id==='no-photo'?{}:assets,id:'cover-'+id,language:'zh-Hans',design:'imagebook',createdAt:'2026-11-24T00:00:00Z',dates:{}};
  const docs=albumEpubDocuments(options),root=path.join(out,id,'OEBPS');fs.mkdirSync(root,{recursive:true});
  for(const file of ['cover.xhtml','style.css','lampy-symbol.svg'])fs.writeFileSync(path.join(root,file),docs['OEBPS/'+file],{flag:'wx'});
  if(id!=='no-photo')for(const asset of Object.values(assets)){const file=path.join(root,asset.path);fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(path.join(__dirname,'../assets/first-run',path.basename(asset.path)),file);}
 }
 console.log('COVER_FIXTURES_OK');
}finally{if(previous)Module._extensions['.ts']=previous;else delete Module._extensions['.ts'];}
