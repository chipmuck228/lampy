import type {AlbumLayoutInput} from './album-layout-input';
import {photoRatio} from './album-publication';
type Media=AlbumLayoutInput['entries'][number]['media'][number];
export type PublicationBox={x:number;y:number;width:number;height:number};
export type PhotoComposition={kind:'full-photo'|'portrait-story'|'wide-story'|'two-story'|'two-stacked'|'top-three'|'portrait-sequence'|'three-story';ratios:number[];photos:PublicationBox[];text:PublicationBox[]};
const box=(x:number,y:number,width:number,height:number):PublicationBox=>({x,y,width,height});
/** Reference-based geometry. Photos stay in source order; long text continues on following pages. */
export function planPhotoComposition(media:Media[],hasNote=false,alternate=false):PhotoComposition|null{
 if(!media.length||media.length>3||media.some(m=>m.role!=='image'))return null;
 const ratios=media.map(m=>photoRatio(m));
 const plan=(kind:PhotoComposition['kind'],photos:PublicationBox[],text:PublicationBox[]=[]):PhotoComposition=>({kind,photos,text,ratios:photos.map(p=>p.width/p.height)});
 if(media.length===1){
  if(!hasNote)return plan('full-photo',[box(0,100,1200,800)]);
  if(ratios[0]!=null&&ratios[0]>1.2)return plan('wide-story',[box(0,100,1200,400)],[box(80,550,1040,280)]);
  return plan('portrait-story',[box(alternate?600:0,100,600,800)],[box(alternate?60:660,290,480,480)]);
 }
 if(media.length===2){
  if(!hasNote)return plan('two-stacked',[box(0,100,1200,388),box(0,512,1200,388)]);
  return plan('two-story',[box(0,100,760,480),box(760,580,440,320)],[box(815,140,330,380),box(80,620,600,230)]);
 }
 if(hasNote)return plan('three-story',[box(0,100,588,388),box(612,100,588,388),box(0,512,588,388)],[box(660,550,480,300)]);
 if(ratios.every(r=>r!=null&&r<.9))return plan('portrait-sequence',[box(0,100,384,800),box(408,100,384,800),box(816,100,384,800)]);
 return plan('top-three',[box(0,100,1200,470),box(0,594,588,306),box(612,594,588,306)]);
}
export function photoFit(media:Media,targetRatio:number):'cover'|'contain'{
 const ratio=photoRatio(media);if(ratio==null||!Number.isFinite(ratio)||ratio<=0)return 'contain';
 // Center cropping is bounded to 18% of source area; never guess a subject/focal point.
 return Math.min(ratio/targetRatio,targetRatio/ratio)>=.82?'cover':'contain';
}
