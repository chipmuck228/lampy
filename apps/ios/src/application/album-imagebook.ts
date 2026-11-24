import type {AlbumEpubOptions} from './album-epub';
import {PUBLICATION_OPENING} from './album-publication';

import {planBookSections,bookDateRange} from './album-book-plan';

export type ImagebookPage={name:string;title:string;body:string;nav:boolean};
/** Conservative pagination budget; leaves room for platform serif font differences.
 * Chunks preserve every source character. Never clamp, ellipsize or hide overflow.
 */
export function splitPublicationText(text:string,columns=30,lines=14):string[]{
 const graphemes=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(s=>s.segment):Array.from(text);
 const chunks:string[]=[];let start=0;
 while(start<graphemes.length){
  let line=0,width=0,end=start,lastPause=-1;
  while(end<graphemes.length){
   const glyph=graphemes[end],newline=glyph==='\n'||glyph==='\r\n';
   const weight=newline?0:/^[\x20-\x7e]+$/.test(glyph)?glyph===' '? .4:.65:1.2;
   if(newline||width+weight>columns){if(line+1>=lines&&end>start)break;line++;width=0;}
   if(!newline)width+=weight;
   end++;if(/[\n。！？.!?;]/u.test(glyph))lastPause=end;
  }
  if(end<graphemes.length&&lastPause>start+(end-start)*.7)end=lastPause;
  chunks.push(graphemes.slice(start,end).join(''));start=end;
 }
 return chunks;
}
export function imagebookPages(options:AlbumEpubOptions,coverPath:string,escape:(s:string)=>string):ImagebookPage[]{
 const {input,assets,dates,language}=options;const zh=language==='zh-Hans';const pages:ImagebookPage[]=[];
 const add=(name:string,title:string,body:string,nav=false)=>pages.push({name,title,body:`<main class="fixed-page">${body}</main>`,nav});
 const photo=(index:number,media:typeof input.entries[number]['media'][number])=>`<img src="${escape(assets[media.assetId].path)}" alt="${zh?'记录中的照片':'Photograph'} ${index+1}"/>`;
 const heading=escape(input.album.name);
 add('cover',input.album.name,`<div class="fixed-cover${coverPath?' has-photo':' default-cover'}">${coverPath?`<div class="cover-photo"><img src="${escape(coverPath)}" alt="${heading}"/></div>`:''}<div class="cover-shade"></div><div class="cover-type"><p class="brand">LAMPY</p><h1 style="font-size:${input.album.name.length>50?48:76}px">${heading}</h1></div>${!coverPath?'<img class="default-symbol" src="lampy-symbol.svg" alt=""/>':''}</div>`);
 const opening=input.album.opening?.trim()?input.album.opening:PUBLICATION_OPENING[language];
 splitPublicationText(opening,26,12).forEach((chunk,i)=>add(i?'opening-'+(i+1):'opening',zh?'开篇':'Preface',`<div class="opening-type"><div class="fixed-prose">${escape(chunk)}</div></div>`,i===0));
 let previous='';
 planBookSections(options).forEach(section=>{
  const index=section.indices[0],record=input.entries[index];
  const date=dates[record.momentId]??{label:zh?'日子未确认':'Date uncertain',chapter:zh?'日子未确认':'Date uncertain'};
  const chapter=previous!==date.chapter;previous=date.chapter;
  const label=`<header class="fixed-meta">${chapter?`<h2>${escape(date.chapter)}</h2>`:''}<p>${escape(date.label)}${section.indices.length===1&&record.attribution?' · '+escape(record.attribution):''}${section.indices.length===1&&record.feeling?' · '+escape(record.feeling):''}</p></header>`;
  let page=0;const name=()=>`record-${index+1}${page?'-'+(page+1):''}`;
  const addRecord=(body:string)=>{add(name(),date.chapter,`${label}${body}`,chapter&&page===0);page++;};
  if(section.layout==='daily-notes'&&section.indices.length>1){
   addRecord(`<div class="daily-notes">${section.indices.map(i=>{const r=input.entries[i];return `<article><p class="note-author">${escape([r.attribution,r.feeling].filter(Boolean).join(' · '))}</p><div class="fixed-prose">${escape(r.note)}</div></article>`;}).join('')}</div>`);return;
  }
  if(section.layout==='photo-only'){
   for(let i=0;i<record.media.length;i+=4){
    const group=record.media.slice(i,i+4),kind=group.length===1?'solo':group.length===2?'duo':'gallery';
    const figures=group.map((m,j)=>`<figure>${photo(i+j,m)}</figure>`);
    const composition=group.length===3?`${figures[0]}<div class="photo-column">${figures.slice(1).join('')}</div>`:group.length===4?`<div class="photo-column">${figures[0]}${figures[1]}</div><div class="photo-column">${figures[2]}${figures[3]}</div>`:figures.join('');
    addRecord(`<div class="photo-layout ${kind}">${composition}</div>`);
   }return;
  }
  if(record.note.length<=100&&!/[\r\n]/.test(record.note)&&record.media.length===2&&record.media.every(m=>m.role==='image')){
   addRecord(`<div class="paired-story"><div class="paired-pictures">${record.media.map((m,i)=>`<figure>${photo(i,m)}</figure>`).join('')}</div><div class="fixed-prose">${escape(record.note)}</div></div>`);return;
  }
  const first=record.media[0]?.role==='image'?record.media[0]:null;
  const chunks=splitPublicationText(record.note,first?15:30,14);
  if(first){addRecord(`<div class="photo-pane">${photo(0,first)}</div><div class="text-pane"><div class="fixed-prose">${escape(chunks.shift()??'')}</div></div>`);}
  while(chunks.length)addRecord(`<div class="text-only"><div class="fixed-prose">${escape(chunks.shift()!)}</div></div>`);
  for(let i=first?1:0;i<record.media.length;i++){
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
.voice-page{position:absolute;left:220px;right:220px;top:330px}.voice-label{font-size:30px;line-height:1.6;margin-bottom:35px}audio{width:100%}
.edition-notes{position:absolute;left:185px;right:185px;top:215px;font-size:24px;line-height:1.8}.edition-notes h1{font-size:40px;margin:25px 0}.edition-notes dl{display:flex;gap:70px;margin:35px 0}.edition-notes dt{font-size:34px}.edition-notes dd,.made{font:18px/1.8 -apple-system,sans-serif;color:#747a7a}

.default-cover{background:#f4f1eb}.default-cover .cover-type{top:110px;bottom:310px}.default-symbol{position:absolute;right:130px;bottom:95px;width:220px;height:220px;opacity:.65}
.daily-notes{position:absolute;left:180px;right:180px;top:140px;bottom:80px;display:flex;flex-direction:column;justify-content:center;gap:45px}.daily-notes .fixed-prose{font-size:26px}.note-author{font:16px/1.5 sans-serif;color:#777;margin-bottom:10px}
.photo-layout{position:absolute;left:64px;right:64px;top:128px;bottom:44px;display:flex;gap:28px}.photo-layout figure{flex:1;min-width:0;min-height:0}.photo-layout.gallery{display:flex;gap:24px}.photo-column{display:flex;flex-direction:column;gap:24px;flex:1;min-width:0;min-height:0}.photo-column figure{height:calc(50% - 12px);flex:none}.photo-layout.gallery>figure{width:50%}

.edition-notes{top:auto;bottom:110px;left:200px;right:200px;text-align:center;font-size:24px;line-height:1.8}.edition-symbol{width:145px;height:145px;margin:0 auto -5px}.edition-brand{font:42px/1.4 Georgia,serif;letter-spacing:2px;color:#40564a}.edition-title{font-size:24px;margin-top:20px}.edition-range,.made{font:17px/1.8 Georgia,serif;color:#777}.made{margin-top:12px}

.paired-story{position:absolute;left:64px;right:64px;top:128px;bottom:64px;display:flex;flex-direction:column;gap:35px}.paired-pictures{display:flex;gap:28px;min-height:0;flex:1}.paired-pictures figure{flex:1;min-width:0}.paired-story>.fixed-prose{font-size:26px;max-width:880px;margin:auto}
`;
