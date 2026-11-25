import {albumEpubDocuments} from './album-epub';
import {strFromU8,zipSync} from 'fflate';
import {writeFileSync} from 'fs';
import {JSDOM} from 'jsdom';
import {chroniclePdfLayout,chroniclePdfIntegrity} from './album-chronicle-pdf';
import type {AlbumLayoutInput} from './album-layout-input';
import type {AlbumFontDiagnosis} from '../../modules/lampy-album-layout';
const input: AlbumLayoutInput = {
  album: {
    id: 'book',
    schemaVersion: 1,
    name: '私人的册子',
    opening: '开篇',
    cover: { kind: 'words' },
    entries: [],
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
  },
  entries: [
    {
      momentId: 'm1',
      presence: 'ready',
      revision: 1,
      sourceRevisionAtCollect: 1,
      collectedAt: '2026-10-01',
      note: '全文\n🥣不改写',
      feeling: '',
      occurredAtPrecision: 'unknown',
      recordedAt: '2026-10-01T00:00:00Z',
      media: [
        {
          assetId: 'p1',
          role: 'image',
          availability: 'available',
          uri: 'file:///private/photo.jpg',
          intrinsicRatio: 1,
          durationMs: null,
          widthPx: 80,
          heightPx: 80,
        },
        {
          assetId: 'a1',
          role: 'audio',
          availability: 'available',
          uri: 'file:///private/sound.m4a',
          intrinsicRatio: null,
          durationMs: 8000,
        },
      ],
    },
  ],
};
const fonts={serif:{fontName:'Songti SC'},ui:{fontName:'PingFang SC'}} as AlbumFontDiagnosis;
it.each(['zh-Hans','en'] as const)('uses the shared publication with complete notes and its accepted ending (%s)',language=>{
const layout=chroniclePdfLayout(input,fonts,language,'2026-11-25');
expect(chroniclePdfIntegrity(layout,input).ok).toBe(true);
expect(layout.pageSize).toEqual({widthPt:600,heightPt:450});
const pages=layout.printPublication!.pages;
expect(pages.at(-1)!.name).toBe('archive');
expect(pages.flatMap(p=>p.notes).join('')).toBe(input.entries[0].note);
expect(pages.flatMap(p=>p.images)).toEqual(['p1']);expect(pages.flatMap(p=>p.audio)).toEqual(['a1']);
for(const p of pages){const d=new JSDOM(p.html,{contentType:'application/xhtml+xml'}).window.document;expect(d.querySelector('script,audio,.photo-detail')).toBeNull();expect(d.querySelector('parsererror')).toBeNull();}
expect(pages.at(-1)!.html).not.toContain('<dl');
layout.printPublication!.pages.find(p=>p.notes.length)!.notes=['lost'];expect(chroniclePdfIntegrity(layout,input).ok).toBe(false);
});
it('preserves 13 moments and 30 images through the production composer',()=>{
const book=JSON.parse(JSON.stringify(input)) as AlbumLayoutInput;
book.entries=Array.from({length:13},(_,i)=>({...input.entries[0],momentId:'m'+i,note:i%2?'短文字':'',media:Array.from({length:i<5?3:i<12?2:1},(_,j)=>({...input.entries[0].media[0],assetId:`p-${i}-${j}`,widthPx:j%2?1600:900,heightPx:j%2?900:1600,intrinsicRatio:j%2?16/9:9/16}))}));
const l=chroniclePdfLayout(book,fonts,'zh-Hans','2026-11-25');expect(chroniclePdfIntegrity(l,book).ok).toBe(true);expect(l.printPublication!.pages.flatMap(p=>p.images)).toHaveLength(30);
});

it('shares photo geometry, prose decorations, CSS and the ending with EPUB',()=>{
 const layout=chroniclePdfLayout(input,fonts,'zh-Hans','2026-11-25'),p=layout.printPublication!;
 const assets=Object.fromEntries(p.assets.map(a=>[a.assetId,{path:a.path,mime:'image/jpeg'}]));
 assets.a1={path:'media/asset-1.m4a',mime:'audio/mp4'};
 const docs=albumEpubDocuments({input,assets,dates:{},design:'imagebook',language:'zh-Hans',id:'proof',createdAt:'2026-11-25'});
 expect(p.css.startsWith(strFromU8(docs['OEBPS/style.css']))).toBe(true);
 for(const page of p.pages){
 const a=new JSDOM(page.html,{contentType:'application/xhtml+xml'}).window.document;
 const b=new JSDOM(strFromU8(docs['OEBPS/'+page.name+'.xhtml']),{contentType:'application/xhtml+xml'}).window.document;
 const elements=(d:Document)=>[...d.querySelectorAll('.chronicle-photo,.chronicle-pair-photo,.three-photo,.fixed-prose,.edition-notes')].map(n=>n.outerHTML.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/g,(_,attrs,body)=>`<span${attrs.replace(/\s*href="[^"]*"/g,'')}>${body}</span>`));
 expect(elements(a)).toEqual(elements(b));
 }
 if(process.env.LAMPY_WRITE_SHARED_PROOF){
 writeFileSync('/tmp/chronicle-shared-publication.json',JSON.stringify(p));
 writeFileSync('/tmp/chronicle-shared.epub',zipSync(docs));
 }
});
