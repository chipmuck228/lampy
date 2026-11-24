import type {AlbumEpubOptions} from './album-epub';
import {PUBLICATION_OPENING,publicationSummary} from './album-publication';

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
 add('cover',input.album.name,`<div class="fixed-cover${coverPath?' has-photo':''}">${coverPath?`<div class="cover-photo"><img src="${escape(coverPath)}" alt="${heading}"/></div>`:''}<div class="cover-shade"></div><div class="cover-type"><p class="brand">LAMPY</p><h1 style="font-size:${input.album.name.length>50?48:76}px">${heading}</h1></div></div>`);
 const opening=input.album.opening?.trim()?input.album.opening:PUBLICATION_OPENING[language];
 splitPublicationText(opening,26,12).forEach((chunk,i)=>add(i?'opening-'+(i+1):'opening',zh?'开篇':'Preface',`<div class="opening-type"><div class="fixed-prose">${escape(chunk)}</div></div>`,i===0));
 let previous='';
 input.entries.forEach((record,index)=>{
  const date=dates[record.momentId]??{label:zh?'日子未确认':'Date uncertain',chapter:zh?'日子未确认':'Date uncertain'};
  const chapter=previous!==date.chapter;previous=date.chapter;
  const label=`<header class="fixed-meta">${chapter?`<h2>${escape(date.chapter)}</h2>`:''}<p>${escape(date.label)}${record.attribution?' · '+escape(record.attribution):''}${record.feeling?' · '+escape(record.feeling):''}</p></header>`;
  let page=0;const name=()=>`record-${index+1}${page?'-'+(page+1):''}`;
  const addRecord=(body:string)=>{add(name(),date.chapter,`${label}${body}`,chapter&&page===0);page++;};
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
 const stats=publicationSummary(input,language);
 add('archive',zh?'制作记录':'Edition notes',`<section class="edition-notes"><p class="brand">LAMPY</p><h1>${zh?'制作记录':'Edition notes'}</h1><p>${heading}</p><dl>${stats.map(s=>`<div><dt>${s.value}</dt><dd>${s.label}</dd></div>`).join('')}</dl><p class="made">${zh?'制作于':'Created on'} ${escape(options.createdAt.slice(0,10))}</p></section>`,true);
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
`;
