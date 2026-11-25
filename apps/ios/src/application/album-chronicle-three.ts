import type {AlbumLayoutMediaInput,AlbumLayoutRecordInput} from './album-layout-input';
import type {PublicationBox} from './album-photo-composition';
import {chronicleLines,chronicleBinding} from './album-chronicle-single';
const gap=10,box=(x:number,y:number,width:number,height:number)=>({x,y,width,height});
function wall(s:{width:number;height:number}[]):PublicationBox[]{
 const rs=s.map(p=>p.width/p.height),b=box(64,64,1072,772),candidates:PublicationBox[][]=[];
 const rowH=Math.min(b.height,(b.width-2*gap)/rs.reduce((a,r)=>a+r,0));let x=b.x+(b.width-rowH*rs.reduce((a,r)=>a+r,0)-2*gap)/2;
 candidates.push(rs.map(r=>{const p=box(x,b.y+(b.height-rowH)/2,rowH*r,rowH);x+=p.width+gap;return p;}));
 const inv=1/rs[1]+1/rs[2],h=Math.min(b.height,(b.width-gap+gap/inv)/(rs[0]+1/inv)),left=h*rs[0],right=(h-gap)/inv;
 x=b.x+(b.width-left-gap-right)/2;let y=b.y+(b.height-h)/2;
 candidates.push([box(x,y,left,h),box(x+left+gap,y,right,right/rs[1]),box(x+left+gap,y+right/rs[1]+gap,right,right/rs[2])]);
 const sum=rs[1]+rs[2],w=Math.min(b.width,(b.height-gap+gap/sum)/(1/rs[0]+1/sum)),top=w/rs[0],bottom=(w-gap)/sum;
 x=b.x+(b.width-w)/2;y=b.y+(b.height-top-gap-bottom)/2;
 candidates.push([box(x,y,w,top),box(x,y+top+gap,bottom*rs[1],bottom),box(x+bottom*rs[1]+gap,y+top+gap,bottom*rs[2],bottom)]);
 const score=(p:PublicationBox[])=>{const a=p.map(p=>p.width*p.height);return .5*a.reduce((a,n)=>a+n,0)+.5*Math.min(...a)*3;};
 candidates.sort((a,b)=>score(b)-score(a));const photos=candidates[0];
 for(let i=0;i<3;i++){
  const p=photos[i];if(p.x<63.99||p.y<63.99||p.x+p.width>1136.01||p.y+p.height>836.01||Math.abs(p.width/p.height-rs[i])>1e-8||p.width/s[i].width>2.001)throw Error('Unsafe wall geometry');
 }
 return photos;
}

export function planChronicleThree(media:AlbumLayoutMediaInput[],note:string){
 const safe=media.length===3&&media.every(m=>Number.isSafeInteger(m.widthPx)&&Number.isSafeInteger(m.heightPx)&&m.widthPx!>=600&&m.heightPx!>=600&&m.widthPx!/m.heightPx!>=.4&&m.widthPx!/m.heightPx!<=2.5);
 if(!safe)return null;
 let photos:PublicationBox[];
 try{photos=wall(media.map(m=>({width:m.widthPx!,height:m.heightPx!})));}catch{return null;}
 const mode=!note.trim()?null:chronicleLines(note,9)<=2?'circle':chronicleLines(note,16)<=4?'rect':null;
 const minX=Math.min(...photos.map(b=>b.x)),maxX=Math.max(...photos.map(b=>b.x+b.width)),minY=Math.min(...photos.map(b=>b.y)),maxY=Math.max(...photos.map(b=>b.y+b.height));
 const overlay=mode==='circle'?box(minX+(maxX-minX)*.57-150,minY+(maxY-minY)*.36-150,300,300):mode==='rect'?box(maxX-504,maxY-282,480,250):null;
 // Narrow photo walls cannot safely accommodate a text plate.
 const inside=overlay&&overlay.x>=64&&overlay.y>=64&&overlay.x+overlay.width<=1136&&overlay.y+overlay.height<=836;
 return {photos,mode:inside?mode:null,overlay:inside?overlay:null};
}
export function chronicleThreeBody(record:AlbumLayoutRecordInput,plan:NonNullable<ReturnType<typeof planChronicleThree>>,links:string[],language:string,escape:(s:string)=>string){
 const style=(b:PublicationBox)=>`left:${b.x}px;top:${b.y}px;width:${b.width}px;height:${b.height}px`;
 return `<section class="chronicle-three" lang="${language}">${plan.photos.map((b,i)=>`<figure class="three-photo" style="${style(b)}">${links[i]}</figure>`).join('')}${plan.overlay?`<div class="three-overlay ${plan.mode}" style="${style(plan.overlay)}"><div class="fixed-prose">${escape(record.note)}</div></div>`:''}${chronicleBinding(record.feeling,escape)}${record.attribution?`<p class="chronicle-attribution">${escape(record.attribution)}</p>`:''}</section>`;
}
export const CHRONICLE_THREE_CSS=`.chronicle-three{position:absolute;inset:0;background:#faf9f5;font-family:"Songti SC","Noto Serif CJK SC",Baskerville,Georgia,serif}.chronicle-three:lang(en){font-family:Baskerville,"Palatino Linotype",Georgia,serif}.three-photo{position:absolute;margin:0}.three-photo img{object-fit:contain}.three-overlay{position:absolute;display:flex;align-items:center;justify-content:center;color:#25231F;box-sizing:border-box}.three-overlay>div{font:inherit;width:100%;white-space:pre-wrap;overflow-wrap:anywhere;letter-spacing:.015em}.three-overlay.circle{border-radius:50%;background:rgba(250,249,245,.80);padding:44px;text-align:center;font-size:30px;line-height:1.75}.three-overlay.rect{border-radius:14px;background:rgba(250,249,245,.86);padding:30px 32px;font-size:28px;line-height:1.7;text-align:left}`;
