import {CHRONICLE_TEXT_COLOR} from './album-chronicle-colors';
import {chronicleFeeling} from './album-chronicle-feeling';
import type {AlbumLayoutInput,AlbumLayoutMediaInput} from './album-layout-input';

export const PUBLICATION_VERSION='keepsake-v2' as const;
export const PUBLICATION_OPENING={
 'zh-Hans':'把一些平常的日子，留在这里。\n留给往后的自己，也留给一起走过这些日子的人。',
 en:'Some ordinary days, kept here.\nFor our future selves, and for those who shared them with us.',
} as const;
export type PhotoComposition='single'|'diptych'|'triptych'|'contact';
export function photoRatio(media:Pick<AlbumLayoutMediaInput,'intrinsicRatio'|'widthPx'|'heightPx'>):number|null {
  const value=media.intrinsicRatio??(media.widthPx&&media.heightPx?media.widthPx/media.heightPx:null);
  return value!=null&&Number.isFinite(value)&&value>0?value:null;
}
/** Never changes order, crosses an audio item or crops a source photograph. */
export function photoComposition(ratios:readonly (number|null)[]):PhotoComposition {
  if(ratios.length<2||ratios.some(r=>r==null||!Number.isFinite(r)||r<=0))return 'single';
  const r=ratios as readonly number[];
  if(r.length>=4)return 'contact';
  if(r.length===3&&r[0]<.85&&r[1]>1.2&&r[2]>1.2)return 'triptych';
  if(r.length===2&&Math.abs(r[0]-r[1])<.4&&((r[0]<.85&&r[1]<.85)||(r[0]>=.85&&r[1]>=.85)))return 'diptych';
  return 'single';
}
export const PUBLICATION_COPY={
 'zh-Hans':{archive:'制作记录',line:'生活里的片刻，留给往后的自己。',records:'个瞬间',photos:'幅影像',voices:'段声音',chapter:'日子里的记录',made:'装订于',audioFallback:'若无法播放，请换用支持声音的阅读器。'},
 en:{archive:'Edition notes',line:'Ordinary moments, kept for the years ahead.',records:'moments',photos:'photographs',voices:'voices',chapter:'MOMENTS IN THESE PAGES',made:'Bound on',audioFallback:'If playback is unavailable, open this album in a reader that supports audio.'},
} as const;
export function publicationSummary(input:AlbumLayoutInput,language:'zh-Hans'|'en') {
 const copy=PUBLICATION_COPY[language];const photos=input.entries.reduce((n,e)=>n+e.media.filter(m=>m.role==='image').length,0),voices=input.entries.reduce((n,e)=>n+e.media.filter(m=>m.role==='audio').length,0);
 return [{value:input.entries.length,label:copy.records},{value:photos,label:copy.photos},{value:voices,label:copy.voices}];
}
export type PublicationPage={version:typeof PUBLICATION_VERSION;kind:'cover'|'archive'|'chapter'|'body'|'closing';title:string;eyebrow:string;line:string;ordinal?:string;stats?:{value:number;label:string}[];made?:string};

/** Decoration is frozen with a new print edition; previously saved PDFs are never regenerated. */
export function decoratePrintPublication(layout:import('./album-layout').AlbumLayout,input:AlbumLayoutInput):import('./album-layout').AlbumLayout {
 const language=layout.language??'zh-Hans',copy=PUBLICATION_COPY[language];
 const body:PublicationPage={version:PUBLICATION_VERSION,kind:'body',title:input.album.name,eyebrow:'LAMPY / A LIFE ALBUM',line:copy.line};
 const pages=layout.pages.map(page=>({...page,publication:page.publication??{...body,kind:page.blocks.some(b=>b.kind==='cover-name'||b.kind==='cover-image')?'cover':page.blocks.some(b=>b.kind==='close')?'closing':'body'}}));
 const coverEnd=pages.reduce((last,p,index)=>p.publication.kind==='cover'?index:last,-1);
 if(coverEnd>=0&&!pages.some(p=>p.publication.kind==='archive'))pages.push({index:0,blocks:[],publication:{...body,kind:'archive',title:copy.archive,stats:publicationSummary(input,language),made:`${copy.made} ${layout.generatedAt.slice(0,10)}`}});
 return {...layout,fonts:{...layout.fonts,body:{...layout.fonts.body,color:CHRONICLE_TEXT_COLOR}},pages:pages.map((page,index)=>{
   const sourceBlock=page.blocks.find(b=>'momentId' in b&&b.momentId);
   const id=sourceBlock&&'momentId' in sourceBlock?sourceBlock.momentId:undefined;
   const feeling=input.entries.find(e=>e.momentId===id)?.feeling??'';
   return {...page,index,rendering:{...page.rendering!,pageCount:pages.length,pageNumbers:false,photoBorderWidth:0,paper:'#faf9f5',chroniclePrint:true,bodyColor:CHRONICLE_TEXT_COLOR,bindingColor:chronicleFeeling(feeling)??undefined}};
 })};
}
