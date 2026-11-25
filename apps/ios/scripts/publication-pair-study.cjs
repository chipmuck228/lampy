/* Candidate proof only. Production cover/preface/date retained, pair pages replaced.
 * INPUT_DIR: licensed test photographs with their decoded dimensions.json. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const {strToU8,strFromU8,zipSync}=require('fflate');const {planPair}=require('./publication-pair-plan.cjs');
const [input,out]=process.argv.slice(2);if(!out)throw Error('INPUT_DIR OUTPUT required');
const previous=Module._extensions['.ts'];Module._extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
try{
 const {albumEpubDocuments,epubEscape:esc}=require('../src/application/album-epub.ts');
 const {chronicleLines,chronicleProsePages,chronicleProseBody,chronicleBinding}=require('../src/application/album-chronicle-single.ts');
 const dims=JSON.parse(fs.readFileSync(path.join(input,'dimensions.json'),'utf8'));
 const assets=Object.fromEntries(Object.entries(dims).map(([n,s])=>[n,{path:'media/'+s.file,mime:'image/jpeg',bytes:new Uint8Array(fs.readFileSync(path.join(input,s.file)))}]));
 const pairs=[['两张横图',['landscape-a','landscape-b']],['两张竖图',['portrait-a','portrait-b']],['一横一竖',['landscape-a','portrait-b']],['近方形',['square-a','square-b']],['尺寸悬殊',['portrait-a','small']]];
 const cases=pairs.flatMap(([label,ids])=>[{label,ids,mode:'none'},{label,ids,mode:'short'}]);
 cases.push({label:'双图长文字',ids:['portrait-a','landscape-a'],mode:'long'});
 const css=`.pair-study{position:absolute;inset:0;background:#faf9f5;color:#303a37;font-family:"Songti SC","Noto Serif CJK SC",Baskerville,Georgia,serif}.pair-study:lang(en){font-family:Baskerville,"Palatino Linotype",Georgia,serif}.pair-photo{position:absolute;margin:0}.pair-photo img{object-fit:contain}.pair-copy{position:absolute;display:flex;align-items:center}.pair-copy>div{width:100%;white-space:pre-wrap;overflow-wrap:anywhere;font-size:29px;line-height:1.85;letter-spacing:.025em}`;
 const style=b=>`left:${b.x}px;top:${b.y}px;width:${b.width}px;height:${b.height}px`;
 for(const [lang,language]of [['zh','zh-Hans'],['en','en']]){
  const notes=cases.map(c=>c.mode==='short'?(lang==='zh'?'想留下这段同行的时光。\n还有路上看见的风景。':'The day we shared.\nA little of our time.'):c.mode==='long'?(lang==='zh'?'那天我们没有走得很远，只是沿着熟悉的路慢慢往前。光从树叶之间落下来，照在彼此的肩膀上。\n\n路边的景色总在变化。有时候是新开的花，有时候是窗里的一盏灯。两张照片留下了不同的角度，也留下了同一个下午的心情。\n\n后来回到家，才发现已经走了很久。我们坐在窗边，一起看刚才拍下的照片，聊起路上那些没来得及说的话。\n\n这些看似普通的片刻，让一天有了可以回看的样子。愿以后再翻开时，还能记起当时的声音、光线，还有同行的人。':'We did not travel very far that day. We followed a familiar road, taking our time beneath the trees. A little sunlight moved across our shoulders.\n\nThe view changed as we walked: a new flower, a light in a window, a corner we had never noticed. Two photographs kept different views of the same quiet afternoon.\n\nLater, at home, we sat by the window and looked through the photographs together. We talked about the small things we had passed along the way.\n\nThese ordinary moments gave the day a shape we could return to. I hope these pages keep a little of its light, its voices, and the company we shared.'):'');
  const entries=cases.map((c,i)=>({momentId:'pair-'+i,collectedAt:'',sourceRevisionAtCollect:1,presence:'ready',revision:1,note:'',feeling:['平静','感动','高兴','说不清','疲惫'][Math.floor(i/2)%5],occurredAt:'2026-07-01',occurredAtPrecision:'day',recordedAt:'',media:c.ids.map(n=>({assetId:n,role:'image',availability:'available',widthPx:dims[n].width,heightPx:dims[n].height,intrinsicRatio:dims[n].width/dims[n].height,durationMs:null}))}));
  const options={input:{album:{id:'pair-study',schemaVersion:1,name:lang==='zh'?'一起走过的日子':'The Days We Shared',opening:null,cover:{kind:'image',momentId:entries[0].momentId,assetId:'landscape-a'},entries:[],createdAt:'',updatedAt:''},entries},assets,language,design:'imagebook',id:'pair-study-'+lang,createdAt:'2026-11-25',dates:Object.fromEntries(entries.map(e=>[e.momentId,{label:'2026-07-01',chapter:lang==='zh'?'2026年7月':'July 2026'}]))};
  const docs=albumEpubDocuments(options);docs['OEBPS/style.css']=strToU8(strFromU8(docs['OEBPS/style.css'])+css);let opf=strFromU8(docs['OEBPS/package.opf']);const report=[];
  cases.forEach((c,i)=>{
   const sizes=c.ids.map(n=>dims[n]),note=notes[i],record=entries[i],name='record-'+(i+1),file='OEBPS/'+name+'.xhtml',original=strFromU8(docs[file]);
   const fits=(text,b)=>chronicleLines(text,Math.floor(b.width/29))<=Math.floor(b.height/(29*1.85));
   const plan=planPair(sizes,c.mode==='short'?note:'',fits);
   const wrap=body=>`<main class="fixed-page"><section class="pair-study" lang="${language}">${body}${chronicleBinding(record.feeling,esc)}</section></main>`;
   const document=body=>original.replace(/<body[^>]*>[\s\S]*<\/body>/,`<body class="imagebook">${body}</body>`);
   const photo=(k,b)=>`<figure class="pair-photo" style="${style(b)}"><a class="photo-link" id="view-${i*2+k+1}" href="photo-${i*2+k+1}.xhtml" aria-label="${lang==='zh'?'查看完整图片':'View full photograph'}"><img src="${assets[c.ids[k]].path}" alt="${lang==='zh'?'生活中的一个片刻':'An ordinary moment'}"/></a></figure>`;
   for(let k=0;k<2;k++){
    const b=plan.photos[k],s=sizes[k];if(![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.x<80-.01||b.y<72-.01||b.x+b.width>1120.01||b.y+b.height>828.01||Math.abs(b.width/b.height-s.width/s.height)>1e-8||b.width/s.width>2.001)throw Error('Unsafe pair geometry');
   }
   const overlaps=(a,b)=>Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x)+.01&&Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y)+.01;
   if(plan.kind!=='separate'&&(overlaps(...plan.photos)||plan.text&&plan.photos.some(b=>overlaps(b,plan.text))))throw Error('Overlapping pair regions');
   let body=photo(0,plan.photos[0]);if(plan.kind!=='separate')body+=photo(1,plan.photos[1]);
   if(plan.text)body+=`<div class="pair-copy" style="${style(plan.text)}"><div class="fixed-prose">${esc(note)}</div></div>`;
   docs[file]=strToU8(document(wrap(body)));let items='',refs='',leaf=1;const nextPages=[];
   const append=(body,label)=>{const next=name+'-'+(++leaf);docs['OEBPS/'+next+'.xhtml']=strToU8(document(body));items+=`<item id="${next}" href="${next}.xhtml" media-type="application/xhtml+xml"/>`;refs+=`<itemref idref="${next}"/>`;nextPages.push({name:next,label});return next;};
   if(plan.kind==='separate'){
    const next=append(wrap(photo(1,plan.photos[1])),'第二张照片');
    const full='OEBPS/photo-'+(i*2+2)+'.xhtml';docs[full]=strToU8(strFromU8(docs[full]).replace(name+'.xhtml#',next+'.xhtml#'));
   }
   if(note&&!plan.text)chronicleProsePages(note).forEach((chunk,j)=>append(chronicleProseBody(chunk,record,j,language,esc),'文字页'));
   if(items)opf=opf.replace('</manifest>',items+'</manifest>').replace(`<itemref idref="${name}"/>`,`<itemref idref="${name}"/>`+refs);
   report.push({name,label:c.label,mode:c.mode,plan,sourceSizes:sizes,note,nextPages});
  });
  docs['OEBPS/package.opf']=strToU8(opf);for(const a of Object.values(assets))docs['OEBPS/'+a.path]=a.bytes;
  const base=path.resolve(out,lang);for(const [f,v]of Object.entries(docs)){const p=path.join(base,f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,v,{flag:'wx'});}
  fs.writeFileSync(path.resolve(out,`Lampy-Chronicle-two-photo-${lang}.epub`),zipSync(Object.fromEntries(Object.entries(docs).map(([k,v])=>[k,[v,{level:k==='mimetype'?0:6}]]))),{flag:'wx'});
  fs.writeFileSync(path.join(base,'pair-plans.json'),JSON.stringify(report,null,2));
 }
 console.log('PAIR_STUDY_OK');
}finally{if(previous)Module._extensions['.ts']=previous;else delete Module._extensions['.ts'];}
