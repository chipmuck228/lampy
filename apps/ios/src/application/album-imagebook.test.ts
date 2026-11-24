import {strFromU8} from 'fflate';
import {JSDOM} from 'jsdom';
import {albumEpubDocuments} from './album-epub';
import {splitPublicationText} from './album-imagebook';
import type {AlbumLayoutInput} from './album-layout-input';
const input:AlbumLayoutInput={album:{id:'private',schemaVersion:1,name:'那些普通的日子',opening:null,cover:{kind:'words'},entries:[],createdAt:'',updatedAt:''},entries:[{momentId:'private-record',collectedAt:'',sourceRevisionAtCollect:1,presence:'ready',revision:1,note:('第一段完整文字 👨‍👩‍👦 🦞 é。\n第二段文字 & <script>。\n').repeat(50),attribution:'妈妈 & <爸爸>',feeling:'平静',occurredAtPrecision:'unknown',recordedAt:'',media:[{assetId:'p1',role:'image',availability:'available',intrinsicRatio:.7,durationMs:null},{assetId:'a',role:'audio',availability:'available',intrinsicRatio:null,durationMs:42000},{assetId:'p2',role:'image',availability:'available',intrinsicRatio:1.5,durationMs:null}]}]};
const assets={p1:{path:'media/photo-1.jpg',mime:'image/jpeg'},a:{path:'media/sound.m4a',mime:'audio/mp4'},p2:{path:'media/photo-2.jpg',mime:'image/jpeg'}};
const options={input,assets,design:'imagebook' as const,language:'zh-Hans' as const,id:'book',createdAt:'2026-11-24T00:00:00Z',dates:{}};
const xml=(value:Uint8Array)=>new JSDOM(strFromU8(value),{contentType:'application/xml'}).window.document;
it('preserves every character when conservatively paginating long Unicode text',()=>{
 const text=input.entries[0].note;const pages=splitPublicationText(text,15,14);expect(pages.length).toBeGreaterThan(3);expect(pages.join('')).toBe(text);
 expect(pages.every(p=>!p.startsWith('\u200d')&&!p.endsWith('\u200d'))).toBe(true);
});
it('uses complete landscape pages, optional audio, default preface and final edition notes',()=>{
 const files=albumEpubDocuments(options);const opf=xml(files['OEBPS/package.opf']);expect(opf.querySelector('meta[property="rendition:layout"]')!.textContent).toBe('pre-paginated');expect(opf.querySelector('meta[property="rendition:spread"]')!.textContent).toBe('none');
 const order=[...opf.querySelectorAll('spine itemref')].map(n=>n.getAttribute('idref')!);expect(order.slice(0,2)).toEqual(['cover','opening']);expect([...opf.querySelectorAll('spine itemref:not([linear="no"])')].at(-1)!.getAttribute('idref')).toBe('archive');
 const records=order.filter(n=>n.startsWith('record-')).map(n=>xml(files['OEBPS/'+n+'.xhtml']));
 expect(records.flatMap(doc=>[...doc.querySelectorAll('.fixed-prose')].map(n=>n.textContent)).join('')).toBe(input.entries[0].note);
 expect(records.flatMap(doc=>[...doc.querySelectorAll('img,audio')].map(n=>n.getAttribute('src')))).toEqual(['media/photo-1.jpg','media/sound.m4a','media/photo-2.jpg']);
 for(const name of order){const doc=xml(files['OEBPS/'+name+'.xhtml']);expect(doc.querySelector('parsererror')).toBeNull();expect(doc.querySelector('meta[name="viewport"]')!.getAttribute('content')).toBe('width=1200, height=900');expect(doc.querySelector('figcaption,script')).toBeNull();}
 expect(xml(files['OEBPS/opening.xhtml']).body.textContent).toContain('把一些平常的日子');
 const all=order.map(n=>strFromU8(files['OEBPS/'+n+'.xhtml'])).join('');expect(all).not.toContain('private-record');expect(all).not.toContain('Opening words');expect(all).not.toContain('MOMENTS IN THESE PAGES');expect(all).not.toContain('autoplay');
});
it('retains the user preface unchanged, including an all-photo record and words cover',()=>{
 const custom={...input,album:{...input.album,opening:'原来的开篇。'},entries:[{...input.entries[0],note:'',media:[input.entries[0].media[0]]}]};
 const files=albumEpubDocuments({...options,input:custom});expect(xml(files['OEBPS/opening.xhtml']).querySelector('.fixed-prose')!.textContent).toBe('原来的开篇。');expect(xml(files['OEBPS/record-1.xhtml']).querySelectorAll('img')).toHaveLength(1);
});

it('preserves each grouped daily note and all three photographs in a planned gallery',()=>{
 const first={...input.entries[0],momentId:'one',occurredAt:'2026-01-01T12:00:00Z',occurredAtPrecision:'day',note:'早上的记录。',media:[]};
 const second={...first,momentId:'two',note:'晚上的记录。'};
 const third={...first,momentId:'three',note:'',media:[input.entries[0].media[0],input.entries[0].media[2],input.entries[0].media[0]]};
 const files=albumEpubDocuments({...options,input:{...input,entries:[first,second,third]}});
 const day=xml(files['OEBPS/record-1.xhtml']);expect([...day.querySelectorAll('.fixed-prose')].map(n=>n.textContent)).toEqual([first.note,second.note]);expect(files['OEBPS/record-2.xhtml']).toBeUndefined();
 const gallery=xml(files['OEBPS/record-3.xhtml']);expect([...gallery.querySelectorAll('img')].map(n=>n.getAttribute('src'))).toEqual(['media/photo-1.jpg','media/photo-2.jpg','media/photo-1.jpg']);
});

