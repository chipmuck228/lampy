import type {AlbumEpubOptions} from './album-epub';
import {bookDay} from './album-book-plan';
import {chronicleFeeling,CHRONICLE_NEUTRAL} from './album-chronicle-feeling';

const MONTHS=['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
const ZH_MONTHS=['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];


/** Prefer the frozen displayed date, avoiding a UTC day differing from the date the user sees. */
export function dateTypography(options:AlbumEpubOptions,index:number):{year:string;month:string;day:string;label:string}{
 const e=options.input.entries[index],date=bookDay(options,index),empty={year:'',month:'',day:'',label:date.label};
 if(!e.occurredAt||e.occurredAtPrecision==='unknown')return empty;
 let value=e.occurredAt;
 if(e.occurredAtPrecision==='year')return {...empty,year:value.slice(0,4)};
 const frozen=options.dates[e.momentId]?.label;
 let match:RegExpMatchArray|null=null;
 if(e.occurredAtPrecision==='month')value=value.slice(0,7);
 else if(frozen){
  match=frozen.match(/^(\d{4})[.\-/年](\d{1,2})(?:[.\-/月](\d{1,2})日?)?$/);
  if(match)value=`${match[1]}-${match[2].padStart(2,'0')}${match[3]?'-'+match[3].padStart(2,'0'):''}`;
  else{
   const english=frozen.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
   const m=english?MONTHS.findIndex(month=>month.startsWith(english[1].toUpperCase())):-1;
   if(english&&m>=0)value=`${english[3]}-${String(m+1).padStart(2,'0')}-${english[2].padStart(2,'0')}`;
   else return empty;
  }
 }
 match=value.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);if(!match)return empty;
 const m=Number(match[2])-1;if(m<0||m>11)return empty;
 return {year:match[1],month:options.language==='zh-Hans'?ZH_MONTHS[m]:MONTHS[m],day:e.occurredAtPrecision==='month'?'':match[3]??'',label:date.label};
}
export function chronicleDatePages(options:AlbumEpubOptions,index:number,escape:(s:string)=>string):{name:string;title:string;body:string;nav:boolean}[]{
 const date=bookDay(options,index),type=dateTypography(options,index);
 let end=index;while(end<options.input.entries.length&&bookDay(options,end).key===date.key)end++;
 const colors=options.input.entries.slice(index,end).map(e=>chronicleFeeling(e.feeling)??CHRONICLE_NEUTRAL);
 const stops=colors.map((color,i)=>`<stop offset="${colors.length===1?0:i/(colors.length-1)*100}%" stop-color="${color}"/>`).join('');
 return [{name:`date-${index+1}`,title:date.label,nav:true,body:`<section class="chronicle-date-page" lang="${options.language}"><header class="date-masthead">LAMPY<span aria-hidden="true"></span></header><h1 class="date-stack ${type.day?'is-day':type.month?'is-month':type.year?'is-year':'is-uncertain'}" aria-label="${escape(date.label)}">${type.year?`<span class="date-year-month"><span class="date-year">${escape(type.year)}</span>${type.month?`<span class="date-month">${escape(type.month)}</span>`:''}</span>${type.day?`<span class="date-day">${escape(type.day)}</span>`:''}`:`<span class="date-uncertain">${escape(type.label)}</span>`}</h1><svg xmlns="http://www.w3.org/2000/svg" class="date-axis" viewBox="0 0 3 485" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="date-gradient" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient></defs><rect width="3" height="485" fill="url(#date-gradient)"/></svg><footer class="date-imprint"><span lang="en">Chronicle</span><i aria-hidden="true"></i></footer></section>`}];
}
export const CHRONICLE_DATE_CSS=`
.chronicle-date-page{position:absolute;inset:0;background:#faf9f5;color:#303a37;font-family:Baskerville,"Palatino Linotype",Georgia,"Songti SC","Noto Serif CJK SC",serif}
.date-masthead{position:absolute;left:110px;right:110px;top:94px;font:18px/1.5 Georgia,serif;letter-spacing:6px;color:#105f62}.date-masthead>span{position:absolute;left:150px;right:0;top:13px;border-top:1px solid #b8cac4}
.date-stack{position:absolute;inset:0;margin:0;font-weight:400;color:#105f62}.date-year-month{position:absolute;left:150px;top:438px;width:485px;height:60px;line-height:60px;text-align:center;white-space:nowrap;transform:rotate(90deg);transform-origin:center center;font-size:38px;letter-spacing:.12em}.date-month{margin-left:28px}.date-day{position:absolute;left:500px;top:225px;width:590px;height:485px;display:flex;align-items:center;justify-content:center;font:260px/1 Baskerville,Georgia,serif;letter-spacing:-.03em}.date-uncertain{position:absolute;left:500px;top:370px;width:530px;font-size:44px;line-height:1.6;text-align:center}
.date-axis{position:absolute;left:440px;top:225px;width:3px;height:485px}
.date-imprint{position:absolute;left:110px;right:110px;top:770px;border-top:1px solid #b8cac4;padding-top:25px;font:italic 22px/1.4 Baskerville,Georgia,serif;color:#687870}.date-imprint>i{position:absolute;right:0;top:33px;width:38px;border-top:2px solid #105f62}


`;
