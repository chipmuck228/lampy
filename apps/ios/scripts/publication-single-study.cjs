/* Visual study only: does not alter the production exporter. Frozen cover/opening/date
 * use production projection; candidate single-image pages use synthetic writing. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const {strToU8,strFromU8,zipSync}=require('fflate');
const out=process.argv[2];if(!out)throw Error('Output directory required');
const previous=Module._extensions['.ts'];
Module._extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
try{
 const {albumEpubDocuments,epubEscape:esc}=require('../src/application/album-epub.ts');
 const {splitPublicationText}=require('../src/application/album-imagebook.ts');
 const root=path.resolve(out);fs.mkdirSync(root,{recursive:true});
 const pictures={coffee:[1400,932],window:[1200,1800]};
 const assets=Object.fromEntries(Object.keys(pictures).map(n=>[n,{path:`media/${n}.jpg`,mime:'image/jpeg',bytes:new Uint8Array(fs.readFileSync(path.join(__dirname,`../assets/first-run/${n}.jpg`)))}]));
 const longZh='午后的光慢慢移过窗台，落在杯子旁边。我们没有安排什么，只想在家里待一会儿。楼下偶尔传来脚步声，远处有车经过，屋子里却一直很安静。\n\n后来一起把植物挪了个位置。那片新长出的叶子比昨天舒展了一些，朝着窗外伸过去。平时总觉得日子过得太快，坐下来才发现，原来这些细小的变化一直都在。\n\n我们聊起以前住过的地方，也聊起下一次想去哪里。好多事情已经记不清了，却还记得那时候一起吃饭、一起走路的样子。说到有趣的地方，两个人又笑了起来。\n\n傍晚的光变得柔和，桌上的咖啡已经凉了。我拿起相机，留下眼前这个普通的角落。照片里没有什么特别的事，却有我希望以后还能想起来的生活。\n\n晚上收拾桌子时，又看见杯沿那一点淡淡的痕迹。今天就这样过去了，平常、缓慢，也很完整。想把它留在这里，等往后某一天，再翻回来看看。';
 const longEn='The afternoon light moved slowly across the windowsill and came to rest beside the cup. We had made no plans. For once, it felt enough to stay home and let the day take its time.\n\nWe moved the plant a little closer to the window. A new leaf had opened since yesterday, almost too quietly to notice. Sitting there, we began to see the small changes that busy days so often hide.\n\nWe talked about places we had lived and roads we might travel next. Some details had faded, but we still remembered the meals, the walks, and the way we laughed together.\n\nBy evening the coffee was cold. I picked up the camera and kept this ordinary corner of the room. Nothing remarkable had happened, yet there was something here I wanted to remember.\n\nLater, while clearing the table, I noticed a pale mark along the rim of the cup. The day had passed quietly. I wanted to keep a little of it here, to return to another time.';
 const css=`
 .study-page{position:absolute;inset:0;background:#faf9f5;color:#303a37;font-family:"Songti SC","Noto Serif CJK SC",Baskerville,Georgia,serif}
 .study-photo{position:absolute;margin:0}.study-photo a,.study-photo img{display:block;width:100%;height:100%}.study-photo img{object-fit:contain}
 .study-stripe{position:absolute;left:0;top:0;bottom:0;width:5px;background:#6b8a7c}
 .study-seam{position:absolute;top:0;bottom:0;width:8px;background:#faf9f5}.study-seam.one{left:33.333%}.study-seam.two{left:66.666%}
 .study-short{position:absolute;font-size:30px;line-height:1.85;white-space:pre-wrap;letter-spacing:.025em}.study-short>span{display:block;width:45px;border-top:2px solid #6b8a7c;margin-bottom:30px}
 .study-masthead{position:absolute;left:120px;right:120px;top:96px;font:17px/1.5 Georgia,serif;letter-spacing:5px;color:#105f62}.study-masthead i{position:absolute;left:140px;right:0;top:12px;border-top:1px solid #b8cac4}
 .study-prose{position:absolute;left:220px;top:215px;width:760px;margin:0;font-size:29px;line-height:1.85;letter-spacing:.025em;white-space:pre-wrap;overflow-wrap:break-word}
 .study-page:lang(en){font-family:Baskerville,"Palatino Linotype",Georgia,serif}.study-page:lang(en) .study-prose{font-size:30px;line-height:1.8;letter-spacing:0}
 .study-side{position:absolute;left:168px;top:222px;width:2px;height:64px;background:#6b8a7c}
 .study-footer{position:absolute;left:120px;right:120px;top:782px;border-top:1px solid #b8cac4;padding-top:22px;font:italic 21px/1.4 Baskerville,Georgia,serif;color:#687870}.study-footer b{float:right;font:19px/1.4 Georgia,serif;letter-spacing:.1em;font-weight:400}
 `;
 for(const [lang,language]of [['zh','zh-Hans'],['en','en']]){
  const cases=[['coffee','none'],['window','none'],['coffee','short'],['window','short'],['coffee','long'],['window','long']];
  const entries=cases.map(([assetId],i)=>{const [widthPx,heightPx]=pictures[assetId];return {momentId:'study-'+i,collectedAt:'',sourceRevisionAtCollect:1,presence:'ready',revision:1,note:'',feeling:'平静',occurredAt:`2026-07-${String(i+1).padStart(2,'0')}`,occurredAtPrecision:'day',recordedAt:'',media:[{assetId,role:'image',availability:'available',widthPx,heightPx,intrinsicRatio:widthPx/heightPx,durationMs:null}]};});
  const options={input:{album:{id:'study',schemaVersion:1,name:lang==='zh'?'慢下来的日子':'The Unhurried Days',opening:null,cover:{kind:'image',momentId:entries[0].momentId,assetId:'coffee'},entries:[],createdAt:'',updatedAt:''},entries},assets,language,design:'imagebook',id:'single-study-'+lang,createdAt:'2026-11-24',dates:Object.fromEntries(entries.map(e=>[e.momentId,{label:e.occurredAt,chapter:lang==='zh'?'2026年7月':'July 2026'}]))};
  const docs=albumEpubDocuments(options);docs['OEBPS/style.css']=strToU8(strFromU8(docs['OEBPS/style.css'])+css);
  let opf=strFromU8(docs['OEBPS/package.opf']);const proof=[];
  cases.forEach(([assetId,mode],i)=>{
   const n=i+1,name=`record-${n}`,file=`OEBPS/${name}.xhtml`,original=strFromU8(docs[file]);
   const [w,h]=pictures[assetId],ratio=w/h,portrait=ratio<1;
   const photo=(x,y,width,height,cover=false)=>`<figure class="study-photo" style="left:${x}px;top:${y}px;width:${width}px;height:${height}px"><a id="view-${n}" href="photo-${n}.xhtml" aria-label="${lang==='zh'?'查看完整图片':'View full photograph'}"><img src="media/${assetId}.jpg" alt="${lang==='zh'?'窗边的日常':'An ordinary moment by the window'}"${cover?' style="object-fit:cover"':''}/></a></figure>`;
   const framed=()=>portrait?photo((1200-900*ratio)/2,0,900*ratio,900):photo(0,(900-1200/ratio)/2,1200,1200/ratio);
   let body;
   if(mode==='none')body=portrait?framed():photo(0,0,1200,900,true)+'<span class="study-seam one" aria-hidden="true"></span><span class="study-seam two" aria-hidden="true"></span>';
   else if(mode==='short'){
    const note=lang==='zh'?'我们坐了一会儿，咖啡凉了也没关系。\n窗边的光，刚好留住这个下午。':'We sat for a while. The coffee could wait.\nThe light by the window held a little of the afternoon.';
    body=portrait?photo(80,80,740*ratio,740)+`<div class="study-short" style="left:660px;top:330px;width:430px"><span aria-hidden="true"></span>${esc(note)}</div>`:photo((1200-900)/2,60,900,900/ratio)+`<div class="study-short" style="left:150px;top:720px;width:900px;font-size:28px">${esc(note)}</div>`;
   }else body=framed();
   body+= '<span class="study-stripe" aria-hidden="true"></span>';
   const wrap=body=>`<main class="fixed-page"><section class="study-page" lang="${language}">${body}</section></main>`;
   const document=body=>original.replace(/<body[^>]*>[\s\S]*<\/body>/,`<body class="imagebook">${wrap(body)}</body>`);
   docs[file]=strToU8(document(body));proof.push({name,label:`${lang==='zh'?(portrait?'竖图':'横图'):(portrait?'Portrait':'Landscape')} · ${mode==='none'?'无文字':mode==='short'?'短文字':'长文字照片页'}`});
   if(mode==='long'){
    const text=lang==='zh'?longZh:longEn,chunks=[];
    for(const paragraph of text.split('\n\n')){
     if(splitPublicationText(paragraph,28,9).length>1)throw Error('Study paragraph exceeds page budget');
     const last=chunks.at(-1),candidate=last?last+'\n\n'+paragraph:paragraph;
     if(last&&splitPublicationText(candidate,28,9).length===1)chunks[chunks.length-1]=candidate;else chunks.push(paragraph);
    }
    if(chunks.join('\n\n')!==text)throw Error('Text lost');
    let items='',refs='';
    chunks.forEach((chunk,j)=>{const next=name+'-text-'+(j+1);docs[`OEBPS/${next}.xhtml`]=strToU8(document(`<header class="study-masthead">LAMPY<i aria-hidden="true"></i></header><span class="study-side" aria-hidden="true"></span><div class="study-prose">${esc(chunk)}</div><footer class="study-footer"><span lang="en">Chronicle</span><b>${String(j+1).padStart(2,'0')}</b></footer>`));items+=`<item id="${next}" href="${next}.xhtml" media-type="application/xhtml+xml"/>`;refs+=`<itemref idref="${next}"/>`;proof.push({name:next,label:`${portrait?'竖图':'横图'} · 长文${j===0?'首页':'续页 '+j}`});});
    opf=opf.replace('</manifest>',items+'</manifest>').replace(`<itemref idref="${name}"/>`,`<itemref idref="${name}"/>`+refs);
   }
  });
  docs['OEBPS/package.opf']=strToU8(opf);
  for(const asset of Object.values(assets))docs['OEBPS/'+asset.path]=asset.bytes;
  const dest=path.join(root,lang);for(const [f,bytes]of Object.entries(docs)){const p=path.join(dest,f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes,{flag:'wx'});}
  fs.writeFileSync(path.join(root,`Lampy-Chronicle-single-study-${lang}.epub`),zipSync(Object.fromEntries(Object.entries(docs).map(([k,v])=>[k,[v,{level:k==='mimetype'?0:6}]]))),{flag:'wx'});
  fs.writeFileSync(path.join(dest,'proof.json'),JSON.stringify(proof,null,2));
 }
 console.log('SINGLE_STUDY_OK');
}finally{if(previous)Module._extensions['.ts']=previous;else delete Module._extensions['.ts'];}
