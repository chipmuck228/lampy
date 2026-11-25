import {strFromU8} from 'fflate';
import {albumEpubDocuments,epubEscape,type AlbumEpubOptions} from './album-epub';
import {chronologicalBook,bookDay,LAMPY_PUBLICATION_SYMBOL} from './album-book-plan';
import {PUBLICATION_OPENING} from './album-publication';
import type {AlbumLayout} from './album-layout';
import {ALBUM_FONTS,ALBUM_LAYOUT_VERSION} from './album-layout';
import type {AlbumLayoutInput} from './album-layout-input';
import type {AlbumFontDiagnosis} from '../../modules/lampy-album-layout';

export type ChroniclePdfPage={name:string;html:string;notes:string[];images:string[];audio:string[];expectedText:string[]};
export type ChroniclePdfPublication={version:1;diagnosticTextDiff?:boolean;viewport:{width:number;height:number};css:string;symbol:string;albumName:string;opening:string;assets:{assetId:string;path:string}[];pages:ChroniclePdfPage[]};
const decode=(s:string)=>s.replace(/<[^>]*>/g,'').replace(/&#13;/g,'\r').replace(/&(?:amp|lt|gt|quot|apos);/g,v=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[v]!));
function prose(body:string):string[]{return [...body.matchAll(/<div\b[^>]*class="[^"]*\bfixed-prose\b[^"]*"[^>]*>([\s\S]*?)<\/div>/g)].map(m=>decode(m[1]));}
/** Use exactly the EPUB page composer and CSS. PDF only removes interactive controls.
 * Image dimensions are supplied by bounded native preparation before this is called. */
export function chroniclePdfLayout(input:AlbumLayoutInput,fonts:AlbumFontDiagnosis,language:'zh-Hans'|'en',createdAt:string,dates?:AlbumEpubOptions['dates']):AlbumLayout{
 const assets:AlbumEpubOptions['assets']={},imageAssets:ChroniclePdfPublication['assets']=[];let n=0;
 for(const entry of input.entries)for(const media of entry.media){
  if(assets[media.assetId])continue;
  const path=`media/asset-${n++}.${media.role==='image'?'jpg':'m4a'}`;
  assets[media.assetId]={path,mime:media.role==='image'?'image/jpeg':'audio/mp4'};
  if(media.role==='image')imageAssets.push({assetId:media.assetId,path});
 }
 let options:AlbumEpubOptions={input,assets,design:'imagebook',language,id:'chronicle-print',createdAt,dates:{}};
 options=chronologicalBook(options);
 options.dates=dates??Object.fromEntries(options.input.entries.map((r,i)=>{const day=bookDay(options,i);return [r.momentId,{label:day.label,chapter:day.label}];}));
 const docs=albumEpubDocuments(options),opf=strFromU8(docs['OEBPS/package.opf']);
 const order=[...opf.matchAll(/<itemref idref="([^"]+)"[^>]*\/>/g)].map(m=>m[1]);
 const byPath=new Map(Object.entries(assets).map(([id,a])=>[a.path,id]));
 const pages:ChroniclePdfPage[]=order.map(name=>{
  const original=strFromU8(docs[`OEBPS/${name}.xhtml`]);
  // Hidden complete-image views are interaction, never additional PDF content.
  const visible=original.replace(/<aside\b[^>]*class="photo-detail"[\s\S]*?<\/aside>/g,'');
  const images=[...visible.matchAll(/<a\b[^>]*class="photo-link"[^>]*>[\s\S]*?<img\b[^>]*src="([^"]+)"/g)].map(m=>byPath.get(m[1])!);
  const audio=[...visible.matchAll(/<audio\b[^>]*src="([^"]+)"/g)].map(m=>byPath.get(m[1])!);
  const notes=name.startsWith('record-')?prose(visible):[];
  const soundLabel=language==='zh-Hans'?'声音可在电子册中播放。':'Listen to this sound in the electronic album.';
  const html=visible.replace(/<script\b[\s\S]*?<\/script>/g,'')
   .replace(/<a\b([^>]*class="photo-link"[^>]*)>([\s\S]*?)<\/a>/g,(_,attrs,body)=>`<span${attrs.replace(/\s*href="[^"]*"/g,'')}>${body}</span>`)
   .replace(/<audio\b[\s\S]*?<\/audio>/g,`<p class="pdf-sound-note">${epubEscape(soundLabel)}</p>`);
  const expectedText=name==='cover'?[input.album.name]:notes;
  return {name,html,notes,images,audio,expectedText};
 });
 const opening=pages.filter(p=>p.name==='opening'||p.name.startsWith('opening-')).flatMap(p=>prose(p.html)).join('');
 const publication:ChroniclePdfPublication={version:1,viewport:{width:1200,height:900},css:strFromU8(docs['OEBPS/style.css'])+'\n.pdf-sound-note{font:24px/1.7 Georgia,"Songti SC",serif;color:#687870}.photo-detail{display:none!important}',symbol:LAMPY_PUBLICATION_SYMBOL,albumName:input.album.name,opening,assets:imageAssets,pages};
 const layout:AlbumLayout={albumId:input.album.id,language,layoutVersion:ALBUM_LAYOUT_VERSION,pageSize:{widthPt:600,heightPt:450},margins:{topPt:0,rightPt:0,bottomPt:0,leftPt:0},fonts:ALBUM_FONTS,fontFaces:{serif:fonts.serif.fontName,ui:fonts.ui.fontName,serifLicense:'System font; no font file bundled.',uiLicense:'System font; no font file bundled.',resolvedSerif:fonts.serif,resolvedUi:fonts.ui},sourceFingerprint:{name:input.album.name,opening:input.album.opening,cover:input.album.cover,entryOrder:options.input.entries.map(r=>r.momentId),moments:options.input.entries.map(r=>({momentId:r.momentId,presence:r.presence,revision:r.revision,media:r.media.map(m=>({assetId:m.assetId,role:m.role,availability:m.availability}))}))},albumUpdatedAt:input.album.updatedAt,generatedAt:createdAt,unicodeUnit:'unicode-scalar',pages:pages.map((_,index)=>({index,blocks:[]})),printPublication:publication};
 const checked=chroniclePdfIntegrity(layout,input);if(!checked.ok)throw new Error('INVALID_LAYOUT');
 return layout;
}
export function chroniclePdfIntegrity(layout:AlbumLayout,input:AlbumLayoutInput){
 const p=layout.printPublication;if(!p||p.version!==1||p.pages.length!==layout.pages.length||p.pages[0]?.name!=='cover'||p.pages.at(-1)?.name!=='archive')return {ok:false as const,reason:'publication-order'};
 const ordered=chronologicalBook({input,assets:{},id:'check',createdAt:'2026-11-25',language:layout.language??'zh-Hans',dates:{}}).input.entries;
 if(p.albumName!==input.album.name||p.opening!==(input.album.opening?.trim()?input.album.opening:PUBLICATION_OPENING[layout.language??'zh-Hans']))return {ok:false as const,reason:'publication-title'};
 if(p.pages.flatMap(v=>v.notes).join('')!==ordered.map(r=>r.note).join(''))return {ok:false as const,reason:'note-join'};
 const same=(a:string[],b:string[])=>a.length===b.length&&a.every((s,i)=>s===b[i]);
 for(const role of ['image','audio'] as const){
  const expected=ordered.flatMap(r=>r.media.filter(m=>m.role===role).map(m=>m.assetId));
  const actual=p.pages.flatMap(v=>role==='image'?v.images:v.audio);
  if(!same(actual,expected))return {ok:false as const,reason:role+'-count'};
 }
 return {ok:true as const};
}
