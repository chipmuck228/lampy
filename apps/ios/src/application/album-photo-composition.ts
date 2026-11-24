import type {AlbumLayoutInput} from './album-layout-input';
import {photoRatio} from './album-publication';
type Media=AlbumLayoutInput['entries'][number]['media'][number];
export type PhotoComposition={kind:'portrait-story'|'wide-story'|'diptych'|'triptych'|'portrait-sequence';ratios:number[]};
/** One visual language, content-sensitive variants. Never reorder or discard photographs. */
export function planPhotoComposition(media:Media[],hasNote=false):PhotoComposition|null{
 if(!media.length||media.length>3||media.some(m=>m.role!=='image'))return null;
 const height=hasNote?500:650;
 const ratios=media.map(m=>photoRatio(m));
 if(media.length===1)return ratios[0]!=null&&ratios[0]>1.2?{kind:'wide-story',ratios:[1072/height]}:{kind:'portrait-story',ratios:[4/5]};
 if(media.length===2)return {kind:'diptych',ratios:[524/height,524/height]};
 return ratios.every(r=>r!=null&&r<.9)?{kind:'portrait-sequence',ratios:[(1024/3)/height,(1024/3)/height,(1024/3)/height]}:{kind:'triptych',ratios:[524/height,524/((height-24)/2),524/((height-24)/2)]};
}
export function photoFit(media:Media,targetRatio:number):'cover'|'contain'{
 const ratio=photoRatio(media);if(ratio==null||!Number.isFinite(ratio)||ratio<=0)return 'contain';
 // Center cropping is bounded to 18% of source area; never guess a subject/focal point.
 return Math.min(ratio/targetRatio,targetRatio/ratio)>=.82?'cover':'contain';
}
