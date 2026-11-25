import {CHRONICLE_TEXT_COLOR} from './album-chronicle-colors';
import {planChronicleThree,chronicleThreeBody,CHRONICLE_THREE_CSS} from './album-chronicle-three';
import {planChroniclePair,chroniclePairPhoto,chroniclePairBody,CHRONICLE_PAIR_CSS} from './album-chronicle-pair';
import {splitPublicationText} from './album-publication-text';
import {chronicleDatePages,CHRONICLE_DATE_CSS} from './album-chronicle-date';
import {chronicleOpening,CHRONICLE_OPENING_CSS} from './album-chronicle-opening';
import {chronicleCover,CHRONICLE_COVER_CSS} from './album-chronicle-cover';
import {planChronicleSingle,chronicleSingleBody,chronicleProsePages,chronicleProseBody,CHRONICLE_SINGLE_CSS} from './album-chronicle-single';
import {planPhotoComposition,photoFit} from './album-photo-composition';
import type {AlbumEpubOptions} from './album-epub';
import {PUBLICATION_OPENING} from './album-publication';

import {planBookSections,bookDateRange,bookDay} from './album-book-plan';

export type ImagebookPage={name:string;title:string;body:string;nav:boolean;linear?:boolean};
export {splitPublicationText} from './album-publication-text';
export function imagebookPages(options:AlbumEpubOptions,coverPath:string,escape:(s:string)=>string):ImagebookPage[]{
 const {input,assets,dates,language}=options;const zh=language==='zh-Hans';const pages:ImagebookPage[]=[];
 const add=(name:string,title:string,body:string,nav=false)=>pages.push({name,title,body:`<main class="fixed-page">${body}</main>`,nav});

 const photoDetails:Record<string,string[]>={};
 let photoPage=0,readingPage='',photoCredit='';
 const linkedPhoto=(media:typeof input.entries[number]['media'][number],target:number,fit?:'cover'|'contain')=>{
  const n=++photoPage,full=`photo-${n}`,anchor=`view-${n}`;
  (photoDetails[readingPage]??=[]).push(`<aside id="${full}" class="photo-detail" aria-label="${zh?'完整图片':'Full photograph'}"><div class="original-photo"><img src="${escape(assets[media.assetId].path)}" alt="${zh?'完整图片':'Full photograph'}"/></div><p class="photo-credit">${escape(photoCredit)}</p><a class="photo-return" href="#${anchor}">${zh?'返回正文':'Back to reading'} ↩</a></aside>`);
  return `<a id="${anchor}" class="photo-link" href="#${full}" aria-label="${zh?'查看完整图片':'View full photograph'}"><img style="object-fit:${fit??photoFit(media,target)}" src="${escape(assets[media.assetId].path)}" alt="${zh?'点击查看完整图片':'Open full photograph'}"/></a>`;
 };
 const photo=(_index:number,media:typeof input.entries[number]['media'][number])=>linkedPhoto(media,0);
 const heading=escape(input.album.name);
 add('cover',input.album.name,chronicleCover(options,coverPath,escape));
 const opening=input.album.opening?.trim()?input.album.opening:PUBLICATION_OPENING[language];
 splitPublicationText(opening,27,6).forEach((chunk,i)=>add(i?'opening-'+(i+1):'opening',zh?'开篇':'Preface',chronicleOpening(options,chunk,i,escape),i===0));
 let previous='';
 planBookSections(options).forEach(section=>{
  const index=section.indices[0],record=input.entries[index];
  const date=dates[record.momentId]??{label:zh?'日子未确认':'Date uncertain',chapter:zh?'日子未确认':'Date uncertain'};
  const day=bookDay(options,index);const chapter=previous!==day.key;previous=day.key;
  if(chapter)for(const leaf of chronicleDatePages(options,index,escape))add(leaf.name,leaf.title,leaf.body,leaf.nav);
  const label=`<header class="fixed-meta">${chapter?`<h2>${escape(date.chapter)}</h2>`:''}<p>${escape(date.label)}${section.indices.length===1&&record.attribution?' · '+escape(record.attribution):''}${section.indices.length===1&&record.feeling?' · '+escape(record.feeling):''}</p></header>`;
  let page=0;const name=()=>`record-${index+1}${page?'-'+(page+1):''}`;
  const addRecord=(body:string,showHeader=true)=>{add(name(),date.chapter,`${showHeader?label:''}${body}${(photoDetails[name()]??[]).join('')}`,false);delete photoDetails[name()];page++;};
  photoCredit=[day.label,record.attribution,record.feeling].filter(Boolean).join(' · ');
  if(section.layout==='daily-notes'&&section.indices.length>1){
   addRecord(`<div class="daily-notes">${section.indices.map(i=>{const r=input.entries[i];return `<article><p class="note-author">${escape([r.attribution,r.feeling].filter(Boolean).join(' · '))}</p><div class="fixed-prose">${escape(r.note)}</div></article>`;}).join('')}</div>`);return;
  }
  const singleImages=record.media.filter(media=>media.role==='image');
  if(singleImages.length===3&&record.media.every(m=>m.role==='image')){
   const plan=planChronicleThree(singleImages,record.note);
   if(plan){
    readingPage=name();
    addRecord(chronicleThreeBody(record,plan,singleImages.map(m=>linkedPhoto(m,0,'contain')),language,escape),false);
    if(record.note.trim()&&!plan.overlay)chronicleProsePages(record.note).forEach((chunk,i)=>addRecord(chronicleProseBody(chunk,record,i,language,escape),false));
    return;
   }
   // Small/unknown/extreme images retain their complete contents on safe plates.
   for(const m of singleImages){readingPage=name();const plan=planChronicleSingle(m,'');addRecord(chronicleSingleBody({...record,note:''},plan,linkedPhoto(m,0,'contain'),language,escape),false);}
   if(record.note.trim())chronicleProsePages(record.note).forEach((chunk,i)=>addRecord(chronicleProseBody(chunk,record,i,language,escape),false));
   return;
  }
  if(singleImages.length===2&&record.media.every(media=>media.role==='image'||media.role==='audio')){
   const first=record.media.findIndex(m=>m.role==='image'),last=record.media.map(m=>m.role).lastIndexOf('image');
   const plan=planChroniclePair(singleImages,record.note,last-first>1);
   let imageIndex=0;
   for(const media of record.media){
    if(media.role==='image'){
     if(plan.kind==='separate'){
      readingPage=name();
      addRecord(chroniclePairBody(record,plan,[chroniclePairPhoto(plan,imageIndex,linkedPhoto(media,0,'contain'))],language,escape,imageIndex===0),false);
     }else if(imageIndex===0){
      readingPage=name();
      addRecord(chroniclePairBody(record,plan,singleImages.map((image,i)=>chroniclePairPhoto(plan,i,linkedPhoto(image,0,'contain'))),language,escape),false);
     }
     imageIndex++;
     if(imageIndex===2&&record.note.trim()&&!plan.text)chronicleProsePages(record.note).forEach((chunk,i)=>addRecord(chronicleProseBody(chunk,record,i,language,escape),false));
    }else{
     const sec=media.durationMs==null?null:Math.max(0,Math.round(media.durationMs/1000));
     const duration=sec==null?'':`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;
     addRecord(`<aside class="voice-page"><p class="voice-label">${zh?'听听当时的声音':'Listen to this moment'}${duration?' · '+duration:''}</p><audio controls="controls" preload="none" src="${escape(assets[media.assetId].path)}">${zh?'请使用支持声音的阅读器。':'Use an audio-capable reader.'}</audio></aside>`);
    }
   }
   return;
  }
  if(singleImages.length===1&&record.media.every(media=>media.role==='image'||media.role==='audio')){
   readingPage=name();
   const media=singleImages[0],plan=planChronicleSingle(media,record.note);
   addRecord(chronicleSingleBody(record,plan,linkedPhoto(media,plan.target,plan.kind==='triptych'?'cover':'contain'),language,escape),false);
   if(record.note.trim()&&!plan.shortText)chronicleProsePages(record.note).forEach((chunk,i)=>addRecord(chronicleProseBody(chunk,record,i,language,escape),false));
   for(const audio of record.media.filter(media=>media.role==='audio')){
    const sec=audio.durationMs==null?null:Math.max(0,Math.round(audio.durationMs/1000));
    const duration=sec==null?'':`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;
    addRecord(`<aside class="voice-page"><p class="voice-label">${zh?'听听当时的声音':'Listen to this moment'}${duration?' · '+duration:''}</p><audio controls="controls" preload="none" src="${escape(assets[audio.assetId].path)}">${zh?'请使用支持声音的阅读器。':'Use an audio-capable reader.'}</audio></aside>`);
   }
   return;
  }
  const composition=planPhotoComposition(record.media,!!record.note.trim(),index%2===1,record.note.length);
  if(composition){
   readingPage=name();
   const style=(b:typeof composition.photos[number])=>`left:${b.x}px;top:${b.y}px;width:${b.width}px;height:${b.height}px;`;
   const pictures=record.media.map((m,i)=>`<figure class="reference-photo" style="${style(composition.photos[i])}">${linkedPhoto(m,composition.ratios[i])}</figure>`);
   let remaining=record.note;
   const prose=composition.text.map(b=>{
    const columns=Math.max(8,Math.floor(b.width/30));const lines=Math.max(2,Math.floor(b.height/49));
    let chunk=splitPublicationText(remaining,columns,lines)[0]??'';
    if(chunk.length<remaining.length){const pauses=[...chunk.matchAll(/[。！？.!?;\n]/gu)];const pause=pauses.at(-1);if(pause&&pause.index>=chunk.length*.35)chunk=chunk.slice(0,pause.index+pause[0].length);}
    remaining=remaining.slice(chunk.length);
    return `<div class="reference-text fixed-prose" style="${style(b)}"><div>${escape(chunk).replace(/\r/g,'&#13;')}</div></div>`;
   }).join('');
   addRecord(`<section class="reference-composition ${composition.kind}">${pictures.join('')}${prose}</section>`);
   chronicleProsePages(remaining).forEach((chunk,i)=>addRecord(chronicleProseBody(chunk,record,i,language,escape),false));
   return;
  }
  const first=record.media[0]?.role==='image'?record.media[0]:null;
  const chunks=splitPublicationText(record.note,first?15:30,14);
  readingPage=name();
  if(first){addRecord(`<div class="photo-pane">${photo(0,first)}</div><div class="text-pane"><div class="fixed-prose">${escape(chunks.shift()??'').replace(/\r/g,'&#13;')}</div></div>`);}
  const remainingText=first?chunks.join(''):record.note;
  chronicleProsePages(remainingText).forEach((chunk,i)=>addRecord(chronicleProseBody(chunk,record,i,language,escape)+(i===0&&record.attribution?`<p class="chronicle-attribution">${escape(record.attribution)}</p>`:''),false));
  for(let i=first?1:0;i<record.media.length;i++){
   readingPage=name();
   const media=record.media[i];
   if(media.role==='image'){
    const next=record.media[i+1];
    if(next?.role==='image'){addRecord(`<div class="photo-duo"><figure>${photo(i,media)}</figure><figure>${photo(i+1,next)}</figure></div>`);i++;}
    else addRecord(`<div class="photo-full">${photo(i,media)}</div>`);
   }else if(media.role==='audio'){
    const sec=media.durationMs==null?null:Math.max(0,Math.round(media.durationMs/1000));
    const duration=sec==null?'':`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;
    addRecord(`<aside class="voice-page"><p class="voice-label">${zh?'听听当时的声音':'Listen to this moment'}${duration?' · '+duration:''}</p><audio controls="controls" preload="none" src="${escape(assets[media.assetId].path)}">${zh?'请使用支持声音的阅读器。':'Use an audio-capable reader.'}</audio></aside>`);
   }else throw new Error('EPUB_UNSUPPORTED_MEDIA');
  }
  if(!page)addRecord('<div class="text-only"></div>');
 });
 add('archive',zh?'Lampy · 留存':'Lampy · Colophon',`<section class="edition-notes"><img class="edition-symbol" src="lampy-symbol.svg" alt="Lampy"/><p class="edition-brand">Lampy</p><p class="edition-title">${heading}</p><p class="edition-range">${escape(bookDateRange(options))}</p><p class="made">${zh?'珍藏于':'Kept on'} ${escape(options.createdAt.slice(0,10))}</p></section>`,true);
 return pages;
}
export const IMAGEBOOK_CSS=`
@page{margin:0;size:1200px 900px}
html,body{margin:0;padding:0;width:1200px;height:900px;background:#fff;color:#292d2e}
body{font-family:"Songti SC","Noto Serif CJK SC",Georgia,serif}
*{box-sizing:border-box}h1,h2,p,figure,dl,dd{margin:0}img{display:block;object-fit:contain;width:100%;height:100%}
.fixed-page{position:relative;width:1200px;height:900px;background:#fff}
.fixed-cover{position:absolute;inset:0;background:#e8e5df;color:#292d2e}
.fixed-cover.has-photo{background:#242a2b;color:#fff}.cover-photo{position:absolute;inset:0}.cover-photo img{opacity:.92}
.cover-shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(15,20,22,.62),transparent 85%)}
.fixed-cover:not(.has-photo) .cover-shade{background:none}
.cover-type{position:absolute;left:85px;right:85px;top:180px;bottom:90px;display:flex;flex-direction:column;justify-content:center;gap:34px}
.brand{font:18px/1.5 -apple-system,sans-serif;letter-spacing:5px;opacity:.7}
h1{font-weight:400;line-height:1.4;overflow-wrap:anywhere;max-width:840px}
.fixed-meta{position:absolute;left:64px;right:64px;top:35px;height:80px;display:flex;align-items:baseline;justify-content:space-between;gap:30px;font:18px/1.5 -apple-system,sans-serif;color:#707575}
.fixed-meta h2{font:24px/1.4 Georgia,serif;color:#34393a}.fixed-meta p{max-width:850px;overflow-wrap:anywhere}
.photo-pane{position:absolute;left:44px;top:128px;bottom:44px;width:548px}
.text-pane{position:absolute;left:660px;right:64px;top:128px;bottom:64px;display:flex;align-items:center}
.fixed-prose{font-size:28px;line-height:1.65;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal;width:100%}
.text-only{position:absolute;left:150px;right:150px;top:128px;bottom:64px;display:flex;align-items:center}
.opening-type{position:absolute;left:185px;right:185px;top:130px;bottom:130px;display:flex;align-items:center}
.opening-type .fixed-prose{font-size:32px;line-height:1.8}
.photo-full{position:absolute;left:64px;right:64px;top:128px;bottom:44px}
.photo-duo{position:absolute;left:44px;right:44px;top:128px;bottom:44px;display:flex;gap:28px}.photo-duo figure{flex:1;min-width:0}
.voice-page{position:absolute;left:180px;right:180px;top:260px;min-height:340px;padding:48px 40px 100px;overflow:visible;border-top:1px solid #b8cac4;border-bottom:1px solid #b8cac4}.voice-page audio{display:block;width:100%;height:100px;min-height:100px;margin:0;overflow:visible}.voice-label{font-size:30px;line-height:1.6;margin-bottom:35px}audio{width:100%}
.edition-notes{position:absolute;left:185px;right:185px;top:215px;font-size:24px;line-height:1.8}.edition-notes h1{font-size:40px;margin:25px 0}.edition-notes dl{display:flex;gap:70px;margin:35px 0}.edition-notes dt{font-size:34px}.edition-notes dd,.made{font:18px/1.8 -apple-system,sans-serif;color:#747a7a}

.default-cover{background:#f4f1eb}.default-cover .cover-type{top:110px;bottom:310px}.default-symbol{position:absolute;right:130px;bottom:95px;width:220px;height:220px;opacity:.65}
.daily-notes{position:absolute;left:180px;right:180px;top:140px;bottom:80px;display:flex;flex-direction:column;justify-content:center;gap:45px}.daily-notes .fixed-prose{font-size:26px}.note-author{font:16px/1.5 sans-serif;color:#777;margin-bottom:10px}
.photo-layout{position:absolute;left:64px;right:64px;top:128px;bottom:44px;display:flex;gap:28px}.photo-layout figure{flex:1;min-width:0;min-height:0}.photo-layout.gallery{display:flex;gap:24px}.photo-column{display:flex;flex-direction:column;gap:24px;flex:1;min-width:0;min-height:0}.photo-column figure{height:calc(50% - 12px);flex:none}.photo-layout.gallery>figure{width:50%}

.edition-notes{top:auto;bottom:110px;left:200px;right:200px;text-align:center;font-size:24px;line-height:1.8}.edition-symbol{width:145px;height:145px;margin:0 auto -5px}.edition-brand{font:42px/1.4 Georgia,serif;letter-spacing:2px;color:#40564a}.edition-title{font-size:24px;margin-top:20px}.edition-range,.made{font:17px/1.8 Georgia,serif;color:#777}.made{margin-top:12px}

.paired-story{position:absolute;left:64px;right:64px;top:128px;bottom:64px;display:flex;flex-direction:column;gap:35px}.paired-pictures{display:flex;gap:28px;min-height:0;flex:1}.paired-pictures figure{flex:1;min-width:0}.paired-story>.fixed-prose{font-size:26px;max-width:880px;margin:auto}

.date-opener{position:absolute;left:180px;right:180px;top:340px}.date-opener h1{font-size:68px;line-height:1.4;font-weight:400}.date-rule{width:70px;border-top:2px solid #40564a;margin-bottom:35px}

.photo-detail{display:none;position:absolute;inset:0;z-index:20;background:#faf9f5}.photo-detail:target,.photo-detail.is-open{display:block}html.photo-viewer-ready .photo-detail:target{display:none}html.photo-viewer-ready .photo-detail.is-open{display:block}.photo-detail img{object-fit:contain}
.photo-link{display:block;width:100%;height:100%;color:inherit}.photo-link:focus{outline:2px solid #40564a;outline-offset:4px}.original-photo{position:absolute;inset:48px 64px 110px}.photo-return{position:absolute;bottom:38px;left:64px;font:22px/1.5 Georgia,serif;color:#40564a;text-decoration:none}
.composed{position:absolute;left:64px;right:64px;top:128px;bottom:64px;display:flex;flex-direction:column;gap:30px}.composition-photos{flex:1;min-height:0;display:flex;gap:24px}.slot{flex:1;min-width:0;min-height:0}.composition-prose{font-size:26px;line-height:1.65;max-width:880px;margin:0 auto;flex:none}
.portrait-story{flex-direction:row;gap:65px;align-items:center}.portrait-story .composition-photos{height:100%;flex:1}.portrait-story .composition-prose{flex:1;max-width:440px}.portrait-story:not(.with-note) .composition-photos{max-width:550px;margin:auto}
.wide-story .composition-photos{max-height:600px}.triptych .composition-photos{position:relative;display:block}.triptych .slot{position:absolute;width:calc(50% - 12px);height:calc(50% - 12px);right:0}.triptych .slot-1{left:0;right:auto;top:0;height:100%}.triptych .slot-2{top:0}.triptych .slot-3{bottom:0}

.composition-photos{flex:none;height:650px}.with-note .composition-photos{height:500px}.portrait-story .composition-photos,.portrait-story:not(.with-note) .composition-photos{flex:none;width:500px;max-width:500px;height:625px}.wide-story .composition-photos{max-height:none}

.reference-composition{position:absolute;inset:0}.reference-photo{position:absolute;margin:0;background:transparent}.reference-text{position:absolute;display:flex;align-items:center;font-size:28px;line-height:1.65;white-space:pre-wrap;text-align:left}.reference-text>div{width:100%}.full-photo{background:#202524}.full-photo .reference-photo{background:#202524}.fixed-meta{z-index:2}.fixed-meta h2{display:none}.fixed-meta{background:rgba(255,255,255,.92);top:0;left:0;right:0;height:100px;padding:32px 45px;justify-content:flex-end}

.full-photo{background:#fff}.full-photo .reference-photo{background:transparent}

.single-photo-plate{position:absolute;inset:0;background:#fff}.triptych-seam{position:absolute;top:0;bottom:0;width:8px;background:#fff;pointer-events:none}.seam-one{left:calc(33.333333% - 4px)}.seam-two{left:calc(66.666667% - 4px)}.feeling-stripe{position:absolute;left:0;top:0;bottom:0;width:5px;pointer-events:none}.photo-credit{position:absolute;bottom:42px;right:64px;max-width:700px;font:17px/1.4 Georgia,serif;color:#707575;text-align:right}
${CHRONICLE_COVER_CSS}
${CHRONICLE_OPENING_CSS}
${CHRONICLE_DATE_CSS}
${CHRONICLE_SINGLE_CSS}
${CHRONICLE_PAIR_CSS}
${CHRONICLE_THREE_CSS}
.daily-notes .fixed-prose,.reference-text,.text-pane .fixed-prose,.text-only .fixed-prose{color:${CHRONICLE_TEXT_COLOR}}
`;
