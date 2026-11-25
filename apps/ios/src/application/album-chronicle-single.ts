import type {AlbumLayoutMediaInput,AlbumLayoutRecordInput} from './album-layout-input';
import type {PublicationBox} from './album-photo-composition';
import {photoFit} from './album-photo-composition';
import {splitPublicationText} from './album-publication-text';
import {chronicleFeeling} from './album-chronicle-feeling';

const valid=(n:number|undefined):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>0;
/** Extra room for wide Latin glyphs and capitals, not just a character count. */
function chronicleGlyphWidth(glyph:string):number{
 if(glyph===' ')return .4;
 if(glyph==='\t')return 1.2;
 if(/^[WMwm@%#&]$/.test(glyph))return 1.3;
 if(/^[A-Z]$/.test(glyph))return 1.1;
 return /^[\x20-\x7e]+$/.test(glyph)?.7:1.2;
}
export function chronicleLines(text:string,columns:number):number{
 const glyphs=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(s=>s.segment):Array.from(text);
 let lines=1,width=0;
 for(const glyph of glyphs){
  if(glyph==='\n'||glyph==='\r'||glyph==='\r\n'){lines++;width=0;continue;}
  const weight=chronicleGlyphWidth(glyph);
  if(width+weight>columns){lines++;width=0;}width+=weight;
 }
 return lines;
}
const pageLeadingBreaks=/^(?:[ \t]*(?:\r\n|\r|\n))+/;
const visibleProse=(text:string)=>text.replace(pageLeadingBreaks,'').trimEnd();
function proseMarkup(text:string,escape:(s:string)=>string):string{
 const leading=text.match(pageLeadingBreaks)?.[0]??'';
 const escaped=(s:string)=>escape(s).replace(/\r/g,'&#13;');
 return (leading?`<span class="chronicle-join" aria-hidden="true">${escaped(leading)}</span>`:'')+(()=>{const rest=text.slice(leading.length);const first=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(rest)][0]?.segment:Array.from(rest)[0];return first?`<span class="prose-initial">${escaped(first)}</span>${escaped(rest.slice(first.length))}`:'';})();
}
/** Paragraphs stay together where possible; oversized paragraphs safely continue.
 * Separators remain with the preceding paragraph. No character or grapheme is lost. */
export function chronicleProsePages(text:string):string[]{
 const units=text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)?.filter(Boolean)??[];
 const paragraphs:string[]=[];let paragraph='';
 for(const unit of units){paragraph+=unit;if(/(?:\r\n|\r|\n)$/.test(unit)&&!unit.replace(/[\r\n]/g,'').trim()){paragraphs.push(paragraph);paragraph='';}}
 if(paragraph)paragraphs.push(paragraph);
 const pages:string[]=[];let current='';
 for(const part of paragraphs){
  if(chronicleLines(visibleProse(current+part),28)<=9){current+=part;continue;}
  if(current){pages.push(current);current='';}
  const leading=part.match(pageLeadingBreaks)?.[0]??'';
  const chunks=splitPublicationText(part.slice(leading.length),28,9,chronicleGlyphWidth);
  if(leading&&chunks.length)chunks[0]=leading+chunks[0];
  while(chunks.length>1)pages.push(chunks.shift()!);
  current=chunks[0]??'';
 }
 if(current){if(!current.trim()&&pages.length)pages[pages.length-1]+=current;else pages.push(current);}
 return pages;
}
export type ChronicleSinglePlan={kind:'triptych'|'plate'|'portrait-short'|'landscape-short';photo:PublicationBox;target:number;shortText:boolean;fallback:boolean;unknownSize:boolean};
/** Use prepared/orientation-normalised dimensions, then ratio only, then contain.
 * max 2× enlargement on reading pages. Unknown dimensions never trigger cropping. */
