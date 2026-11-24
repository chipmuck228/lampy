import type {AlbumEpubOptions} from './album-epub';
import {chronologicalBook} from './album-book-plan';

/** Shared design identity for future personal/family template selection; no feature gate is opened. */
export const CHRONICLE_TEMPLATE={id:'chronicle-v1',name:{'zh-Hans':'时序',en:'Chronicle'}} as const;
function typeWidth(text:string):number{return Array.from(text).reduce((sum,c)=>sum+(c===' '?.33:/^[\x21-\x7e]$/.test(c)?.68:1),0);}
export function coverDates(options:AlbumEpubOptions):{start:string;end:string}{
 const entries=chronologicalBook(options).input.entries.filter(e=>e.occurredAtPrecision!=='unknown'&&e.occurredAt&&Number.isFinite(Date.parse(e.occurredAt.length===4?e.occurredAt+'-01-01':e.occurredAt.length===7?e.occurredAt+'-01':e.occurredAt)));
 const label=(entry:typeof entries[number])=>{
  const raw=entry.occurredAt!.slice(0,entry.occurredAtPrecision==='year'?4:entry.occurredAtPrecision==='month'?7:10);
  const visible=entry.occurredAtPrecision==='year'||entry.occurredAtPrecision==='month'?raw:options.dates[entry.momentId]?.label??raw;
  return /^\d{4}(-\d{2}){0,2}$/.test(visible)?visible.replace(/-/g,'.'):visible;
 };
 const unknown=options.language==='zh-Hans'?'日期未确认':'Date uncertain';
 return entries.length?{start:label(entries[0]),end:label(entries[entries.length-1])}:{start:unknown,end:unknown};
}
/** One continuous photo behind a central typographic band, matching the Chronicle cover. */
export function chronicleCover(options:AlbumEpubOptions,photoPath:string,escape:(s:string)=>string):string{
 const {start,end}=coverDates(options),name=options.input.album.name;
 const weight=Math.max(1,typeWidth(name)),font=Math.max(26,Math.min(68,560/weight));
 const lines=Math.ceil(weight*font/560),height=Math.max(180,Math.ceil(lines*font*1.25+48)),top=(900-height)/2;
 const titleLanguage=/[\u3400-\u9fff]/u.test(name)?'zh-Hans':/[A-Za-z]/.test(name)?'en':options.language;
 const titleLang=titleLanguage!==options.language?` lang="${titleLanguage}"`:'';
 const side=(label:string)=>Math.max(16,Math.min(28,190/Math.max(1,typeWidth(label))));
 return `<section class="chronicle-cover${photoPath?' with-photo':' graphic-cover'}" data-template="${CHRONICLE_TEMPLATE.id}">${photoPath?`<img class="chronicle-photo" src="${escape(photoPath)}" alt="${escape(name)}"/>`:'<img class="chronicle-symbol" src="lampy-symbol.svg" alt=""/>'}<span class="chronicle-rule" style="top:${top-34}px" aria-hidden="true"></span><header class="chronicle-band" style="top:${top}px;height:${height}px"><p class="chronicle-date chronicle-start" style="font-size:${side(start)}px">${escape(start)}</p><span class="chronicle-divider divider-left" aria-hidden="true"></span><h1 class="chronicle-title"${titleLang} style="font-size:${font}px">${escape(name)}</h1><span class="chronicle-divider divider-right" aria-hidden="true"></span><p class="chronicle-date chronicle-end" style="font-size:${side(end)}px">${escape(end)}</p></header><span class="chronicle-rule" style="top:${top+height+34}px" aria-hidden="true"></span></section>`;
}
export const CHRONICLE_COVER_CSS=`
.chronicle-cover{position:absolute;inset:0;background:#e9eee8;color:#105f62}
.chronicle-photo{position:absolute;inset:0;width:1200px;height:900px;object-fit:cover;opacity:1}
.chronicle-band{position:absolute;left:0;right:0;background:#fff;display:flex;align-items:center;justify-content:center}
.chronicle-title{position:absolute;left:304px;width:592px;max-width:592px;top:24px;bottom:24px;display:flex;align-items:center;justify-content:center;text-align:center;font-family:"Songti SC","Noto Serif CJK SC",Georgia,serif;font-weight:700;line-height:1.25;letter-spacing:.025em;overflow-wrap:anywhere;white-space:pre-wrap}
.chronicle-title:lang(en){font-family:Baskerville,"Palatino Linotype",Palatino,Georgia,"Songti SC","Noto Serif CJK SC",serif;font-weight:600;letter-spacing:.025em}
.chronicle-date{position:absolute;top:50%;transform:translateY(-50%);width:220px;text-align:center;font-family:Georgia,"Songti SC",serif;font-style:italic;line-height:1.5;overflow-wrap:anywhere}
.chronicle-start{left:28px}.chronicle-end{right:28px}
.chronicle-divider{position:absolute;top:28%;bottom:28%;width:3px;background:#105f62}.divider-left{left:278px}.divider-right{right:278px}
.chronicle-rule{position:absolute;left:0;right:0;height:3px;background:#fff;pointer-events:none}
.chronicle-symbol{position:absolute;right:90px;bottom:65px;width:250px;height:250px;opacity:.25}
.graphic-cover{background:linear-gradient(150deg,#e5ece4,#cdded9)}
`;
