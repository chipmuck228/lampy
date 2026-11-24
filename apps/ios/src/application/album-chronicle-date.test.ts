import {JSDOM} from 'jsdom';
import {strFromU8} from 'fflate';
import {albumEpubDocuments,epubEscape} from './album-epub';
import {chronicleDatePages,dateTypography} from './album-chronicle-date';
import type {AlbumEpubOptions} from './album-epub';
const entry=(index:number,feeling='',precision='day')=>({momentId:'private-'+index,collectedAt:'',sourceRevisionAtCollect:1,presence:'ready' as const,revision:1,note:'片刻',feeling,occurredAt:'2026-07-01T12:00:00Z',occurredAtPrecision:precision,recordedAt:'',media:[]});
const options:AlbumEpubOptions={input:{album:{id:'album',schemaVersion:1,name:'日子',opening:null,cover:{kind:'words'},entries:[],createdAt:'',updatedAt:''},entries:[entry(0,'平静'),entry(1,'高兴'),entry(2),entry(3,'平静')]},assets:{},language:'zh-Hans',id:'book',createdAt:'2026-11-24',dates:{},design:'imagebook'};
const xml=(v:Uint8Array)=>new JSDOM(strFromU8(v),{contentType:'application/xml'}).window.document;
it('renders only a chronological gradient beside the date, leaving the right side empty',()=>{
 const files=albumEpubDocuments(options),page=xml(files['OEBPS/date-1.xhtml']);
 expect(page.querySelector('.date-day')!.textContent).toBe('01');
 expect(page.querySelectorAll('stop')).toHaveLength(4);
 expect(xml(files['OEBPS/package.opf']).querySelector('item[id="date-1"]')!.getAttribute('properties')).toBe('svg');
 expect(page.querySelectorAll('.date-feelings,.feeling-tile,.feeling-legend,h2')).toHaveLength(0);
 expect(strFromU8(files['OEBPS/date-1.xhtml'])).not.toContain('private-');
});
it('uses the frozen displayed day and respects partial/unknown precision',()=>{
 const dates={'private-0':{label:'Jul 2, 2026',chapter:'July 2026'}};expect(dateTypography({...options,dates},0)).toMatchObject({year:'2026',month:'七月',day:'02'});
 const input={...options.input,entries:[{...entry(0),occurredAtPrecision:'month'}]};expect(dateTypography({...options,input},0)).toMatchObject({year:'2026',month:'七月',day:''});
 expect(dateTypography({...options,input:{...input,entries:[entry(0,'','unknown')]}},0)).toMatchObject({year:'',month:'',day:''});
});
it('retains every gradient stop for a busy day without extra divider pages',()=>{
 const entries=Array.from({length:87},(_,i)=>entry(i,i%2?'高兴':''));const pages=chronicleDatePages({...options,input:{...options.input,entries}},0,epubEscape);
 expect(pages).toHaveLength(1);expect(new JSDOM(pages[0].body).window.document.querySelectorAll('stop')).toHaveLength(87);
});
it('groups full-day records of differing precision under one date',()=>{
 const entries=[entry(0,'感动'),entry(1,'平静','exact')];const dates=Object.fromEntries(entries.map(e=>[e.momentId,{label:'Jul 1, 2026',chapter:'July 2026'}]));
 const files=albumEpubDocuments({...options,language:'en',dates,input:{...options.input,entries}});expect(files['OEBPS/date-2.xhtml']).toBeUndefined();expect(xml(files['OEBPS/date-1.xhtml']).querySelector('.date-month')!.textContent).toBe('JULY');
});