export function planChronicleSingle(media:AlbumLayoutMediaInput,note:string):ChronicleSinglePlan{
 const known=valid(media.widthPx)&&valid(media.heightPx)&&Number.isSafeInteger(media.widthPx)&&Number.isSafeInteger(media.heightPx);
 const ratio=known?media.widthPx!/media.heightPx!:valid(media.intrinsicRatio??undefined)?media.intrinsicRatio!:null;
 const fit=(area:PublicationBox):PublicationBox=>{
  if(ratio==null)return {x:300,y:150,width:600,height:600};
  const h=known?media.heightPx!:1000,w=known?media.widthPx!:h*ratio;
  const scale=Math.min(area.width/w,area.height/h,known?2:Infinity),width=w*scale,height=h*scale;
  return {x:area.x+(area.width-width)/2,y:area.y+(area.height-height)/2,width,height};
 };
 const hasText=!!note.trim(),extreme=ratio==null||ratio<.4||ratio>2.5;
 const small=known&&Math.max(media.widthPx!,media.heightPx!)<600;
 const fallback=extreme||small||!known;
 const portrait=ratio!=null&&ratio<1;
 const short=hasText&&!fallback&&chronicleLines(note,portrait?15:36)<=(portrait?6:2);
 if(short){
  const area=portrait?{x:80,y:80,width:520,height:740}:{x:150,y:60,width:900,height:620};
  const photo=fit(area);
  return {kind:portrait?'portrait-short':'landscape-short',photo,target:0,shortText:true,fallback:false,unknownSize:false};
 }
 const triptych=!hasText&&!fallback&&ratio!=null&&photoFit({...media,intrinsicRatio:ratio},4/3)==='cover'&&Math.max(1200/media.widthPx!,900/media.heightPx!)<=2;
 const area=fallback?{x:80,y:72,width:1040,height:756}:{x:0,y:0,width:1200,height:900};
 return {kind:triptych?'triptych':'plate',photo:triptych?{x:0,y:0,width:1200,height:900}:fit(area),target:triptych?4/3:0,shortText:false,fallback,unknownSize:!known};
}
export function chronicleBinding(feeling:string,escape:(s:string)=>string):string{
 const color=chronicleFeeling(feeling);
 return color?`<span class="feeling-stripe" style="background:${color}" role="img" aria-label="${escape(feeling.trim())}"></span>`:'';
}
export function chronicleSingleBody(record:AlbumLayoutRecordInput,plan:ChronicleSinglePlan,linked:string,language:string,escape:(s:string)=>string):string{
 const b=plan.photo;
 const short=plan.shortText?`<div class="chronicle-short fixed-prose ${plan.kind==='portrait-short'?'short-side':'short-below'}">${plan.kind==='portrait-short'?'<span class="short-rule" aria-hidden="true"></span>':''}${escape(record.note).replace(/\r/g,'&#13;')}</div>`:'';
 return `<section class="chronicle-single single-photo-plate ${plan.kind==='triptych'?'continuous-triptych':''}" lang="${language}"><figure class="chronicle-photo" style="left:${b.x}px;top:${b.y}px;width:${b.width}px;height:${b.height}px">${linked}</figure>${plan.kind==='triptych'?'<span class="triptych-seam seam-one" aria-hidden="true"></span><span class="triptych-seam seam-two" aria-hidden="true"></span>':''}${short}${chronicleBinding(record.feeling,escape)}${record.attribution?`<p class="chronicle-attribution">${escape(record.attribution)}</p>`:''}</section>`;
}
export function chronicleProseBody(text:string,record:AlbumLayoutRecordInput,page:number,language:string,escape:(s:string)=>string):string{
 const color=chronicleFeeling(record.feeling)??'#829E96';
 return `<section class="chronicle-prose-page" lang="${language}">${chronicleBinding(record.feeling,escape)}<header class="chronicle-masthead">LAMPY<i aria-hidden="true"></i></header><span class="chronicle-prose-side" style="background:${color}" aria-hidden="true"></span><span class="prose-quote quote-open" aria-hidden="true">“</span><span class="prose-quote quote-close" aria-hidden="true">”</span><span class="prose-end-rule" aria-hidden="true"></span><div class="chronicle-prose fixed-prose">${proseMarkup(text,escape)}</div><footer class="chronicle-prose-footer"><span lang="en">Chronicle</span><span class="chronicle-folio">${String(page+1).padStart(2,'0')}</span></footer></section>`;
}
export const CHRONICLE_SINGLE_CSS=`
.chronicle-short,.chronicle-prose{font-family:Baskerville,"Palatino Linotype",Georgia,"Kaiti SC",STKaiti,KaiTi,"Songti SC","Noto Serif CJK SC",serif}

.chronicle-single,.chronicle-prose-page{position:absolute;inset:0;background:#faf9f5;color:#303a37;font-family:"Songti SC","Noto Serif CJK SC",Baskerville,Georgia,serif}
.chronicle-single:lang(en),.chronicle-prose-page:lang(en){font-family:Baskerville,"Palatino Linotype",Georgia,serif}
.chronicle-photo{position:absolute;margin:0}.chronicle-single .triptych-seam{background:#faf9f5}.feeling-stripe{width:16px;z-index:3}
.chronicle-short.fixed-prose{position:absolute;width:430px;font-size:30px;line-height:1.85;letter-spacing:.025em;overflow-wrap:anywhere;white-space:pre-wrap}.short-side{left:660px;top:240px;height:420px;display:flex;flex-direction:column;justify-content:center}.short-rule{display:block;flex:none;width:45px;border-top:2px solid #829E96;margin-bottom:30px}.chronicle-short.short-below{left:150px;top:720px;width:900px;font-size:28px}
.chronicle-attribution{position:absolute;right:60px;bottom:22px;font:16px/1.5 Georgia,"Songti SC",serif;color:#687870;background:#faf9f5;padding:2px 8px}
.chronicle-masthead{position:absolute;left:120px;right:120px;top:96px;font:17px/1.5 Georgia,serif;letter-spacing:5px;color:#105f62}.chronicle-masthead i{position:absolute;left:140px;right:0;top:12px;border-top:1px solid #b8cac4}
.chronicle-prose.fixed-prose{position:absolute;left:220px;top:215px;width:760px;font-size:29px;line-height:1.85;letter-spacing:.025em;white-space:pre-wrap;overflow-wrap:anywhere;tab-size:2}.chronicle-prose-page:lang(en) .chronicle-prose{font-size:30px;line-height:1.8;letter-spacing:0}
.chronicle-prose .prose-initial{float:left;display:block;font-size:72px;line-height:1;width:auto;margin:4px 12px 0 0;color:#105f62}
.prose-quote{position:absolute;font:110px/1 Baskerville,Georgia,serif;color:#829e96;opacity:.5;pointer-events:none}.quote-open{left:145px;top:172px}.quote-close{right:138px;top:654px}.prose-end-rule{position:absolute;left:220px;top:744px;width:48px;border-top:2px solid #829e96}
.chronicle-join{display:none}
.chronicle-prose-side{position:absolute;left:168px;top:222px;width:2px;height:64px}.chronicle-prose-footer{position:absolute;left:120px;right:120px;top:782px;border-top:1px solid #b8cac4;padding-top:22px;font:italic 21px/1.4 Baskerville,Georgia,serif;color:#687870}.chronicle-folio{float:right;font:19px/1.4 Georgia,serif;letter-spacing:.1em}
`;
