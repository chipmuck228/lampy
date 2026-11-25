import type {AlbumLayoutMediaInput} from './album-layout-input';
import type {AlbumBox} from './album-layout';
import {chronicleWall} from './album-chronicle-three';
import {photoRatio} from './album-publication';

/** A5 print adaptation. Preserve complete photos and native selectable text.
 * Print pairs are staggered without overlap; three-photo walls reuse Chronicle geometry.
 * Tiny/unknown/extreme images always get independent plates. */
export function printPhotoGroups(media:AlbumLayoutMediaInput[],area:AlbumBox):AlbumBox[][]{
 const fit=(m:AlbumLayoutMediaInput,b:AlbumBox):AlbumBox=>{
  const r=photoRatio(m);if(r==null)return b;
  const maxHeight=m.heightPx&&Number.isFinite(m.heightPx)&&m.heightPx>0?m.heightPx*2:Infinity;
  const scale=Math.min(b.widthPt/r,b.heightPt,maxHeight),w=scale*r,h=scale;
  return {xPt:b.xPt+(b.widthPt-w)/2,yPt:b.yPt+(b.heightPt-h)/2,widthPt:w,heightPt:h};
 };
 const safe=media.every(m=>Number.isSafeInteger(m.widthPx)&&Number.isSafeInteger(m.heightPx)&&Math.max(m.widthPx!,m.heightPx!)>=600&&photoRatio(m)!=null&&photoRatio(m)!>=.4&&photoRatio(m)!<=2.5);
 if(!safe||media.length>3)return media.map(m=>[fit(m,area)]);
 if(media.length===3){
  try{
   const photos=chronicleWall(media.map(m=>({width:m.widthPx!,height:m.heightPx!})),{x:area.xPt,y:area.yPt,width:area.widthPt,height:area.heightPt},3.2);
   return [photos.map(p=>({xPt:p.x,yPt:p.y,widthPt:p.width,heightPt:p.height}))];
  }catch{return media.map(m=>[fit(m,area)]);}
 }
 if(media.length===2){
  const gap=8,w=(area.widthPt-gap)/2,offset=28;
  return [[fit(media[0],{xPt:area.xPt,yPt:area.yPt,widthPt:w,heightPt:area.heightPt-offset}),fit(media[1],{xPt:area.xPt+w+gap,yPt:area.yPt+offset,widthPt:w,heightPt:area.heightPt-offset})]];
 }
 return media.map(m=>[fit(m,area)]);
}
