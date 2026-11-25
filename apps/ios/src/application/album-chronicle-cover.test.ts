import {JSDOM} from 'jsdom';
import {coverDates,chronicleCover,CHRONICLE_TEMPLATE} from './album-chronicle-cover';
import {epubEscape,albumEpubDocuments} from './album-epub';
import {strFromU8} from 'fflate';
import type {AlbumEpubOptions} from './album-epub';
const record=(id:string,day:string,precision='day')=>({momentId:id,collectedAt:'',sourceRevisionAtCollect:1,presence:'ready' as const,revision:1,note:'日子',feeling:'',occurredAt:day,occurredAtPrecision:precision,recordedAt:'2026-11-24',media:[]});
const options:AlbumEpubOptions={input:{album:{id:'a',schemaVersion:1,name:'我们的日子 & <家>',opening:null,cover:{kind:'words'},entries:[],createdAt:'',updatedAt:''},entries:[record('late','2026-11-12'),record('early','2026-07-01'),record('unknown','2025-01-01','unknown')]},assets:{},id:'book',language:'zh-Hans',createdAt:'2026-11-24',dates:{}};
it('uses first and last known moment dates, not export/collection time or selected order',()=>{
 expect(coverDates(options)).toEqual({start:'2026.07.01',end:'2026.11.12'});
 expect(coverDates({...options,input:{...options.input,entries:[record('year','2024','year'),record('month','2026-11','month')]}})).toEqual({start:'2024',end:'2026.11'});
 expect(coverDates({...options,dates:{early:{label:'Jul 2, 2026',chapter:'July 2026'}}}).start).toBe('Jul 2, 2026');
});
it('does not invent dates for undated records',()=>{
 expect(coverDates({...options,input:{...options.input,entries:[record('u','2026-01-01','unknown')]}})).toEqual({start:'日期未确认',end:'日期未确认'});
});
it('renders one photo with left start, centered original title, right end in the Chronicle band',()=>{
 const html=chronicleCover(options,'media/photo.jpg',epubEscape);const doc=new JSDOM(html).window.document;
 expect(doc.querySelectorAll('.chronicle-photo')).toHaveLength(1);expect(doc.querySelector('.chronicle-title')!.textContent).toBe(options.input.album.name);
 expect(doc.querySelector('.chronicle-start')!.textContent).toBe('2026.07.01');expect(doc.querySelector('.chronicle-end')!.textContent).toBe('2026.11.12');
 expect(doc.querySelectorAll('.chronicle-divider')).toHaveLength(2);expect(doc.querySelector('script')).toBeNull();expect(CHRONICLE_TEMPLATE.name['zh-Hans']).toBe('时序');
});
it('provides a graphic cover for albums with no pictures and handles a long name without truncation',()=>{
 const input={...options.input,album:{...options.input.album,name:'那些一起走过的普通日子'.repeat(6)}};
 const files=albumEpubDocuments({...options,input,design:'imagebook'});const doc=new JSDOM(strFromU8(files['OEBPS/cover.xhtml']),{contentType:'application/xml'}).window.document;
 expect(doc.querySelector('.graphic-cover')).not.toBeNull();expect(doc.querySelector('.chronicle-title')!.textContent).toBe(input.album.name);expect(doc.querySelector('.chronicle-symbol')).not.toBeNull();
});

it('uses English book-title typography even when the app language is Chinese',()=>{
 const input={...options.input,album:{...options.input.album,name:'The Days We Shared'}};
 const html=chronicleCover({...options,input},'media/photo.jpg',epubEscape);const page=new JSDOM(html).window.document;
 expect(page.querySelector('.chronicle-title')!.getAttribute('lang')).toBe('en');
 expect(page.querySelector('.chronicle-title')!.textContent).toBe('The Days We Shared');
});
