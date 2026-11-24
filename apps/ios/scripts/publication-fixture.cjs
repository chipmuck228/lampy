/* Synthetic design samples only. Uses the actual pure EPUB projection; no mobile runtime or network. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const output=process.argv[2];if(!output)throw Error('Usage: node scripts/publication-fixture.cjs OUTPUT_DIRECTORY');
const root=path.resolve(__dirname,'..'),out=path.resolve(output);fs.mkdirSync(out,{recursive:true});
const previous=Module._extensions['.ts'];
Module._extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
try {
 const {buildAlbumEpub,albumEpubDocuments}=require('../src/application/album-epub.ts');
 const pictures=[['window',1200,1800],['coffee',1400,932],['flowers',1200,1587]];
 const assets=Object.fromEntries(pictures.map(([name])=>[name,{path:`media/${name}.jpg`,mime:'image/jpeg',bytes:new Uint8Array(fs.readFileSync(path.join(root,`assets/first-run/${name}.jpg`)))}]));
 assets.voice={path:'media/voice.mp3',mime:'audio/mpeg',bytes:new Uint8Array(fs.readFileSync(path.join(root,'spec/life-album-v2/epub-editorial-design/demo.mp3')))};
 const photo=name=>{const [,widthPx,heightPx]=pictures.find(p=>p[0]===name);return {assetId:name,role:'image',availability:'available',intrinsicRatio:widthPx/heightPx,widthPx,heightPx,durationMs:null}};
 const moments=[
  {day:'2026-10-03',note:'窗边的光慢慢移过来，花还在原来的位置。今天没有特别的事，也想把这一刻留住。',media:[photo('window')]},
  {day:'2026-10-14',note:'我们坐了一会儿，咖啡凉了也没关系。',media:[photo('window'),photo('coffee'),photo('coffee')]},
  {day:'2026-10-14',note:'回家路上，记住了风吹过树叶的声音。',media:[]},
  {day:'2026-10-14',note:'晚饭后又一起散了步。',media:[]},
  {day:'2026-10-20',note:'',media:[photo('flowers'),photo('coffee'),photo('window')]},
  {day:'2026-11-02',note:'那些看起来相似的日子，仔细想想，每一天都不一样。',media:[photo('coffee'),photo('flowers'),photo('window')]},
  {day:'2026-11-05',note:'光落在桌面，留下了这个下午。',media:[photo('coffee')]},
  {day:'2026-11-06',note:'两束花，一起带回家。',media:[photo('flowers'),photo('window')]},
  {day:'2026-11-07',note:'这一段安静的时间。',media:[photo('flowers'),photo('window'),photo('flowers')]},
  {day:'2026-11-09',note:'想把这个下午的声音也留下来。',media:[{assetId:'voice',role:'audio',availability:'available',intrinsicRatio:null,durationMs:null}]},
  {day:'2026-11-16',note:('记得那天我们一起把花移到窗边，阳光落在叶子上。谁也没有急着说什么，只是安静地坐着。\n').repeat(16),media:[photo('flowers'),photo('window')]},
  {day:null,note:'已经不记得是哪一天，只记得那时候的心情。',media:[photo('coffee')]},
 ];
 const entries=moments.map((m,i)=>({momentId:'synthetic-'+i,collectedAt:'',sourceRevisionAtCollect:1,presence:'ready',revision:1,note:m.note,attribution:i%2?'小禾':'家人',feeling:'',occurredAt:m.day?m.day+'T12:00:00Z':undefined,occurredAtPrecision:m.day?'day':'unknown',recordedAt:'2026-11-23T00:00:00Z',media:m.media}));
 const input={album:{id:'synthetic-book',schemaVersion:1,name:'平常日子',opening:null,cover:{kind:'words'},entries:[],createdAt:'',updatedAt:''},entries};
 const dates=Object.fromEntries(entries.map(e=>[e.momentId,{label:e.occurredAt?e.occurredAt.slice(0,10):'日子未确认',chapter:e.occurredAt?(e.occurredAt.includes('-10-')?'2026年10月':'2026年11月'):'日子未确认'}]));
 for(const design of ['literary','imagebook']){
  const options={input,assets,language:'zh-Hans',design,id:'synthetic-'+design,createdAt:'2026-11-23T00:00:00Z',dates};
  const filename=path.join(out,`Lampy-${design}-sample.epub`);fs.writeFileSync(filename,buildAlbumEpub(options),{flag:'wx'});
  const dir=path.join(out,design);fs.mkdirSync(dir,{recursive:true});
  for(const [name,bytes]of Object.entries(albumEpubDocuments(options))){const file=path.join(dir,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes,{flag:'wx'});}
  for(const asset of Object.values(assets)){const file=path.join(dir,'OEBPS',asset.path);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,asset.bytes,{flag:'wx'});}
  console.log(JSON.stringify({design,file:filename}));
 }
}finally{if(previous)Module._extensions['.ts']=previous;else delete Module._extensions['.ts'];}
