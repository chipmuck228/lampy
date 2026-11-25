import {CHRONICLE_TEXT_COLOR} from './album-chronicle-colors';
import type {AlbumLayoutMediaInput,AlbumLayoutRecordInput} from './album-layout-input';
import type {PublicationBox} from './album-photo-composition';
import {chronicleLines,chronicleBinding} from './album-chronicle-single';

type Point={x:number;y:number};
type Size={width:number;height:number};
export type ChroniclePhotoFrame=PublicationBox&{pad:number;foot:number;angle:number};
export type ChroniclePairPlan={kind:'collage'|'separate';frames:ChroniclePhotoFrame[]|null;photos:PublicationBox[];text:PublicationBox|null;occlusion:number;scale?:number};
const known=(m:AlbumLayoutMediaInput)=>Number.isSafeInteger(m.widthPx)&&Number.isSafeInteger(m.heightPx)&&m.widthPx!>0&&m.heightPx!>0;
function fitComplete(width:number,height:number):PublicationBox{
 const scale=Math.min(1040/width,756/height,2),w=width*scale,h=height*scale;
 return {x:(1200-w)/2,y:(900-h)/2,width:w,height:h};
}
const rect=(x:number,y:number,width:number,height:number):PublicationBox=>({x,y,width,height});
function polygon(b:PublicationBox,angle=0,center:PublicationBox=b):Point[]{
 const a=angle*Math.PI/180,cx=center.x+center.width/2,cy=center.y+center.height/2;
 return [[b.x,b.y],[b.x+b.width,b.y],[b.x+b.width,b.y+b.height],[b.x,b.y+b.height]].map(([x,y])=>({x:cx+(x-cx)*Math.cos(a)-(y-cy)*Math.sin(a),y:cy+(x-cx)*Math.sin(a)+(y-cy)*Math.cos(a)}));
}
const cross=(a:Point,b:Point,p:Point)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
function clip(poly:Point[],boundary:Point[]):Point[]{
 let out=poly;
 for(let i=0;i<boundary.length;i++){
  const a=boundary[i],b=boundary[(i+1)%boundary.length],input=out;out=[];
  if(!input.length)break;
  let s=input[input.length-1];
  for(const e of input){
   const se=cross(a,b,s),ee=cross(a,b,e),inside=ee>=0;
   if(inside!==(se>=0)){const t=se/(se-ee);out.push({x:s.x+t*(e.x-s.x),y:s.y+t*(e.y-s.y)});}
   if(inside)out.push(e);s=e;
  }
 }
 return out;
}
const area=(p:Point[])=>Math.abs(p.reduce((n,a,i)=>{const b=p[(i+1)%p.length];return n+a.x*b.y-b.x*a.y;},0))/2;
function photoRect(frame:ChroniclePhotoFrame):PublicationBox{return rect(frame.x+frame.pad,frame.y+frame.pad,frame.width-2*frame.pad,frame.height-frame.pad-frame.foot);}
function occlusion(frames:ChroniclePhotoFrame[]):number{return area(clip(polygon(photoRect(frames[0]),frames[0].angle,frames[0]),polygon(frames[1],frames[1].angle)))/(photoRect(frames[0]).width*photoRect(frames[0]).height);}
function planFromSizes(s:Size[],text:string,fitsText:(text:string,b:PublicationBox)=>boolean):ChroniclePairPlan{
 const fallback=s.some(p=>!Number.isFinite(p.width)||!Number.isFinite(p.height)||p.width<=0||p.height<=0||Math.max(p.width,p.height)<600||p.width/p.height<.4||p.width/p.height>2.5);
 if(fallback)return {kind:'separate',frames:null,photos:s.map(p=>fitComplete(p.width,p.height)),text:null,occlusion:0};
 const textBox=rect(800,252,320,396),short=!!text&&fitsText(text,textBox);
 const ratios=s.map(p=>p.width/p.height),portrait=ratios.every(r=>r<1);
 const widths=ratios.map((r,i)=>r<1?(i===0?308:296):(i===0?410:348));
 const frames=widths.map((w,i)=>({x:0,y:0,width:w+24,height:w/ratios[i]+48,pad:12,foot:36,angle:portrait?(i===0?-4:3):(i===0?-1.2:1.6)}));
 frames[1].x=frames[0].width-Math.min(96,frames[1].width*.29);
 frames[1].y=frames[0].height-Math.min(frames[0].height*.42,frames[1].height*.4);
 // Bound actual transformed image occlusion, rather than guessing from axis-aligned slots.
 for(let i=0;i<40&&occlusion(frames)>.10;i++){frames[1].x+=6;frames[1].y+=3;}
 if(occlusion(frames)>.10001)return {kind:'separate',frames:null,photos:s.map(p=>fitComplete(p.width,p.height)),text:null,occlusion:0};
 const corners=frames.flatMap(f=>polygon(f,f.angle));
 const minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x)),minY=Math.min(...corners.map(p=>p.y)),maxY=Math.max(...corners.map(p=>p.y));
 const target=short?rect(80,80,640,740):rect(140,80,920,740);
 const scale=Math.min(target.width/(maxX-minX),target.height/(maxY-minY),...s.map((p,i)=>p.width*2/widths[i]));
 const dx=target.x+(target.width-(maxX-minX)*scale)/2-minX*scale,dy=target.y+(target.height-(maxY-minY)*scale)/2-minY*scale;
 const placed=frames.map(f=>({...f,x:f.x*scale+dx,y:f.y*scale+dy,width:f.width*scale,height:f.height*scale,pad:f.pad*scale,foot:f.foot*scale}));
 for(const f of placed)for(const p of polygon(f,f.angle)){if(p.x<79.99||p.x>1120.01||p.y<71.99||p.y>828.01||short&&p.x>760.01)throw Error('Transformed collage outside safe area');}
 return {kind:'collage',frames:placed,photos:placed.map(photoRect),text:short?textBox:null,occlusion:occlusion(placed),scale};
}