it.each(['literary','imagebook'] as const)('places one standalone date before all moments that day in %s',design=>{
 const base={...input.entries[0],note:'',media:[],occurredAtPrecision:'day'};
 const entries=[{...base,momentId:'late',note:'最后一天',occurredAt:'2026-08-18T00:00:00Z'},{...base,momentId:'early',note:'最早一天第一条',occurredAt:'2026-08-03T00:00:00Z'},{...base,momentId:'same',note:'最早一天第二条',occurredAt:'2026-08-03T01:00:00Z'}];
 const files=albumEpubDocuments({...options,design,input:{...input,entries}});const opf=xml(files['OEBPS/package.opf']);const order=[...opf.querySelectorAll('spine itemref')].map(n=>n.getAttribute('idref')!);
 const dividers=order.filter(n=>n.startsWith('date-'));expect(dividers).toHaveLength(2);
 const heading=xml(files['OEBPS/'+dividers[0]+'.xhtml']).querySelector('h1')!;expect(heading.getAttribute('aria-label')??heading.textContent).toContain('2026-08-03');
 const body=order.map(n=>xml(files['OEBPS/'+n+'.xhtml']).body.textContent).join('');expect(body.indexOf('最早一天第一条')).toBeLessThan(body.indexOf('最早一天第二条'));expect(body.indexOf('最早一天第二条')).toBeLessThan(body.indexOf('最后一天'));
 expect(entries[0].momentId).toBe('late');
});

it('links every cropped photo to a complete offline image and returns to its exact source page',()=>{
 const custom={...input,entries:[{...input.entries[0],note:'短文',media:[{...input.entries[0].media[0],intrinsicRatio:.8}]}]};
 const files=albumEpubDocuments({...options,input:custom});const source=xml(files['OEBPS/record-1.xhtml']);const link=source.querySelector('.photo-link')!;const target=link.getAttribute('href')!;const full=xml(files['OEBPS/'+target]);
 expect(full.querySelector('.original-photo img')!.getAttribute('src')).toBe('media/photo-1.jpg');
 const back=full.querySelector('.photo-return')!.getAttribute('href')!.split('#');expect(back[0]).toBe('record-1.xhtml');expect(source.getElementById(back[1])).toBe(link);
 const opf=xml(files['OEBPS/package.opf']);expect(opf.querySelector('itemref[idref="photo-1"]')!.getAttribute('linear')).toBe('no');
 expect(full.querySelector('script')).toBeNull();
});

it.each([1,2,3])('preserves long paragraph text and all %i photos through reference layouts and continuation pages',count=>{
 const note=('第一段不应丢失任何文字。👨‍👩‍👦\n第二段继续记录这个日子。\n').repeat(30);
 const media=Array.from({length:count},(_,i)=>({...input.entries[0].media[0],assetId:i%2?'p2':'p1'}));
 const files=albumEpubDocuments({...options,input:{...input,entries:[{...input.entries[0],note,media}]}});
 const docs=Object.entries(files).filter(([path])=>/OEBPS\/record-.*xhtml$/.test(path)).map(([,bytes])=>xml(bytes));
 expect(docs.flatMap(doc=>[...doc.querySelectorAll('.fixed-prose')].map(n=>n.textContent)).join('')).toBe(note);
 expect(docs.flatMap(doc=>[...doc.querySelectorAll('.photo-link')])).toHaveLength(count);
});

it('makes one landscape photo a continuous three-panel plate with no repeated date and a feeling stripe',()=>{
 const record={...input.entries[0],note:'',feeling:'感动',attribution:'家人',media:[{...input.entries[0].media[2],widthPx:1400,heightPx:932}]};
 const files=albumEpubDocuments({...options,input:{...input,entries:[record]}});const doc=xml(files['OEBPS/record-1.xhtml']);
 expect(doc.querySelectorAll('.continuous-triptych img')).toHaveLength(1);expect(doc.querySelectorAll('.triptych-seam')).toHaveLength(2);expect(doc.querySelector('.fixed-meta')).toBeNull();expect(doc.querySelector('.feeling-stripe')!.getAttribute('style')).toContain('#9FBAB0');
 const full=xml(files['OEBPS/'+doc.querySelector('.photo-link')!.getAttribute('href')]);expect(full.querySelector('.photo-credit')!.textContent).toContain('家人 · 感动');expect(full.querySelector('.photo-return')!.getAttribute('href')).toContain('record-1.xhtml#view-');
});
it('does not force portrait photos into a heavily cropped triptych or invent a feeling',()=>{
 const record={...input.entries[0],note:'',feeling:'',media:[input.entries[0].media[0]]};
 const files=albumEpubDocuments({...options,input:{...input,entries:[record]}});const doc=xml(files['OEBPS/record-1.xhtml']);expect(doc.querySelector('.single-photo-plate')).not.toBeNull();expect(doc.querySelector('.triptych-seam,.feeling-stripe,.fixed-meta')).toBeNull();expect(doc.querySelector('img')!.getAttribute('style')).toContain('contain');
});
