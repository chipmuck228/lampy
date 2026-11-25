/* Acceptance book uses the production projection directly. No XHTML/CSS replacement.
 * Optional edge fixtures: python3 scripts/publication-edge-assets.py NEW_ASSET_DIR. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const [out,edgeDir]=process.argv.slice(2);if(!out||!edgeDir)throw Error('OUTPUT EDGE_ASSET_DIR required');
const previous=Module._extensions['.ts'];Module._extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
try{
 const {albumEpubDocuments,buildAlbumEpub}=require('../src/application/album-epub.ts');
 const app=path.resolve(__dirname,'..'),root=path.resolve(out),edge=JSON.parse(fs.readFileSync(path.join(edgeDir,'dimensions.json'),'utf8'));
 const sizes={coffee:{width:1400,height:932,file:'coffee.jpg'},window:{width:1200,height:1800,file:'window.jpg'},...edge};
 const assets=Object.fromEntries(Object.entries(sizes).map(([id,s])=>[id,{path:'media/'+s.file,mime:s.file.endsWith('.png')?'image/png':'image/jpeg',bytes:new Uint8Array(fs.readFileSync(path.join(id==='coffee'||id==='window'?path.join(app,'assets/first-run'):edgeDir,s.file)))}]));
 assets.voice={path:'media/voice.mp3',mime:'audio/mpeg',bytes:new Uint8Array(fs.readFileSync(path.join(app,'spec/life-album-v2/epub-editorial-design/demo.mp3')))};
 const zh=['午后的光慢慢移过窗台，落在杯子旁边。我们没有安排什么，只想在家里待一会儿。楼下偶尔传来脚步声，远处有车经过，屋子里却一直很安静。','后来一起把植物挪了个位置。那片新长出的叶子比昨天舒展了一些，朝着窗外伸过去。平时总觉得日子过得太快，坐下来才发现，原来这些细小的变化一直都在。','我们聊起以前住过的地方，也聊起下一次想去哪里。好多事情已经记不清了，却还记得那时候一起吃饭、一起走路的样子。说到有趣的地方，两个人又笑了起来。','傍晚的光变得柔和，桌上的咖啡已经凉了。我拿起相机，留下眼前这个普通的角落。照片里没有什么特别的事，却有我希望以后还能想起来的生活。','晚上收拾桌子时，又看见杯沿那一点淡淡的痕迹。今天就这样过去了，平常、缓慢，也很完整。想把它留在这里，等往后某一天，再翻回来看看。'].join('\n\n');
 const en=['The afternoon light moved slowly across the windowsill and came to rest beside the cup. We had made no plans. For once, it felt enough to stay home and let the day take its time.','We moved the plant closer to the window. A new leaf had opened since yesterday, almost too quietly to notice. Sitting there, we began to see the small changes that busy days so often hide.','We talked about places we had lived and roads we might travel next. Some details had faded, but we still remembered the meals, the walks, and the way we laughed together.','By evening the coffee was cold. I picked up the camera and kept this ordinary corner of the room. Nothing remarkable had happened, yet there was something here I wanted to remember.','Later, while clearing the table, I noticed a pale mark along the rim of the cup. The day had passed quietly. I wanted to keep a little of it here, to return to another time.'].join('\n\n');
 const cases=[['coffee','none'],['window','none'],['coffee','short'],['window','short'],['coffee','long'],['window','long'],['small','none'],['long','short'],['panorama','none'],['unknown','short'],['coffee','audio']];
 const moods=['高兴','平静','感动','疲惫','难过','烦乱','高兴','平静','难过','说不清','感动'];
 for(const [lang,language]of [['zh','zh-Hans'],['en','en']]){
  const entries=cases.map(([id,kind],i)=>{const s=sizes[id];return {momentId:'acceptance-'+i,collectedAt:'',sourceRevisionAtCollect:1,presence:'ready',revision:1,note:kind==='long'?(lang==='zh'?zh:en):kind==='short'||kind==='audio'?(lang==='zh'?'我们坐了一会儿，咖啡凉了也没关系。\n窗边的光，刚好留住这个下午。':'We sat for a while. The coffee could wait.\nThe window held a little of the afternoon.'):'',feeling:moods[i],occurredAt:i<6?'2026-07-01':i<10?'2026-07-02':'2026-07-03',occurredAtPrecision:'day',recordedAt:'',media:[{assetId:id,role:'image',availability:'available',widthPx:id==='unknown'?undefined:s.width,heightPx:id==='unknown'?undefined:s.height,intrinsicRatio:id==='unknown'?null:s.width/s.height,durationMs:null},...(kind==='audio'?[{assetId:'voice',role:'audio',availability:'available',intrinsicRatio:null,durationMs:5000}]:[])]};});
  // Mirrors album-epub-files: prepared/decoded dimensions override absent/stale source metadata.
  // Native preparation itself is verified separately on iOS; these fixture bytes stay on disk.
  const prepared=entries.map(e=>({...e,media:e.media.map(m=>m.role==='image'?{...m,widthPx:sizes[m.assetId].width,heightPx:sizes[m.assetId].height,intrinsicRatio:sizes[m.assetId].width/sizes[m.assetId].height}:m)}));
  const options={input:{album:{id:'acceptance',schemaVersion:1,name:lang==='zh'?'慢下来的日子':'The Unhurried Days',opening:null,cover:{kind:'image',momentId:entries[0].momentId,assetId:'coffee'},entries:[],createdAt:'',updatedAt:''},entries:prepared},assets,language,design:'imagebook',id:'chronicle-acceptance-'+lang,createdAt:'2026-11-24',dates:Object.fromEntries(entries.map(e=>[e.momentId,{label:e.occurredAt,chapter:lang==='zh'?'2026年7月':'July 2026'}]))};
  const docs=albumEpubDocuments(options),base=path.join(root,lang);
  for(const [file,v]of Object.entries(docs)){const p=path.join(base,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,v,{flag:'wx'});}
  for(const a of Object.values(assets)){const p=path.join(base,'OEBPS',a.path);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,a.bytes,{flag:'wx'});}
  fs.writeFileSync(path.join(root,`Lampy-Chronicle-acceptance-${lang}.epub`),buildAlbumEpub(options),{flag:'wx'});
  fs.writeFileSync(path.join(base,'sources.json'),JSON.stringify({cases,sourceEntries:entries,projectedEntries:prepared},null,2));
 }
 console.log('PRODUCTION_ACCEPTANCE_OK');
}finally{if(previous)Module._extensions['.ts']=previous;else delete Module._extensions['.ts'];}
