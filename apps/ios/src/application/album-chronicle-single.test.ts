import {JSDOM} from 'jsdom';
import {strFromU8} from 'fflate';
import {albumEpubDocuments} from './album-epub';
import type {AlbumEpubOptions} from './album-epub';
import type {AlbumLayoutMediaInput} from './album-layout-input';
import {planChronicleSingle,chronicleProsePages,chronicleLines} from './album-chronicle-single';
import {CHRONICLE_FEELING} from './album-chronicle-feeling';
import {FEELING_ACCENT} from './feeling-accent';
const image=(widthPx?:number,heightPx?:number):AlbumLayoutMediaInput=>({assetId:'photo',role:'image',availability:'available',intrinsicRatio:null,widthPx,heightPx,durationMs:null});
const options=(media=[image(1400,932)],note='',feeling='平静'):AlbumEpubOptions=>({input:{album:{id:'album',schemaVersion:1,name:'日子',opening:null,cover:{kind:'words'},entries:[],createdAt:'',updatedAt:''},entries:[{momentId:'private-id',collectedAt:'',sourceRevisionAtCollect:1,presence:'ready',revision:1,note,feeling,attribution:'妈妈 & 爸爸',occurredAt:'2026-07-01',occurredAtPrecision:'day',recordedAt:'',media}]},assets:{photo:{path:'media/photo.jpg',mime:'image/jpeg'},audio:{path:'media/audio.m4a',mime:'audio/mp4'}},design:'imagebook',language:'zh-Hans',id:'single',createdAt:'2026-11-24',dates:{}});
const xml=(v:Uint8Array)=>new JSDOM(strFromU8(v),{contentType:'application/xml'}).window.document;
it.each([[160,107],[600,3600],[1400,175],[1,1],[100000,10],[10,100000]])('contains the complete %i×%i image within the safe area with at most 2× enlargement',(w,h)=>{
 const plan=planChronicleSingle(image(w,h),'短文');const b=plan.photo;
 expect(plan.fallback).toBe(true);expect(plan.shortText).toBe(false);expect(plan.target).toBe(0);
 expect(b.x).toBeGreaterThanOrEqual(80);expect(b.y).toBeGreaterThanOrEqual(72);expect(b.x+b.width).toBeLessThanOrEqual(1120);expect(b.y+b.height).toBeLessThanOrEqual(828);
 expect(b.width/b.height).toBeCloseTo(w/h);expect(b.width/w).toBeLessThanOrEqual(2);expect(b.height/h).toBeLessThanOrEqual(2);
});
it.each([image(),image(NaN,Infinity),image(-1,0)])('does not crop or invent a ratio when dimensions cannot be recovered',media=>{
 const plan=planChronicleSingle(media,'');expect(plan.unknownSize).toBe(true);expect(plan.target).toBe(0);expect(plan.kind).toBe('plate');
 const doc=xml(albumEpubDocuments(options([media]))['OEBPS/record-1.xhtml']);expect(doc.querySelector('img')!.getAttribute('style')).toContain('contain');expect(doc.querySelector('.triptych-seam')).toBeNull();
});
it('uses safe triptych only for known, sufficiently large photographs',()=>{
 expect(planChronicleSingle(image(1400,932),'').kind).toBe('triptych');
 expect(planChronicleSingle(image(900,1600),'').kind).toBe('plate');
 expect(planChronicleSingle({...image(),intrinsicRatio:1.5},'').kind).toBe('plate');
 const full=planChronicleSingle(image(1400,932),'');expect((4/3)/(1400/932)).toBeGreaterThanOrEqual(.82);expect(full.target).toBe(4/3);
});
it('chooses short text by line capacity, not character count, and respects line breaks',()=>{
 expect(planChronicleSingle(image(900,1600),'安静的下午。').kind).toBe('portrait-short');
 expect(planChronicleSingle(image(1400,932),'安静的下午。').kind).toBe('landscape-short');
 expect(planChronicleSingle(image(1400,932),'一\n二\n三').shortText).toBe(false);
 expect(chronicleLines('a\r\nb',36)).toBe(2);
});
it.each(['第一段。\n\n第二段。\n\n第三段。',('原样保留 👨‍👩‍👦 🦞 é & <script>。\r\n第二行。\r\n\r\n').repeat(30),'x'.repeat(5000),'WM@'.repeat(500),'\n'.repeat(50)+'正文'])('preserves every source character when writing paragraphs across pages',note=>{
 const chunks=chronicleProsePages(note);expect(chunks.join('')).toBe(note);expect(chunks.every(p=>!!p.trim())).toBe(true);expect(chunks.every(p=>!p.startsWith('\u200d')&&!p.endsWith('\u200d'))).toBe(true);
 const files=albumEpubDocuments(options([image(900,1600)],note,'难过'));
 const docs=Object.entries(files).filter(([name])=>/OEBPS\/record-.*xhtml$/.test(name)).map(([,v])=>xml(v));
 expect(docs.flatMap(d=>[...d.querySelectorAll('.fixed-prose')].map(n=>n.textContent)).join('')).toBe(note);
 expect(docs.every(d=>d.querySelector('.feeling-stripe')!.getAttribute('style')!.includes('#455F65'))).toBe(true);
 expect(docs.every(d=>!d.querySelector('.fixed-meta,script'))).toBe(true);
});
it('keeps a normal paragraph together and starts each prose continuation on its own decorated page',()=>{
 const p='窗边的光慢慢移过来。'.repeat(10),text=p+'\n\n'+p;
 const chunks=chronicleProsePages(text);expect(chunks.join('')).toBe(text);expect(chunks).toHaveLength(2);expect(chunks[1]).toBe(p);
 const files=albumEpubDocuments(options([image(1400,932)],text));
 expect(xml(files['OEBPS/record-1.xhtml']).querySelector('.fixed-prose')).toBeNull();
 expect(xml(files['OEBPS/record-1-2.xhtml']).querySelector('.chronicle-masthead')).not.toBeNull();
});
it('retains separate audio and exact full-image return links for a single-photo moment',()=>{
 const audio:AlbumLayoutMediaInput={assetId:'audio',role:'audio',availability:'available',intrinsicRatio:null,durationMs:42000};
 const files=albumEpubDocuments(options([image(900,1600),audio],'留下声音。'));
 const main=xml(files['OEBPS/record-1.xhtml']),full=main.getElementById('photo-1')!;
 expect(main.querySelector('audio')).toBeNull();expect(xml(files['OEBPS/record-1-2.xhtml']).querySelector('audio')!.getAttribute('src')).toBe('media/audio.m4a');
 expect(full.querySelector('.photo-return')!.getAttribute('href')).toBe('#view-1');expect(main.getElementById('view-1')).not.toBeNull();
 expect(main.body.textContent).toContain('妈妈 & 爸爸');expect(main.querySelector('.fixed-meta')).toBeNull();
});
it('shares Chronicle ink colours with the date gradient, without changing the native palette',()=>{
 const files=albumEpubDocuments(options([image(1400,932)],'短文','感动'));
 expect(xml(files['OEBPS/date-1.xhtml']).querySelector('stop')!.getAttribute('stop-color')).toBe(CHRONICLE_FEELING.感动);
 expect(FEELING_ACCENT.感动).toBe('#B0898C');
 const none=xml(albumEpubDocuments(options([image(1400,932)],'',''))['OEBPS/record-1.xhtml']);expect(none.querySelector('.feeling-stripe')).toBeNull();
});
