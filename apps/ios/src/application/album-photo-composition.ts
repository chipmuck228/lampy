import type {AlbumLayoutInput} from './album-layout-input';
import {photoRatio} from './album-publication';
type Media=AlbumLayoutInput['entries'][number]['media'][number];
export type PublicationBox={x:number;y:number;width:number;height:number};
export type PhotoComposition={kind:'full-photo'|'portrait-story'|'wide-story'|'two-story'|'two-stacked'|'photo-row'|'top-three'|'side-three'|'portrait-sequence'|'three-story';ratios:number[];photos:PublicationBox[];text:PublicationBox[]};
export const PHOTO_SAFE_AREA={x:64,y:128,width:1072,height:700};
const gap=24;
const box=(x:number,y:number,width:number,height:number):PublicationBox=>({x,y,width,height});
const fit=(r:number,b:PublicationBox)=>{
 const width=Math.min(b.width,b.height*r),height=width/r;
 return box(b.x+(b.width-width)/2,b.y+(b.height-height)/2,width,height);
};
function row(rs:number[],b:PublicationBox):PublicationBox[]{
 const h=Math.min(b.height,(b.width-gap*(rs.length-1))/rs.reduce((a,r)=>a+r,0));
 const w=h*rs.reduce((a,r)=>a+r,0)+gap*(rs.length-1);let x=b.x+(b.width-w)/2;
 return rs.map(r=>{const out=box(x,b.y+(b.height-h)/2,h*r,h);x+=h*r+gap;return out;});
}
function column(rs:number[],b:PublicationBox):PublicationBox[]{
 const w=Math.min(b.width,(b.height-gap*(rs.length-1))/rs.reduce((a,r)=>a+1/r,0));
 const h=w*rs.reduce((a,r)=>a+1/r,0)+gap*(rs.length-1);let y=b.y+(b.height-h)/2;
 return rs.map(r=>{const out=box(b.x+(b.width-w)/2,y,w,w/r);y+=w/r+gap;return out;});
}
function sideThree(rs:number[],b:PublicationBox):PublicationBox[]{
 const inv=1/rs[1]+1/rs[2];
 const h=Math.min(b.height,(b.width-gap+gap/inv)/(rs[0]+1/inv));
 const left=h*rs[0],right=(h-gap)/inv,w=left+gap+right,x=b.x+(b.width-w)/2,y=b.y+(b.height-h)/2;
 return [box(x,y,left,h),box(x+left+gap,y,right,right/rs[1]),box(x+left+gap,y+right/rs[1]+gap,right,right/rs[2])];
}
function topThree(rs:number[],b:PublicationBox):PublicationBox[]{
 const sum=rs[1]+rs[2];
 const w=Math.min(b.width,(b.height-gap+gap/sum)/(1/rs[0]+1/sum));
 const top=w/rs[0],bottom=(w-gap)/sum,h=top+gap+bottom,x=b.x+(b.width-w)/2,y=b.y+(b.height-h)/2;
 return [box(x,y,w,top),box(x,y+top+gap,bottom*rs[1],bottom),box(x+bottom*rs[1]+gap,y+top+gap,bottom*rs[2],bottom)];
}
const score=(photos:PublicationBox[])=>{
 const areas=photos.map(p=>p.width*p.height);
 return .5*areas.reduce((a,n)=>a+n,0)+.5*Math.min(...areas)*photos.length;
};
/** Compute actual image rectangles, then compare coverage and size balance. No hidden contain boxes. */
export function planPhotoComposition(media:Media[],hasNote=false,alternate=false,noteLength=120):PhotoComposition|null{
 if(!media.length||media.length>3||media.some(m=>m.role!=='image'))return null;
 const rs=media.map(m=>{const r=photoRatio(m);return r!=null&&Number.isFinite(r)&&r>0?r:4/3;});
 const b=PHOTO_SAFE_AREA;
 const plan=(kind:PhotoComposition['kind'],photos:PublicationBox[],text:PublicationBox[]=[]):PhotoComposition=>({kind,photos,text,ratios:photos.map(p=>p.width/p.height)});
 if(!hasNote){
  if(rs.length===1)return plan('full-photo',[fit(rs[0],b)]);
  const candidates=[plan(rs.length===3?'portrait-sequence':'photo-row',row(rs,b)),plan(rs.length===2?'two-stacked':'top-three',rs.length===2?column(rs,b):topThree(rs,b))];
  if(rs.length===3)candidates.push(plan('side-three',sideThree(rs,b)));
  candidates.sort((a,c)=>score(c.photos)-score(a.photos));
  return candidates[0];
 }
 if(rs.length===1){
  if(rs[0]>1.8){
   const image=fit(rs[0],box(b.x,b.y,b.width,460));
   return plan('wide-story',[image],[box(b.x+40,b.y+500,b.width-80,180)]);
  }
  const imageWidth=rs[0]<1?510:650,textWidth=b.width-imageWidth-48;
  const imageX=alternate?b.x+textWidth+48:b.x,textX=alternate?b.x:b.x+imageWidth+48;
  return plan('portrait-story',[fit(rs[0],box(imageX,b.y,imageWidth,b.height))],[box(textX,b.y+50,textWidth,b.height-100)]);
 }
 if(rs.length===2){
  const textHeight=noteLength<=90?144:240;
  const photoHeight=b.height-textHeight-40;
  return plan('two-story',row(rs,box(b.x,b.y,b.width,photoHeight)),[box(b.x+35,b.y+photoHeight+40,b.width-70,textHeight)]);
 }
 const w=(b.width-gap)/2,h=(b.height-gap)/2;
 const frames=[box(b.x,b.y,w,h),box(b.x+w+gap,b.y,w,h),box(b.x,b.y+h+gap,w,h)];
 // Preserve the accepted four-quadrant composition. Only modest crops may fill a frame.
 const photos=frames.map((frame,i)=>Math.min(rs[i]/(w/h),(w/h)/rs[i])>=.82?frame:fit(rs[i],frame));
 return plan('three-story',photos,[box(b.x+w+gap+40,b.y+h+gap+35,w-80,h-70)]);
}
export function photoFit(media:Media,targetRatio:number):'cover'|'contain'{
 const ratio=photoRatio(media);if(ratio==null||!Number.isFinite(ratio)||ratio<=0)return 'contain';
 // Center cropping is bounded to 18% of source area; never guess a subject/focal point.
 return Math.min(ratio/targetRatio,targetRatio/ratio)>=.82?'cover':'contain';
}
