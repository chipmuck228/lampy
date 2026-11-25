import {JSDOM} from 'jsdom';
import {strFromU8} from 'fflate';
import type {AlbumEpubOptions} from './album-epub';
import type {AlbumLayoutMediaInput} from './album-layout-input';
import {albumEpubDocuments} from './album-epub';
import {planChroniclePair,chroniclePairCorners} from './album-chronicle-pair';
const image=(assetId:string,widthPx?:number,heightPx?:number):AlbumLayoutMediaInput=>({assetId,role:'image',availability:'available',widthPx,heightPx,intrinsicRatio:null,durationMs:null});
const options=(media:AlbumLayoutMediaInput[],note=''):AlbumEpubOptions=>({input:{album:{id:'album',schemaVersion:1,name:'日子',opening:null,cover:{kind:'words'},entries:[],createdAt:'',updatedAt:''},entries:[{momentId:'private',collectedAt:'',sourceRevisionAtCollect:1,presence:'ready',revision:1,note,attribution:'妈妈 & 爸爸',feeling:'感动',occurredAt:'2026-07-01',occurredAtPrecision:'day',recordedAt:'',media}]},assets:{a:{path:'media/a.jpg',mime:'image/jpeg'},b:{path:'media/b.jpg',mime:'image/jpeg'},sound:{path:'media/sound.m4a',mime:'audio/mp4'}},language:'zh-Hans',design:'imagebook',id:'pair',createdAt:'2026-11-25',dates:{}});
const xml=(v:Uint8Array)=>new JSDOM(strFromU8(v),{contentType:'application/xml'}).window.document;
it.each([[1200,1800,1200,1587],[1400,932,1200,750],[1400,932,1200,1587],[1200,1800,1400,932],[1000,1000,1200,1200],[600,1500,1500,600]])('keeps transformed %i×%i / %i×%i photographs inside the safe area',(w,h,w2,h2)=>{
 const media=[image('a',w,h),image('b',w2,h2)];
 for(const note of ['', '一起走过的日子。\n慢慢留在这一册里。']){
  const plan=planChroniclePair(media,note);expect(plan.kind).toBe('collage');expect(plan.occlusion).toBeLessThanOrEqual(.10001);
  plan.frames!.forEach((frame,i)=>{
   const photo=plan.photos[i];expect(photo.width/photo.height).toBeCloseTo(media[i].widthPx!/media[i].heightPx!);expect(photo.width/media[i].widthPx!).toBeLessThanOrEqual(2);
   expect(frame.foot).toBeGreaterThan(frame.pad);
   for(const p of chroniclePairCorners(frame)){expect(p.x).toBeGreaterThanOrEqual(79.99);expect(p.x).toBeLessThanOrEqual(plan.text?760.01:1120.01);expect(p.y).toBeGreaterThanOrEqual(71.99);expect(p.y).toBeLessThanOrEqual(828.01);}
  });
  if(note)expect(plan.text).toMatchObject({x:800,width:320});
 }
});
it.each([[160,107],[600,3600],[1400,175],[undefined,undefined],[NaN,-1]])('separates small, extreme or unmeasured images (%s×%s), never guessing a decorative crop',(w,h)=>{
 const plan=planChroniclePair([image('a',1200,1800),image('b',w,h)],'短文');expect(plan.kind).toBe('separate');expect(plan.frames).toBeNull();expect(plan.text).toBeNull();
 for(const b of plan.photos){expect([b.x,b.y,b.width,b.height].every(Number.isFinite)).toBe(true);expect(b.x).toBeGreaterThanOrEqual(80);expect(b.y).toBeGreaterThanOrEqual(72);expect(b.x+b.width).toBeLessThanOrEqual(1120);expect(b.y+b.height).toBeLessThanOrEqual(828);}
});
it('puts short writing beside the photos without a repeated date, and omits reference icons',()=>{
 const files=albumEpubDocuments(options([image('a',1200,1800),image('b',1200,1587)],'一起走过的日子。'));
 const d=xml(files['OEBPS/record-1.xhtml']);expect(d.querySelectorAll('.chronicle-pair-photo')).toHaveLength(2);expect(d.querySelector('.chronicle-pair-copy')!.textContent).toBe('一起走过的日子。');
 expect(d.querySelector('.fixed-meta,svg,script')).toBeNull();expect(d.querySelector('.pair-frame-back')).not.toBeNull();expect(d.querySelector('.pair-frame-front')).not.toBeNull();
 expect(d.querySelector('.feeling-stripe')!.getAttribute('style')).toContain('#9FBAB0');expect(d.body.textContent).toContain('妈妈 & 爸爸');
});
it('retains full-image return anchors on each separate photo page',()=>{
 const files=albumEpubDocuments(options([image('a',1200,1800),image('b',160,107)],'短文'));
 for(const [i,name]of ['record-1','record-1-2'].entries()){
  const source=xml(files['OEBPS/'+name+'.xhtml']),link=source.querySelector('.photo-link')!,target=link.getAttribute('href')!;
  expect(link.querySelector('img')!.getAttribute('src')).toBe(i?'media/b.jpg':'media/a.jpg');expect(link.querySelector('img')!.getAttribute('style')).toContain('contain');
  expect(xml(files['OEBPS/'+target]).querySelector('.photo-return')!.getAttribute('href')).toBe(name+'.xhtml#'+link.id);
 }
 expect(xml(files['OEBPS/record-1-3.xhtml']).querySelector('.chronicle-prose')!.textContent).toBe('短文');
});
it('preserves long Unicode/CRLF prose in decorated continuation pages',()=>{
 const note=('这一段完整保留 👨‍👩‍👦 é & <script>。\r\n\r\n').repeat(50),files=albumEpubDocuments(options([image('a',1400,932),image('b',1200,1800)],note));
 expect(xml(files['OEBPS/record-1.xhtml']).querySelector('.fixed-prose')).toBeNull();
 const pages=Object.entries(files).filter(([name])=>/OEBPS\/record-.*xhtml$/.test(name)).map(([,v])=>xml(v));
 expect(pages.flatMap(d=>[...d.querySelectorAll('.fixed-prose')].map(n=>n.textContent)).join('')).toBe(note);
 expect(pages.every(d=>d.querySelector('.feeling-stripe'))).toBe(true);
 expect(pages.slice(1).every(d=>d.querySelector('.chronicle-masthead'))).toBe(true);
});
it.each([{order:['sound','a','b']},{order:['a','sound','b']},{order:['a','b','sound']}])('retains source media order and independent audio for $order',({order})=>{
 const images={a:image('a',1200,1800),b:image('b',1400,932),sound:{assetId:'sound',role:'audio',availability:'available',intrinsicRatio:null,durationMs:42000} as AlbumLayoutMediaInput};
 const files=albumEpubDocuments(options(order.map(id=>images[id as keyof typeof images]),'短文'));
 const docs=Object.entries(files).filter(([name])=>/OEBPS\/record-.*xhtml$/.test(name)).map(([,v])=>xml(v));
 expect(docs.flatMap(d=>[...d.querySelectorAll('img,audio')].map(n=>n.getAttribute('src')))).toEqual(order.map(id=>'media/'+(id==='sound'?'sound.m4a':id+'.jpg')));
 expect(docs.filter(d=>d.querySelector('audio')).every(d=>!d.querySelector('img'))).toBe(true);
 for(const d of docs)for(const link of d.querySelectorAll('.photo-link'))expect(xml(files['OEBPS/'+link.getAttribute('href')]).querySelector('.photo-return')!.getAttribute('href')).toContain('#'+link.id);
});
