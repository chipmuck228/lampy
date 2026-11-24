import {JSDOM} from 'jsdom';
import {strFromU8} from 'fflate';
import {albumEpubDocuments} from './album-epub';
import {CHRONICLE_PHILOSOPHY} from './album-chronicle-opening';
import {PUBLICATION_OPENING} from './album-publication';
import type {AlbumEpubOptions} from './album-epub';
const options:AlbumEpubOptions={input:{album:{id:'a',schemaVersion:1,name:'日子',opening:null,cover:{kind:'words'},entries:[],createdAt:'',updatedAt:''},entries:[{momentId:'one',collectedAt:'',sourceRevisionAtCollect:1,presence:'ready',revision:1,note:'记录',feeling:'',occurredAtPrecision:'unknown',recordedAt:'',media:[]}]},assets:{},id:'book',language:'zh-Hans',createdAt:'2026-11-24',dates:{},design:'imagebook'};
const doc=(value:Uint8Array)=>new JSDOM(strFromU8(value),{contentType:'application/xml'}).window.document;
it.each(['zh-Hans','en'] as const)('keeps the default opening separate from the Lampy philosophy in %s',language=>{
 const files=albumEpubDocuments({...options,language});const page=doc(files['OEBPS/opening.xhtml']);
 expect(page.querySelector('.opening-letter')!.textContent).toBe(PUBLICATION_OPENING[language]);expect(page.querySelector('.opening-philosophy')!.textContent).toBe(CHRONICLE_PHILOSOPHY[language]);
 expect(page.querySelector('.chronicle-opening')!.getAttribute('lang')).toBe(language);expect(page.querySelector('.opening-quote')!.getAttribute('aria-hidden')).toBe('true');expect(page.querySelector('script')).toBeNull();
});
it('preserves long custom text, paragraphs and Unicode while printing philosophy only once',()=>{
 const opening=('写给未来的我们。👨‍👩‍👦 & <记忆>\n把这些日子慢慢读完。\n').repeat(35);
 const files=albumEpubDocuments({...options,input:{...options.input,album:{...options.input.album,opening}}});
 const pages=Object.entries(files).filter(([p])=>/^OEBPS\/opening(?:-\d+)?\.xhtml$/.test(p)).map(([,v])=>doc(v));expect(pages.length).toBeGreaterThan(1);expect(pages.map(p=>p.querySelector('.opening-letter')!.textContent).join('')).toBe(opening);
 expect(pages.reduce((n,p)=>n+p.querySelectorAll('.opening-philosophy').length,0)).toBe(1);
});
