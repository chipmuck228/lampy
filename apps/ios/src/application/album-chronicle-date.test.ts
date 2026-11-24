import {JSDOM} from 'jsdom';
import {strFromU8} from 'fflate';
import {albumEpubDocuments,epubEscape} from './album-epub';
import {chronicleDatePages,dateTypography,FEELINGS_PER_DATE_PAGE} from './album-chronicle-date';
import type {AlbumEpubOptions} from './album-epub';
const entry=(index:number,feeling='',precision='day')=>({momentId:'private-'+index,collectedAt:'',sourceRevisionAtCollect:1,presence:'ready' as const,revision:1,note:'片刻',feeling,occurredAt:'2026-07-01T12:00:00Z',occurredAtPrecision:precision,recordedAt:'',media:[]});
const options:AlbumEpubOptions={input:{album:{id:'album',schemaVersion:1,name:'日子',opening:null,cover:{kind:'words'},entries:[],createdAt:'',updatedAt:''},entries:[entry(0,'平静'),entry(1,'高兴'),entry(2),entry(3,'平静')]},assets:{},language:'zh-Hans',id:'book',createdAt:'2026-11-24',dates:{},design:'imagebook'};
const xml=(v:Uint8Array)=>new JSDOM(strFromU8(v),{contentType:'application/xml'}).window.document;
it('stacks date components and keeps one square per chronological moment, including unselected feelings',()=>{
 const files=albumEpubDocuments(options),page=xml(files['OEBPS/date-1.xhtml']);
 expect(page.querySelector('.date-year')!.textContent).toBe('2026');expect(page.querySelector('.date-month')!.textContent).toBe('七月');expect(page.querySelector('.date-day')!.textContent).toBe('01');
 expect([...page.querySelectorAll('.feeling-tile')].map(n=>n.getAttribute('aria-label'))).toEqual(['平静','高兴','未选择','平静']);expect(page.querySelectorAll('.unselected')).toHaveLength(1);
 expect(page.querySelectorAll('.feeling-legend>span')).toHaveLength(3);expect(strFromU8(files['OEBPS/date-1.xhtml'])).not.toContain('private-');
});
it('uses the frozen displayed day and respects partial/unknown precision',()=>{
 const dates={'private-0':{label:'Jul 2, 2026',chapter:'July 2026'}};expect(dateTypography({...options,dates},0)).toMatchObject({year:'2026',month:'七月',day:'02'});
 const input={...options.input,entries:[{...entry(0),occurredAtPrecision:'month'}]};expect(dateTypography({...options,input},0)).toMatchObject({year:'2026',month:'七月',day:''});
 expect(dateTypography({...options,input:{...input,entries:[entry(0,'','unknown')]}},0)).toMatchObject({year:'',month:'',day:''});
});
it('wraps busy days and creates extra date sheets without dropping or shrinking tiles',()=>{
 const entries=Array.from({length:FEELINGS_PER_DATE_PAGE+17},(_,i)=>entry(i,i%2?'高兴':''));const pages=chronicleDatePages({...options,input:{...options.input,entries}},0,epubEscape);
 expect(pages).toHaveLength(2);expect(pages.map(p=>p.nav)).toEqual([true,false]);expect(pages.reduce((n,p)=>n+new JSDOM(p.body).window.document.querySelectorAll('.feeling-tile').length,0)).toBe(entries.length);
});
it('groups full-day records of differing time precision under one date and localizes feeling names',()=>{
 const entries=[entry(0,'感动'),entry(1,'平静','exact')];const dates=Object.fromEntries(entries.map(e=>[e.momentId,{label:'Jul 1, 2026',chapter:'July 2026'}]));
 const files=albumEpubDocuments({...options,language:'en',dates,input:{...options.input,entries}});expect(files['OEBPS/date-2.xhtml']).toBeUndefined();const page=xml(files['OEBPS/date-1.xhtml']);expect([...page.querySelectorAll('.feeling-tile')].map(n=>n.getAttribute('aria-label'))).toEqual(['Moved','Calm']);expect(page.querySelector('.date-month')!.textContent).toBe('JULY');
});
