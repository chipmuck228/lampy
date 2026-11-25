/* Three-photo visual study only. Source photos remain unmodified. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const {strToU8,strFromU8,zipSync}=require('fflate');
const out=process.argv[2];if(!out)throw Error('OUTPUT required');
const previous=Module._extensions['.ts'];Module._extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const gap=10,box=(x,y,width,height)=>({x,y,width,height});
function wall(s){
 const rs=s.map(p=>p.width/p.height),b=box(64,64,1072,772),candidates=[];
 const rowH=Math.min(b.height,(b.width-2*gap)/rs.reduce((a,r)=>a+r,0));let x=b.x+(b.width-rowH*rs.reduce((a,r)=>a+r,0)-2*gap)/2;
 candidates.push(rs.map(r=>{const p=box(x,b.y+(b.height-rowH)/2,rowH*r,rowH);x+=p.width+gap;return p;}));
 const inv=1/rs[1]+1/rs[2],h=Math.min(b.height,(b.width-gap+gap/inv)/(rs[0]+1/inv)),left=h*rs[0],right=(h-gap)/inv;
 x=b.x+(b.width-left-gap-right)/2;let y=b.y+(b.height-h)/2;
 candidates.push([box(x,y,left,h),box(x+left+gap,y,right,right/rs[1]),box(x+left+gap,y+right/rs[1]+gap,right,right/rs[2])]);
 const sum=rs[1]+rs[2],w=Math.min(b.width,(b.height-gap+gap/sum)/(1/rs[0]+1/sum)),top=w/rs[0],bottom=(w-gap)/sum;
 x=b.x+(b.width-w)/2;y=b.y+(b.height-top-gap-bottom)/2;
 candidates.push([box(x,y,w,top),box(x,y+top+gap,bottom*rs[1],bottom),box(x+bottom*rs[1]+gap,y+top+gap,bottom*rs[2],bottom)]);
 const score=p=>{const a=p.map(p=>p.width*p.height);return .5*a.reduce((a,n)=>a+n,0)+.5*Math.min(...a)*3;};
 candidates.sort((a,b)=>score(b)-score(a));const photos=candidates[0];
 for(let i=0;i<3;i++){
  const p=photos[i];if(p.x<63.99||p.y<63.99||p.x+p.width>1136.01||p.y+p.height>836.01||Math.abs(p.width/p.height-rs[i])>1e-8||p.width/s[i].width>2.001)throw Error('Unsafe wall geometry');
 }
 return photos;
}
const style=b=>`left:${b.x}px;top:${b.y}px;width:${b.width}px;height:${b.height}px`;
try{
 const {albumEpubDocuments,epubEscape:esc}=require('../src/application/album-epub.ts');
 const {chronicleBinding,chronicleProseBody,chronicleProsePages}=require('../src/application/album-chronicle-single.ts');
 const app=path.resolve(__dirname,'..'),sizes={window:{width:1200,height:1800},coffee:{width:1400,height:932},flowers:{width:1200,height:1587}};
 const assets=Object.fromEntries(Object.keys(sizes).map(n=>[n,{path:'media/'+n+'.jpg',mime:'image/jpeg',bytes:new Uint8Array(fs.readFileSync(path.join(app,'assets/first-run/'+n+'.jpg')))}]));
 const cases=[{mode:'none',ids:['window','coffee','flowers']},{mode:'circle',ids:['window','coffee','flowers']},{mode:'rect',ids:['window','coffee','flowers']},{mode:'circle',ids:['coffee','window','flowers']},{mode:'rect',ids:['coffee','window','flowers']},{mode:'long',ids:['window','coffee','flowers']}];
 // Ink matches Lampy's body text token in src/screens/life-page.ts; opacity applies only to paper.
 const css=`.three-study{position:absolute;inset:0;background:#faf9f5;font-family:"Songti SC","Noto Serif CJK SC",Baskerville,Georgia,serif}.three-study:lang(en){font-family:Baskerville,"Palatino Linotype",Georgia,serif}.three-photo{position:absolute;margin:0}.three-photo img{object-fit:contain}.three-overlay{position:absolute;display:flex;align-items:center;justify-content:center;color:#25231F;box-sizing:border-box}.three-overlay>div{font:inherit;width:100%;white-space:pre-wrap;overflow-wrap:anywhere;letter-spacing:.015em}.three-overlay.circle{border-radius:50%;background:rgba(250,249,245,.80);padding:44px;text-align:center;font-size:30px;line-height:1.75}.three-overlay.rect{border-radius:14px;background:rgba(250,249,245,.86);padding:30px 32px;font-size:28px;line-height:1.7;text-align:left}`;
 for(const [lang,language]of [['zh','zh-Hans'],['en','en']]){
  const short=lang==='zh'?'平常的日子，\n也值得记住。':'Ordinary days,\nworth keeping.';
  const paragraph=lang==='zh'?'那天没有特别的安排，只是在窗边坐了一会儿。光落在杯子旁边，我们聊着路上的小事，也想把这一刻留住。':'No plans, just an afternoon by the window. We talked for a while and kept a little of this quiet day.';
  const long=lang==='zh'?'午后的光慢慢移过窗台，落在杯子旁边。我们没有安排什么，只想在家里待一会儿。楼下偶尔传来脚步声，远处有车经过，屋子里却一直很安静。\n\n后来一起把植物挪了个位置。那片新长出的叶子比昨天舒展了一些，朝着窗外伸过去。平时总觉得日子过得太快，坐下来才发现，原来这些细小的变化一直都在。\n\n傍晚的光变得柔和，桌上的咖啡已经凉了。我拿起相机，留下眼前这个普通的角落。照片里没有什么特别的事，却有我希望以后还能想起来的生活。':'The afternoon light moved slowly across the windowsill and came to rest beside the cup. We had made no plans. For once, it felt enough to stay home and let the day take its time.\n\nWe moved the plant closer to the window. A new leaf had opened since yesterday, almost too quietly to notice. Sitting there, we began to see the small changes that busy days so often hide.\n\nBy evening the coffee was cold. I picked up the camera and kept this ordinary corner of the room. Nothing remarkable had happened, yet there was something here I wanted to remember.';
  const notes=cases.map(c=>c.mode==='circle'?short:c.mode==='rect'?paragraph:c.mode==='long'?long:'');
  const entries=cases.map((c,i)=>({momentId:'three-'+i,collectedAt:'',sourceRevisionAtCollect:1,presence:'ready',revision:1,note:'',feeling:'平静',occurredAt:'2026-07-01',occurredAtPrecision:'day',recordedAt:'',media:c.ids.map(id=>({assetId:id,role:'image',availability:'available',widthPx:sizes[id].width,heightPx:sizes[id].height,intrinsicRatio:sizes[id].width/sizes[id].height,durationMs:null}))}));
  const options={input:{album:{id:'three-study',schemaVersion:1,name:lang==='zh'?'有光的日子':'Days in the Light',opening:null,cover:{kind:'image',momentId:entries[0].momentId,assetId:'coffee'},entries:[],createdAt:'',updatedAt:''},entries},assets,language,design:'imagebook',id:'three-overlay-study-'+lang,createdAt:'2026-11-25',dates:Object.fromEntries(entries.map(e=>[e.momentId,{label:'2026-07-01',chapter:lang==='zh'?'2026年7月':'July 2026'}]))};
  const docs=albumEpubDocuments(options);docs['OEBPS/style.css']=strToU8(strFromU8(docs['OEBPS/style.css'])+css);let opf=strFromU8(docs['OEBPS/package.opf']);const report=[];
  cases.forEach((c,i)=>{
   const name='record-'+(i+1),file='OEBPS/'+name+'.xhtml',original=strFromU8(docs[file]),record=entries[i],photos=wall(c.ids.map(id=>sizes[id]));
   const wrap=body=>`<main class="fixed-page"><section class="three-study" lang="${language}">${body}${chronicleBinding(record.feeling,esc)}</section></main>`;
   const document=body=>original.replace(/<body[^>]*>[\s\S]*<\/body>/,`<body class="imagebook">${body}</body>`);
   let body=photos.map((b,k)=>`<figure class="three-photo" style="${style(b)}"><a id="view-${i*3+k+1}" class="photo-link" href="photo-${i*3+k+1}.xhtml" aria-label="${lang==='zh'?'查看完整图片':'View full photograph'}"><img src="${assets[c.ids[k]].path}" alt="${lang==='zh'?'窗边的日常':'An ordinary moment by the window'}"/></a></figure>`).join('');
   const minX=Math.min(...photos.map(b=>b.x)),maxX=Math.max(...photos.map(b=>b.x+b.width)),minY=Math.min(...photos.map(b=>b.y)),maxY=Math.max(...photos.map(b=>b.y+b.height));
   let overlay=null;
   if(c.mode==='circle'){const d=300;overlay=box(minX+(maxX-minX)*.57-d/2,minY+(maxY-minY)*.36-d/2,d,d);}
   if(c.mode==='rect')overlay=box(maxX-504,maxY-282,480,250);
   if(overlay)body+=`<div class="three-overlay ${c.mode}" style="${style(overlay)}"><div class="fixed-prose">${esc(notes[i])}</div></div>`;
   docs[file]=strToU8(document(wrap(body)));const next=[];
   if(c.mode==='long'){
    let items='',refs='';chronicleProsePages(notes[i]).forEach((chunk,j)=>{const n=name+'-'+(j+2);docs['OEBPS/'+n+'.xhtml']=strToU8(document(chronicleProseBody(chunk,record,j,language,esc)));items+=`<item id="${n}" href="${n}.xhtml" media-type="application/xhtml+xml"/>`;refs+=`<itemref idref="${n}"/>`;next.push(n);});
    opf=opf.replace('</manifest>',items+'</manifest>').replace(`<itemref idref="${name}"/>`,`<itemref idref="${name}"/>`+refs);
   }
   report.push({name,mode:c.mode,photos,overlay,note:notes[i],next});
  });
  docs['OEBPS/package.opf']=strToU8(opf);for(const a of Object.values(assets))docs['OEBPS/'+a.path]=a.bytes;
  const base=path.resolve(out,lang);for(const [file,v]of Object.entries(docs)){const p=path.join(base,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,v,{flag:'wx'});}
  fs.writeFileSync(path.resolve(out,`Lampy-Chronicle-three-photo-study-${lang}.epub`),zipSync(Object.fromEntries(Object.entries(docs).map(([k,v])=>[k,[v,{level:k==='mimetype'?0:6}]]))),{flag:'wx'});
  fs.writeFileSync(path.join(base,'plans.json'),JSON.stringify(report,null,2));
 }
 console.log('THREE_OVERLAY_STUDY_OK');
}finally{if(previous)Module._extensions['.ts']=previous;else delete Module._extensions['.ts'];}
