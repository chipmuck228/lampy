/* Visual boundary study. ASSET_DIR contains synthetic long screenshot and licensed
 * coffee derivatives plus dimensions.json from decoding those files. No production changes. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const {strToU8,strFromU8,zipSync}=require('fflate');
const [assetDir,output]=process.argv.slice(2);if(!output)throw Error('ASSET_DIR OUTPUT required');
const previous=Module._extensions['.ts'];Module._extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
try{
 const {albumEpubDocuments}=require('../src/application/album-epub.ts');
 const dims=JSON.parse(fs.readFileSync(path.join(assetDir,'dimensions.json'),'utf8'));
 const names=['small','long','panorama','unknown'];
 const colors=['#BACDC0','#829E96','#455F65','#9FBAB0'];
 const assets=Object.fromEntries(names.map(n=>[n,{path:'media/'+dims[n].file,mime:n==='long'?'image/png':'image/jpeg',bytes:new Uint8Array(fs.readFileSync(path.join(assetDir,dims[n].file)))}]));
 const entries=names.map((n,i)=>({momentId:'edge-'+i,collectedAt:'',sourceRevisionAtCollect:1,presence:'ready',revision:1,note:'',feeling:['高兴','平静','难过','感动'][i],occurredAt:'2026-07-01',occurredAtPrecision:'day',recordedAt:'',media:[{assetId:n,role:'image',availability:'available',widthPx:n==='unknown'?null:dims[n].width,heightPx:n==='unknown'?null:dims[n].height,intrinsicRatio:n==='unknown'?null:dims[n].width/dims[n].height,durationMs:null}]}));
 const options={input:{album:{id:'edge-study',schemaVersion:1,name:'日常的不同模样',opening:null,cover:{kind:'image',momentId:'edge-3',assetId:'unknown'},entries:[],createdAt:'',updatedAt:''},entries},assets,language:'zh-Hans',design:'imagebook',id:'edge-study-v1',createdAt:'2026-11-24',dates:Object.fromEntries(entries.map(e=>[e.momentId,{label:'2026-07-01',chapter:'2026年7月'}]))};
 const docs=albumEpubDocuments(options);
 const css='.edge-study{position:absolute;inset:0;background:#faf9f5}.edge-study figure{position:absolute;margin:0}.edge-study figure a,.edge-study figure img{display:block;width:100%;height:100%;object-fit:contain}.edge-binding{position:absolute;left:0;top:0;bottom:0;width:16px}';
 docs['OEBPS/style.css']=strToU8(strFromU8(docs['OEBPS/style.css'])+css);
 const report=[];
 names.forEach((n,i)=>{
  const dim=dims[n],scale=Math.min(1040/dim.width,756/dim.height,2),w=dim.width*scale,h=dim.height*scale;
  if(Math.abs(w/h-dim.width/dim.height)>1e-8||scale>2)throw Error('Unsafe geometry');
  const x=(1200-w)/2,y=(900-h)/2;
  const file=`OEBPS/record-${i+1}.xhtml`,original=strFromU8(docs[file]);
  const body=`<main class="fixed-page"><section class="edge-study"><figure style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><a id="view-${i+1}" href="photo-${i+1}.xhtml" aria-label="查看完整图片"><img src="${assets[n].path}" alt="${n==='long'?'包含六段内容的合成长图':'窗边的日常'}"/></a></figure><span class="edge-binding" style="background:${colors[i]}" aria-hidden="true"></span></section></main>`;
  docs[file]=strToU8(original.replace(/<body[^>]*>[\s\S]*<\/body>/,`<body class="imagebook">${body}</body>`));
  report.push({name:n,source:dim,metadataMissing:n==='unknown',scale,box:{x,y,width:w,height:h}});
 });
 const old=['#C4A06A','#6F8B86','#B0898C','#7A8494'],next=['#BACDC0','#829E96','#9FBAB0','#455F65'];
 for(const f of Object.keys(docs).filter(f=>f.endsWith('.xhtml'))) {let s=strFromU8(docs[f]);old.forEach((c,i)=>{s=s.replaceAll(c,next[i]);});docs[f]=strToU8(s);}
 for(const asset of Object.values(assets))docs['OEBPS/'+asset.path]=asset.bytes;
 const root=path.resolve(output);fs.mkdirSync(root,{recursive:true});
 for(const [f,v]of Object.entries(docs)){const p=path.join(root,'book',f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,v,{flag:'wx'});}
 fs.writeFileSync(path.join(root,'Lampy-Chronicle-image-boundaries.epub'),zipSync(Object.fromEntries(Object.entries(docs).map(([k,v])=>[k,[v,{level:k==='mimetype'?0:6}]]))),{flag:'wx'});
 fs.writeFileSync(path.join(root,'geometry.json'),JSON.stringify(report,null,2));
 console.log('EDGE_STUDY_OK');
}finally{if(previous)Module._extensions['.ts']=previous;else delete Module._extensions['.ts'];}