export const chroniclePairCorners=(frame:ChroniclePhotoFrame)=>polygon(frame,frame.angle);
/** Only prepared pixel dimensions permit decorative overlap. Otherwise contain. */
export function planChroniclePair(media:AlbumLayoutMediaInput[],note:string,separate=false):ChroniclePairPlan{
 if(media.length!==2||media.some(m=>m.role!=='image'))throw Error('CHRONICLE_PAIR_REQUIRES_TWO_IMAGES');
 if(separate||media.some(m=>!known(m))){
  const photos=media.map(m=>{
   if(known(m))return fitComplete(m.widthPx!,m.heightPx!);
   const ratio=m.intrinsicRatio;
   return ratio!=null&&Number.isFinite(ratio)&&ratio>0?(ratio>=1?fitComplete(1000,1000/ratio):fitComplete(1000*ratio,1000)):rect(300,150,600,600);
  });
  return {kind:'separate',frames:null,photos,text:null,occlusion:0};
 }
 return planFromSizes(media.map(m=>({width:m.widthPx!,height:m.heightPx!})),note,(text,b)=>chronicleLines(text,Math.floor(b.width/29))<=Math.floor(b.height/(29*1.85)));
}
const geometry=(b:PublicationBox)=>`left:${b.x}px;top:${b.y}px;width:${b.width}px;height:${b.height}px`;
export function chroniclePairPhoto(plan:ChroniclePairPlan,index:number,linked:string):string{
 const b=plan.photos[index],frame=plan.frames?.[index];
 return `<figure class="chronicle-pair-photo ${frame?(index===0?'pair-frame-back':'pair-frame-front'):''}" style="${geometry(frame??b)}${frame?';transform:rotate('+frame.angle+'deg);transform-origin:center center':''}"><div style="position:absolute;${geometry(frame?{x:frame.pad,y:frame.pad,width:b.width,height:b.height}:{x:0,y:0,width:b.width,height:b.height})}">${linked}</div></figure>`;
}
export function chroniclePairBody(record:AlbumLayoutRecordInput,plan:ChroniclePairPlan,pictures:string[],language:string,escape:(s:string)=>string,attribution=true):string{
 const prose=plan.text?`<div class="chronicle-pair-copy" style="${geometry(plan.text)}"><div class="fixed-prose">${escape(record.note).replace(/\r/g,'&#13;')}</div></div>`:'';
 return `<section class="chronicle-pair-page" lang="${language}">${pictures.join('')}${prose}${chronicleBinding(record.feeling,escape)}${attribution&&record.attribution?`<p class="chronicle-attribution">${escape(record.attribution)}</p>`:''}</section>`;
}
export const CHRONICLE_PAIR_CSS=`
.chronicle-pair-page{position:absolute;inset:0;background:#faf9f5;color:${CHRONICLE_TEXT_COLOR};font-family:"Songti SC","Noto Serif CJK SC",Baskerville,Georgia,serif}.chronicle-pair-page:lang(en){font-family:Baskerville,"Palatino Linotype",Georgia,serif}
.chronicle-pair-photo{position:absolute;margin:0}.pair-frame-back{background:#354A41}.pair-frame-front{background:#E2E8DE}
.chronicle-pair-copy{position:absolute;display:flex;align-items:center}.chronicle-pair-copy>div{width:100%;white-space:pre-wrap;overflow-wrap:anywhere;tab-size:2;font-size:29px;line-height:1.85;letter-spacing:.025em}

.chronicle-pair-copy{font-family:Baskerville,"Palatino Linotype",Georgia,"Kaiti SC",STKaiti,KaiTi,"Songti SC","Noto Serif CJK SC",serif}
`;
