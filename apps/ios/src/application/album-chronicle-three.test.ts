import {planChronicleThree} from './album-chronicle-three';
import {JSDOM} from 'jsdom';
import {strFromU8} from 'fflate';
import {albumEpubDocuments} from './album-epub';
import type {AlbumEpubOptions} from './album-epub';
import type {AlbumLayoutMediaInput} from './album-layout-input';
const image=(widthPx?:number,heightPx?:number):AlbumLayoutMediaInput=>({assetId:'photo',role:'image',availability:'available',intrinsicRatio:null,widthPx,heightPx,durationMs:null});
const options=(media=[image(1400,932)],note='',feeling='平静'):AlbumEpubOptions=>({input:{album:{id:'album',schemaVersion:1,name:'日子',opening:null,cover:{kind:'words'},entries:[],createdAt:'',updatedAt:''},entries:[{momentId:'private-id',collectedAt:'',sourceRevisionAtCollect:1,presence:'ready',revision:1,note,feeling,attribution:'妈妈 & 爸爸',occurredAt:'2026-07-01',occurredAtPrecision:'day',recordedAt:'',media}]},assets:{photo:{path:'media/photo.jpg',mime:'image/jpeg'},audio:{path:'media/audio.m4a',mime:'audio/mp4'}},design:'imagebook',language:'zh-Hans',id:'single',createdAt:'2026-11-24',dates:{}});
const xml=(v:Uint8Array)=>new JSDOM(strFromU8(v),{contentType:'application/xml'}).window.document;

it.each([[1200,1800,1400,932,1200,1587],[900,1600,900,1600,900,1600],[1600,900,1600,900,1600,900]])('fits all three original ratios inside the safe wall',(...sizes)=>{
 const media=[0,2,4].map(i=>image(sizes[i],sizes[i+1]));const plan=planChronicleThree(media,'平常的日子。')!;
 expect(plan).not.toBeNull();plan.photos.forEach((b,i)=>{expect(b.x).toBeGreaterThanOrEqual(63.999);expect(b.y).toBeGreaterThanOrEqual(63.999);expect(b.x+b.width).toBeLessThanOrEqual(1136.001);expect(b.y+b.height).toBeLessThanOrEqual(836.001);expect(b.width/b.height).toBeCloseTo(sizes[i*2]/sizes[i*2+1]);});
});
it('keeps all writing, exact full-photo returns and separate long prose',()=>{
 for(const note of ['平常的日子。','窗边的光。'.repeat(200)]){
 const files=albumEpubDocuments(options([image(1200,1800),image(1400,932),image(1200,1587)],note));
 const docs=Object.entries(files).filter(([n])=>/OEBPS\/record-.*xhtml$/.test(n)).map(([,v])=>xml(v));
 expect(docs.flatMap(d=>[...d.querySelectorAll('.fixed-prose')].map(n=>n.textContent)).join('')).toBe(note);
 expect(docs[0].querySelectorAll('.three-photo')).toHaveLength(3);
 for(let i=1;i<=3;i++)expect(xml(files['OEBPS/photo-'+i+'.xhtml']).querySelector('.photo-return')!.getAttribute('href')).toBe('record-1.xhtml#view-'+i);
 }
});
it('uses safe individual plates for tiny, unknown and extreme photos',()=>{
 for(const m of [image(),image(100,100),image(800,5000)]){
 expect(planChronicleThree([m,image(1200,1800),image(1400,932)],'')).toBeNull();
 const files=albumEpubDocuments(options([m,image(1200,1800),image(1400,932)],''));
 expect(xml(files['OEBPS/record-1.xhtml']).querySelector('.chronicle-photo')).not.toBeNull();
 }
});
it('decorates prose without changing source text and reserves native audio height',()=>{
 const files=albumEpubDocuments(options([image(1200,1800),{assetId:'audio',role:'audio',availability:'available',intrinsicRatio:null,durationMs:42000}], '正文。'.repeat(200)));
 const prose=xml(files['OEBPS/record-1-2.xhtml']);expect(prose.querySelectorAll('.prose-quote[aria-hidden="true"]')).toHaveLength(2);
 const css=strFromU8(files['OEBPS/style.css']);expect(css).toContain('.chronicle-prose .prose-initial');expect(css).toContain('min-height:100px');
});
