/* Production three-photo acceptance: no HTML/CSS substitution. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const {strToU8,strFromU8,zipSync}=require('fflate');
const out=process.argv[2];if(!out)throw Error('OUTPUT required');
const previous=Module._extensions['.ts'];Module._extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
try{
 const {albumEpubDocuments,buildAlbumEpub}=require('../src/application/album-epub.ts');
 const app=path.resolve(__dirname,'..'),sizes={window:{width:1200,height:1800},coffee:{width:1400,height:932},flowers:{width:1200,height:1587}};
 const assets=Object.fromEntries(Object.keys(sizes).map(n=>[n,{path:'media/'+n+'.jpg',mime:'image/jpeg',bytes:new Uint8Array(fs.readFileSync(path.join(app,'assets/first-run/'+n+'.jpg')))}]));
 const cases=[{mode:'none',ids:['window','coffee','flowers']},{mode:'circle',ids:['window','coffee','flowers']},{mode:'rect',ids:['window','coffee','flowers']},{mode:'circle',ids:['coffee','window','flowers']},{mode:'rect',ids:['coffee','window','flowers']},{mode:'long',ids:['window','coffee','flowers']}];
 for(const [lang,language]of [['zh','zh-Hans'],['en','en']]){
  const short=lang==='zh'?'平常的日子，\n也值得记住。':'Ordinary days,\nworth keeping.';
  const paragraph=lang==='zh'?'那天没有特别的安排，只是在窗边坐了一会儿。光落在杯子旁边，我们聊着路上的小事，也想把这一刻留住。':'No plans, just an afternoon by the window. We talked for a while and kept a little of this quiet day.';
  const long=lang==='zh'?'午后的光慢慢移过窗台，落在杯子旁边。我们没有安排什么，只想在家里待一会儿。楼下偶尔传来脚步声，远处有车经过，屋子里却一直很安静。\n\n后来一起把植物挪了个位置。那片新长出的叶子比昨天舒展了一些，朝着窗外伸过去。平时总觉得日子过得太快，坐下来才发现，原来这些细小的变化一直都在。\n\n傍晚的光变得柔和，桌上的咖啡已经凉了。我拿起相机，留下眼前这个普通的角落。照片里没有什么特别的事，却有我希望以后还能想起来的生活。':'The afternoon light moved slowly across the windowsill and came to rest beside the cup. We had made no plans. For once, it felt enough to stay home and let the day take its time.\n\nWe moved the plant closer to the window. A new leaf had opened since yesterday, almost too quietly to notice. Sitting there, we began to see the small changes that busy days so often hide.\n\nBy evening the coffee was cold. I picked up the camera and kept this ordinary corner of the room. Nothing remarkable had happened, yet there was something here I wanted to remember.';
  const notes=cases.map(c=>c.mode==='circle'?short:c.mode==='rect'?paragraph:c.mode==='long'?long:'');
  const entries=cases.map((c,i)=>({momentId:'three-'+i,collectedAt:'',sourceRevisionAtCollect:1,presence:'ready',revision:1,note:notes[i],feeling:'平静',occurredAt:'2026-07-01',occurredAtPrecision:'day',recordedAt:'',media:c.ids.map(id=>({assetId:id,role:'image',availability:'available',widthPx:sizes[id].width,heightPx:sizes[id].height,intrinsicRatio:sizes[id].width/sizes[id].height,durationMs:null}))}));
  const options={input:{album:{id:'three-study',schemaVersion:1,name:lang==='zh'?'有光的日子':'Days in the Light',opening:null,cover:{kind:'image',momentId:entries[0].momentId,assetId:'coffee'},entries:[],createdAt:'',updatedAt:''},entries},assets,language,design:'imagebook',id:'three-overlay-study-'+lang,createdAt:'2026-11-25',dates:Object.fromEntries(entries.map(e=>[e.momentId,{label:'2026-07-01',chapter:lang==='zh'?'2026年7月':'July 2026'}]))};
  const docs=albumEpubDocuments(options);for(const a of Object.values(assets))docs['OEBPS/'+a.path]=a.bytes;
  const base=path.resolve(out,lang);for(const [file,v]of Object.entries(docs)){const p=path.join(base,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,v,{flag:'wx'});}
  fs.writeFileSync(path.resolve(out,`Lampy-Chronicle-three-production-${lang}.epub`),buildAlbumEpub(options),{flag:'wx'});
 }
 console.log('THREE_PRODUCTION_OK');
}finally{if(previous)Module._extensions['.ts']=previous;else delete Module._extensions['.ts'];}
