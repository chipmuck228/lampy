/* Candidate geometry for visual studies only; not wired to the app exporter. */
const GAP=24;
const box=(x,y,width,height)=>({x,y,width,height});
function row(s,area){
 const rs=s.map(p=>p.width/p.height),h=Math.min(area.height,(area.width-GAP)/(rs[0]+rs[1]),...s.map(p=>p.height*2));
 const widths=rs.map(r=>r*h),x=area.x+(area.width-widths[0]-widths[1]-GAP)/2,y=area.y+(area.height-h)/2;
 return [box(x,y,widths[0],h),box(x+widths[0]+GAP,y,widths[1],h)];
}
function column(s,area){
 const rs=s.map(p=>p.width/p.height),w=Math.min(area.width,(area.height-GAP)/(1/rs[0]+1/rs[1]),...s.map(p=>p.width*2));
 const hs=rs.map(r=>w/r),x=area.x+(area.width-w)/2,y=area.y+(area.height-hs[0]-hs[1]-GAP)/2;
 return [box(x,y,w,hs[0]),box(x,y+hs[0]+GAP,w,hs[1])];
}
const score=photos=>{const a=photos.map(p=>p.width*p.height);return .5*(a[0]+a[1])+.5*Math.min(...a)*2;};
const area=box(80,72,1040,756);
function planPair(s,text,fitsText){
 const fallback=s.some(p=>!Number.isFinite(p.width)||!Number.isFinite(p.height)||p.width<=0||p.height<=0||Math.max(p.width,p.height)<600||p.width/p.height<.4||p.width/p.height>2.5);
 if(fallback)return {kind:'separate',photos:s.map(p=>{const k=Math.min(area.width/p.width,area.height/p.height,2);return box(area.x+(area.width-p.width*k)/2,area.y+(area.height-p.height*k)/2,p.width*k,p.height*k);}),text:null,score:0};
 const candidates=[];
 const add=(kind,photos,textBox)=>{if(!text||textBox&&fitsText(text,textBox))candidates.push({kind,photos,text:textBox,score:score(photos)});};
 if(!text){add('equal-height',row(s,area),null);add('equal-width',column(s,area),null);}
 else{
  add('paired-below',row(s,box(80,72,1040,600)),box(180,720,840,108));
  add('stacked-side',column(s,box(80,72,560,756)),box(704,288,416,324));
  const ratios=s.map(p=>p.width/p.height);
  if((ratios[0]<1)!==(ratios[1]<1)){
   const portrait=ratios[0]<1?0:1,landscape=1-portrait;
   const h=Math.min(756,520/ratios[portrait],s[portrait].height*2),pw=h*ratios[portrait];
   const otherW=1040-pw-GAP,otherH=Math.min(otherW/ratios[landscape],s[landscape].height*2),otherActualW=otherH*ratios[landscape];
   const left=80,right=80+1040-pw,px=portrait===0?left:right,lx=portrait===0?left+pw+GAP:left;
   const th=190,ly=72+(756-otherH-GAP-th)/2;
   if(ly>=72){const photos=[];photos[portrait]=box(px,72+(756-h)/2,pw,h);photos[landscape]=box(lx+(otherW-otherActualW)/2,ly,otherActualW,otherH);add('mixed-story',photos,box(lx,ly+otherH+GAP,otherW,th));}
  }
 }
 if(!candidates.length){const plan=planPair(s,'',fitsText);return {...plan,kind:plan.kind+'-writing-next',writingNext:true};}
 candidates.sort((a,b)=>b.score-a.score);return candidates[0];
}
module.exports={planPair};
