/* Candidate scrapbook composition only; no production export dependency. */
const {planPair}=require('./publication-pair-plan.cjs');
const rect=(x,y,width,height)=>({x,y,width,height});
function polygon(b,angle=0,center=b){
 const a=angle*Math.PI/180,cx=center.x+center.width/2,cy=center.y+center.height/2;
 return [[b.x,b.y],[b.x+b.width,b.y],[b.x+b.width,b.y+b.height],[b.x,b.y+b.height]].map(([x,y])=>({x:cx+(x-cx)*Math.cos(a)-(y-cy)*Math.sin(a),y:cy+(x-cx)*Math.sin(a)+(y-cy)*Math.cos(a)}));
}
const cross=(a,b,p)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
function clip(poly,boundary){
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
const area=p=>Math.abs(p.reduce((n,a,i)=>{const b=p[(i+1)%p.length];return n+a.x*b.y-b.x*a.y;},0))/2;
function photoRect(frame){return rect(frame.x+frame.pad,frame.y+frame.pad,frame.width-2*frame.pad,frame.height-frame.pad-frame.foot);}
function occlusion(frames){return area(clip(polygon(photoRect(frames[0]),frames[0].angle,frames[0]),polygon(frames[1],frames[1].angle)))/(photoRect(frames[0]).width*photoRect(frames[0]).height);}
function planCollage(s,text,fitsText){
 const fallback=s.some(p=>!Number.isFinite(p.width)||!Number.isFinite(p.height)||p.width<=0||p.height<=0||Math.max(p.width,p.height)<600||p.width/p.height<.4||p.width/p.height>2.5);
 if(fallback)return planPair(s,text,()=>false);
 const textBox=rect(800,252,320,396),short=!!text&&fitsText(text,textBox);
 const ratios=s.map(p=>p.width/p.height),portrait=ratios.every(r=>r<1);
 const widths=ratios.map((r,i)=>r<1?(i===0?308:296):(i===0?410:348));
 const frames=widths.map((w,i)=>({x:0,y:0,width:w+24,height:w/ratios[i]+48,pad:12,foot:36,angle:portrait?(i===0?-4:3):(i===0?-1.2:1.6)}));
 frames[1].x=frames[0].width-Math.min(96,frames[1].width*.29);
 frames[1].y=frames[0].height-Math.min(frames[0].height*.42,frames[1].height*.4);
 // Bound actual transformed image occlusion, rather than guessing from axis-aligned slots.
 for(let i=0;i<40&&occlusion(frames)>.10;i++){frames[1].x+=6;frames[1].y+=3;}
 if(occlusion(frames)>.10001)throw Error('Collage occlusion exceeds 10%');
 const corners=frames.flatMap(f=>polygon(f,f.angle));
 const minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x)),minY=Math.min(...corners.map(p=>p.y)),maxY=Math.max(...corners.map(p=>p.y));
 const target=short?rect(80,80,640,740):rect(140,80,920,740);
 const scale=Math.min(target.width/(maxX-minX),target.height/(maxY-minY),...s.map((p,i)=>p.width*2/widths[i]));
 const dx=target.x+(target.width-(maxX-minX)*scale)/2-minX*scale,dy=target.y+(target.height-(maxY-minY)*scale)/2-minY*scale;
 const placed=frames.map(f=>({...f,x:f.x*scale+dx,y:f.y*scale+dy,width:f.width*scale,height:f.height*scale,pad:f.pad*scale,foot:f.foot*scale}));
 for(const f of placed)for(const p of polygon(f,f.angle)){if(p.x<79.99||p.x>1120.01||p.y<71.99||p.y>828.01||short&&p.x>760.01)throw Error('Transformed collage outside safe area');}
 return {kind:'collage',frames:placed,photos:placed.map(photoRect),text:short?textBox:null,occlusion:occlusion(placed),scale};
}
module.exports={planCollage};
