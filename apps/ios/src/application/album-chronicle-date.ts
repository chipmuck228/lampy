import type {AlbumEpubOptions} from './album-epub';
import {bookDay} from './album-book-plan';
import {feelingAccentColor,isFeelingWord} from './feeling-accent';

const MONTHS=['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
const ZH_MONTHS=['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
const EN_FEELINGS:Record<string,string>={高兴:'Happy',平静:'Calm',感动:'Moved',疲惫:'Tired',难过:'Sad',烦乱:'Unsettled',说不清:'Hard to say'};
export const FEELINGS_PER_DATE_PAGE=70;
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
 const zh=options.language==='zh-Hans',date=bookDay(options,index),type=dateTypography(options,index);
 let end=index;while(end<options.input.entries.length&&bookDay(options,end).key===date.key)end++;
 const feelings=options.input.entries.slice(index,end).map(e=>e.feeling.trim());
 const label=(value:string)=>value?isFeelingWord(value)?zh?value:EN_FEELINGS[value]:zh?'其他感受':'Other feelings':zh?'未选择':'Not set';
 const color=(value:string)=>value?feelingAccentColor({value,label:value,known:isFeelingWord(value)}):'';
 const period=type.day?(zh?'这一天的心情':'The day’s feelings'):type.month?(zh?'这一月的心情':'The month’s feelings'):type.year?(zh?'这一年的心情':'The year’s feelings'):(zh?'这些记录的心情':'Feelings in these moments');
 const pages=[];
 for(let offset=0;offset<feelings.length;offset+=FEELINGS_PER_DATE_PAGE){
  const part=feelings.slice(offset,offset+FEELINGS_PER_DATE_PAGE),legend=[...new Set(part.map(value=>isFeelingWord(value)?value:value?'other':''))];
  const legendTop=114+Math.ceil(part.length/14)*38;
  pages.push({name:`date-${index+1}${offset?'-'+(offset/FEELINGS_PER_DATE_PAGE+1):''}`,title:date.label,nav:offset===0,body:`<section class="chronicle-date-page" lang="${options.language}"><header class="date-masthead">LAMPY<span aria-hidden="true"></span></header><h1 class="date-stack ${type.day?'is-day':type.month?'is-month':type.year?'is-year':'is-uncertain'}" aria-label="${escape(date.label)}">${type.year?`<span class="date-year">${escape(type.year)}</span>${type.month?`<span class="date-month">${escape(type.month)}</span>`:''}${type.day?`<span class="date-day">${escape(type.day)}</span>`:''}`:`<span class="date-uncertain">${escape(type.label)}</span>`}</h1><span class="date-axis" aria-hidden="true"></span><section class="date-feelings"><h2>${period}</h2><ol class="feeling-sequence" aria-label="${zh?'按记录时间排列的心情':'Feelings in moment order'}">${part.map(value=>`<li class="feeling-tile${value?'':' unselected'}"${value?` style="background:${color(value)};border-color:${color(value)}"`:''} aria-label="${escape(label(value))}"></li>`).join('')}</ol><div class="feeling-legend" style="top:${legendTop}px">${legend.map(value=>`<span><i${value?` style="background:${color(value)};border-color:${color(value)}"`:''} aria-hidden="true"></i>${escape(label(value))}</span>`).join('')}</div></section><footer class="date-imprint"><span lang="en">Chronicle</span><i aria-hidden="true"></i></footer></section>`});
 }
 return pages;
}
export const CHRONICLE_DATE_CSS=`
.chronicle-date-page{position:absolute;inset:0;background:#faf9f5;color:#303a37;font-family:Baskerville,"Palatino Linotype",Georgia,"Songti SC","Noto Serif CJK SC",serif}
.date-masthead{position:absolute;left:110px;right:110px;top:94px;font:18px/1.5 Georgia,serif;letter-spacing:6px;color:#105f62}.date-masthead>span{position:absolute;left:150px;right:0;top:13px;border-top:1px solid #b8cac4}
.date-stack{position:absolute;left:130px;top:210px;width:270px;font-weight:400;color:#105f62;line-height:1.25}.date-stack>span{display:block}.date-year{font-size:38px;letter-spacing:.12em}.date-month{font-size:29px;letter-spacing:.14em;margin-top:38px}.date-day{font:180px/1.1 Baskerville,Georgia,serif;margin-top:18px;letter-spacing:-.02em}.date-uncertain{font-size:44px;line-height:1.6;max-width:240px}
.date-axis{position:absolute;left:440px;top:225px;bottom:190px;border-left:1px solid #c4d3cd}
.date-feelings{position:absolute;left:530px;top:305px;width:560px}.date-feelings h2{font-size:28px;font-weight:400;line-height:1.5;color:#687870}.feeling-sequence{position:absolute;left:0;top:80px;width:530px;display:flex;flex-wrap:wrap;gap:10px;margin:0;padding:0;list-style:none}.feeling-tile{width:28px;height:28px;flex:none;border:1px solid #aabeb5;box-sizing:border-box}.unselected{background:transparent}
.feeling-legend{position:absolute;left:0;width:560px;font-size:18px;line-height:1.7;color:#687870;display:flex;flex-wrap:wrap;gap:10px 22px}.feeling-legend>span{display:inline-block;white-space:nowrap}.feeling-legend i{display:inline-block;width:10px;height:10px;border:1px solid #aabeb5;margin-right:8px;vertical-align:middle}
.date-imprint{position:absolute;left:110px;right:110px;top:770px;border-top:1px solid #b8cac4;padding-top:25px;font:italic 22px/1.4 Baskerville,Georgia,serif;color:#687870}.date-imprint>i{position:absolute;right:0;top:33px;width:38px;border-top:2px solid #105f62}

.date-stack.is-year .date-year{font-size:104px;letter-spacing:0}.date-stack.is-month .date-month{font-size:72px;letter-spacing:.04em}.chronicle-date-page:lang(en) .date-stack.is-month .date-month{font-size:40px}
`;
