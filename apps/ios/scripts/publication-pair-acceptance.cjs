/* Production acceptance book: no HTML or CSS substitution.
 * INPUT_DIR: licensed test photographs with their decoded dimensions.json. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const [input,out]=process.argv.slice(2);if(!out)throw Error('INPUT_DIR OUTPUT required');
const previous=Module._extensions['.ts'];Module._extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
try{
 const {albumEpubDocuments,buildAlbumEpub}=require('../src/application/album-epub.ts');
 const dims=JSON.parse(fs.readFileSync(path.join(input,'dimensions.json'),'utf8'));
 const assets=Object.fromEntries(Object.entries(dims).map(([n,s])=>[n,{path:'media/'+s.file,mime:'image/jpeg',bytes:new Uint8Array(fs.readFileSync(path.join(input,s.file)))}]));
 const pairs=[['两张横图',['landscape-a','landscape-b']],['两张竖图',['portrait-a','portrait-b']],['一横一竖',['landscape-a','portrait-b']],['近方形',['square-a','square-b']],['尺寸悬殊',['portrait-a','small']]];
 const cases=pairs.flatMap(([label,ids])=>[{label,ids,mode:'none'},{label,ids,mode:'short'}]);
 cases.push({label:'双图长文字',ids:['portrait-a','landscape-a'],mode:'long'});
 for(const [lang,language]of [['zh','zh-Hans'],['en','en']]){
  const notes=cases.map(c=>c.mode==='short'?(lang==='zh'?'一起走过的日子。\n慢慢留在这一册里。':'The day we shared.\nA little of our time.'):c.mode==='long'?(lang==='zh'?'那天我们没有走得很远，只是沿着熟悉的路慢慢往前。光从树叶之间落下来，照在彼此的肩膀上。\n\n路边的景色总在变化。有时候是新开的花，有时候是窗里的一盏灯。两张照片留下了不同的角度，也留下了同一个下午的心情。\n\n后来回到家，才发现已经走了很久。我们坐在窗边，一起看刚才拍下的照片，聊起路上那些没来得及说的话。\n\n这些看似普通的片刻，让一天有了可以回看的样子。愿以后再翻开时，还能记起当时的声音、光线，还有同行的人。':'We did not travel very far that day. We followed a familiar road, taking our time beneath the trees. A little sunlight moved across our shoulders.\n\nThe view changed as we walked: a new flower, a light in a window, a corner we had never noticed. Two photographs kept different views of the same quiet afternoon.\n\nLater, at home, we sat by the window and looked through the photographs together. We talked about the small things we had passed along the way.\n\nThese ordinary moments gave the day a shape we could return to. I hope these pages keep a little of its light, its voices, and the company we shared.'):'');
  const entries=cases.map((c,i)=>({momentId:'pair-'+i,collectedAt:'',sourceRevisionAtCollect:1,presence:'ready',revision:1,note:notes[i],feeling:['平静','感动','高兴','说不清','疲惫'][Math.floor(i/2)%5],occurredAt:'2026-07-01',occurredAtPrecision:'day',recordedAt:'',media:c.ids.map(n=>({assetId:n,role:'image',availability:'available',widthPx:dims[n].width,heightPx:dims[n].height,intrinsicRatio:dims[n].width/dims[n].height,durationMs:null}))}));
  const options={input:{album:{id:'pair-study',schemaVersion:1,name:lang==='zh'?'一起走过的日子':'The Days We Shared',opening:null,cover:{kind:'image',momentId:entries[0].momentId,assetId:'landscape-a'},entries:[],createdAt:'',updatedAt:''},entries},assets,language,design:'imagebook',id:'pair-production-'+lang,createdAt:'2026-11-25',dates:Object.fromEntries(entries.map(e=>[e.momentId,{label:'2026-07-01',chapter:lang==='zh'?'2026年7月':'July 2026'}]))};
  const docs=albumEpubDocuments(options),base=path.resolve(out,lang);
  for(const [f,v]of Object.entries(docs)){const p=path.join(base,f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,v,{flag:'wx'});}
  for(const a of Object.values(assets)){const p=path.join(base,'OEBPS',a.path);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,a.bytes,{flag:'wx'});}
  fs.writeFileSync(path.resolve(out,`Lampy-Chronicle-pair-acceptance-${lang}.epub`),buildAlbumEpub(options),{flag:'wx'});
  fs.writeFileSync(path.join(base,'sources.json'),JSON.stringify({cases,entries},null,2));
 }
 console.log('PRODUCTION_PAIR_ACCEPTANCE_OK');
}finally{if(previous)Module._extensions['.ts']=previous;else delete Module._extensions['.ts'];}
