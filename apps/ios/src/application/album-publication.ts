import type {AlbumLayoutInput,AlbumLayoutMediaInput} from './album-layout-input';

export const PUBLICATION_VERSION='keepsake-v1' as const;
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
 'zh-Hans':{archive:'珍藏于此',line:'生活里的片刻，留给往后的自己。',records:'个瞬间',photos:'幅影像',voices:'段声音',chapter:'日子里的记录',made:'装订于',audioFallback:'若无法播放，请换用支持声音的阅读器。'},
 en:{archive:'A keepsake',line:'Ordinary moments, kept for the years ahead.',records:'moments',photos:'photographs',voices:'voices',chapter:'MOMENTS IN THESE PAGES',made:'Bound on',audioFallback:'If playback is unavailable, open this album in a reader that supports audio.'},
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
 if(coverEnd>=0&&!pages.some(p=>p.publication.kind==='archive'))pages.splice(coverEnd+1,0,{index:0,blocks:[],publication:{...body,kind:'archive',title:copy.archive,stats:publicationSummary(input,language),made:`${copy.made} ${layout.generatedAt.slice(0,10)}`}});
 return {...layout,pages:pages.map((page,index)=>({...page,index,rendering:{...page.rendering!,pageCount:pages.length,pageNumbers:false,photoBorderWidth:6}}))};
}
