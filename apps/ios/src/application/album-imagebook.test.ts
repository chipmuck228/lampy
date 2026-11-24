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
 const order=[...opf.querySelectorAll('spine itemref')].map(n=>n.getAttribute('idref')!);expect(order.slice(0,2)).toEqual(['cover','opening']);expect(order.at(-1)).toBe('archive');
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
