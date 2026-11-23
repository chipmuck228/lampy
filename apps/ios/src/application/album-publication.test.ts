import {photoComposition,photoRatio,publicationSummary,decoratePrintPublication} from './album-publication';
import {paginateAlbumLayout} from './album-paginate';
import {createGlyphWidthMeasurer} from './album-text-measure';
import {albumLayoutIntegrity} from './album-layout-integrity';
import {validatePrintLayout} from './album-print';
import type {AlbumLayoutInput,AlbumLayoutRecordInput} from './album-layout-input';
const photo=(assetId:string,r:number)=>({assetId,role:'image' as const,availability:'available' as const,intrinsicRatio:r,durationMs:null,uri:`file:///${assetId}`});
const record=(momentId:string,month:string,media:AlbumLayoutRecordInput['media']=[]):AlbumLayoutRecordInput=>({momentId,collectedAt:'',sourceRevisionAtCollect:1,presence:'ready',revision:1,note:'原来的话。🦞\n没有删改。'.repeat(30),feeling:'',occurredAt:month?`2026-${month}-01T00:00:00Z`:undefined,occurredAtPrecision:month?'day':'unknown',recordedAt:'2026-11-23T00:00:00Z',media});
const input:AlbumLayoutInput={album:{id:'private-book',schemaVersion:1,name:'那些普通的日子',opening:'原来的开篇。',cover:{kind:'words'},entries:[],createdAt:'',updatedAt:''},entries:[record('a','11',[photo('p1',.65),photo('p2',1.5),photo('p3',1.5)]),record('b','10',[0,1,2,3].map(i=>photo('c'+i,1.5))),record('c','11'),record('d','')]};
it('chooses geometry conservatively and rejects unsafe ratios',()=>{
 expect(photoRatio({intrinsicRatio:NaN})).toBeNull();expect(photoRatio({intrinsicRatio:null,widthPx:1200,heightPx:1800})).toBeCloseTo(2/3);
 expect(photoComposition([.65,1.5,1.5])).toBe('triptych');expect(photoComposition([.7,.72])).toBe('diptych');expect(photoComposition([1.5,1.6])).toBe('diptych');expect(photoComposition([1,1,1,1])).toBe('contact');expect(photoComposition([.3,4])).toBe('single');expect(photoComposition([null,1,1,1])).toBe('single');
 expect(publicationSummary(input,'en').map(s=>s.value)).toEqual([4,7,0]);
});
it('adds print-only chapter rhythm and archive page, preserves source order, all text and every image',async()=>{
 const layout=await paginateAlbumLayout(input,createGlyphWidthMeasurer(),{generatedAt:'2026-11-23T00:00:00Z',timezone:{timeZone:'UTC'},publication:true});
 const edition=decoratePrintPublication(layout,input);validatePrintLayout(edition);expect(albumLayoutIntegrity(edition,input)).toEqual({ok:true});
 expect(edition.pages.filter(p=>p.publication?.kind==='archive')).toHaveLength(1);
 expect(edition.pages.filter(p=>p.publication?.kind==='chapter').map(p=>p.publication!.title)).toEqual(['2026年11月','2026年10月','2026年11月','发生时间未确认']);
 expect(edition.pages.filter(p=>p.publication?.kind==='chapter').map(p=>p.publication!.ordinal)).toEqual(['01','02','03','04']);
 expect(edition.pages.flatMap(p=>p.blocks).filter(b=>b.kind==='image').map(b=>b.kind==='image'?b.assetId:'')).toEqual(['p1','p2','p3','c0','c1','c2','c3']);
 expect(edition.pages.map(p=>p.index)).toEqual(edition.pages.map((_,i)=>i));
 expect(decoratePrintPublication(edition,input).pages).toHaveLength(edition.pages.length);
 expect(layout.pages.some(p=>p.publication?.kind==='archive')).toBe(false);
});
it('keeps the in-app paginator free of print-only publication pages',async()=>{
 const layout=await paginateAlbumLayout(input,createGlyphWidthMeasurer(),{generatedAt:'2026-11-23T00:00:00Z',timezone:{timeZone:'UTC'}});
 expect(layout.pages.every(p=>p.publication===undefined)).toBe(true);expect(albumLayoutIntegrity(layout,input)).toEqual({ok:true});
});

it('preserves an audio interruption in PDF and keeps every photo box separate inside the page',async()=>{
 const a=record('voice-between','11',[photo('before',.7),{assetId:'voice',role:'audio',availability:'available',durationMs:42000,intrinsicRatio:null,uri:'file:///voice'},photo('after',.7)]);a.note='';
 const source={...input,entries:[a]};const layout=decoratePrintPublication(await paginateAlbumLayout(source,createGlyphWidthMeasurer(),{generatedAt:'2026-11-23T00:00:00Z',timezone:{timeZone:'UTC'},publication:true}),source);
 expect(layout.pages.flatMap(p=>p.blocks).filter(b=>b.kind==='image'||b.kind==='audio').map(b=>'assetId'in b?b.assetId:'')).toEqual(['before','voice','after']);
 for(const page of layout.pages){
  const photos=page.blocks.filter(b=>b.kind==='image');
  for(let i=0;i<photos.length;i++)for(let j=i+1;j<photos.length;j++){
   const a=photos[i].box,b=photos[j].box;expect(a.xPt+a.widthPt<=b.xPt||b.xPt+b.widthPt<=a.xPt||a.yPt+a.heightPt<=b.yPt||b.yPt+b.heightPt<=a.yPt).toBe(true);
  }
 }
 expect(albumLayoutIntegrity(layout,source)).toEqual({ok:true});
});
