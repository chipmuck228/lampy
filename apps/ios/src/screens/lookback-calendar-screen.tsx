import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { tr } from '../i18n';
import { getUseCases } from '../application/container';
import type { LookbackBookView } from '../application/lookback-book';
import { lookbackMonthPage, type LookbackMonthPage } from '../application/lookback-month';
import { readLookbackBookOpen, readLookbackReadingSnapshot, writeLookbackBookIntent } from '../application/lookback-session';
import { useDeviceLock } from './device-lock-context';
import { LookbackScaffold, LookbackMessage, lookbackStyles } from './lookback-chrome';
import { LookbackMonthCalendar, LookbackMonthEntries } from './lookback-month';
import { Text, type } from './life-text';
import { inkSoft, sage } from './life-page';

type Month = { year:number; month:number };
const sameMonth = (a:Month,b:Month) => a.year===b.year && a.month===b.month;

export default function LookbackCalendarScreen() {
  const router=useRouter();
  const lock=useDeviceLock();
  const [foreground,setForeground]=useState(AppState.currentState==='active');
  const allowed=foreground&&!lock?.snapshot.locked;
  const [book,setBook]=useState<LookbackBookView|null>(null);
  const [selected,setSelected]=useState<Month|null>(null);
  const [page,setPage]=useState<LookbackMonthPage|null>(null);
  const [loading,setLoading]=useState(true);
  const [failed,setFailed]=useState(false);
  const [choosing,setChoosing]=useState(false);
  const generation=useRef(0);
  const selectedRef=useRef<Month|null>(null);
  useEffect(()=>{
    const sub=AppState.addEventListener('change',state=>{
      if(state!=='active')generation.current++;
      setForeground(state==='active');
    });
    return()=>sub.remove();
  },[]);
  const load=useCallback(()=>{
    const ticket=++generation.current;
    if(!allowed)return;
    setLoading(true);setFailed(false);setPage(null);setBook(null);
    void(async()=>{
      try {
        const app=await getUseCases();
        const next=await app.getLookbackBook();
        if(ticket!==generation.current)return;
        const months=next.years.flatMap(y=>y.months.map(m=>({year:y.year,month:m.month}))).sort((a,b)=>b.year-a.year||b.month-a.month);
        const scope=readLookbackReadingSnapshot()?.scope;
        const preferred=selectedRef.current??(scope&&'month' in scope?scope:readLookbackBookOpen());
        const month=months.find(m=>preferred&&sameMonth(m,preferred))??months[0]??null;
        setBook(next);setSelected(month);selectedRef.current=month;
        if(month) {
          const detail=await app.getHistoryMonth(month.year,month.month);
          if(ticket!==generation.current)return;
          if('invalid' in detail)throw Error('Invalid month');
          setPage(lookbackMonthPage(detail));
        }
      } catch {if(ticket===generation.current)setFailed(true);}
      finally {if(ticket===generation.current)setLoading(false);}
    })();
    return()=>{generation.current++;};
  },[allowed]);
  useFocusEffect(load);
  const months=book?.years.flatMap(y=>y.months.map(m=>({year:y.year,month:m.month}))).sort((a,b)=>b.year-a.year||b.month-a.month)??[];
  const index=selected?months.findIndex(m=>sameMonth(m,selected)):-1;
  async function choose(month:Month) {
    if(!allowed)return;
    const ticket=++generation.current;
    setSelected(month);selectedRef.current=month;setPage(null);setLoading(true);setFailed(false);setChoosing(false);
    try {
      const app=await getUseCases();
      const detail=await app.getHistoryMonth(month.year,month.month);
      if(ticket!==generation.current)return;
      if('invalid' in detail)throw Error('Invalid month');
      setPage(lookbackMonthPage(detail));
    } catch {if(ticket===generation.current)setFailed(true);}
    finally {if(ticket===generation.current)setLoading(false);}
  }
  function openDay(day:number) {
    if(!allowed||loading||!page||!page.entries.some(e=>e.day===day))return;
    writeLookbackBookIntent({year:page.year,month:page.month,day});
    if(router.canGoBack())router.back();else router.replace('/lookback');
  }
  return <LookbackScaffold title={tr('记录日历')} path="/lookback/calendar" onBack={()=>router.canGoBack()?router.back():router.replace('/lookback')}>
    {allowed?<>
      <Text style={styles.note}>{tr('小圆点标记有记录的日期。')}</Text>
      {selected?<View style={styles.navigation}>
        <Pressable testID="calendar-earlier" accessibilityRole="button" accessibilityLabel={tr('更早的月份')} disabled={index<0||index===months.length-1} accessibilityState={{disabled:index<0||index===months.length-1}} style={styles.hit} onPress={()=>void choose(months[index+1])}><Text style={lookbackStyles.action}>‹</Text></Pressable>
        <Pressable testID="calendar-month-picker" accessibilityRole="button" accessibilityLabel={tr('选择月份')} accessibilityState={{expanded:choosing}} style={styles.hit} onPress={()=>setChoosing(!choosing)}><Text style={lookbackStyles.action}>{tr('{0}年{1}月',[selected.year,selected.month])}</Text></Pressable>
        <Pressable testID="calendar-later" accessibilityRole="button" accessibilityLabel={tr('更晚的月份')} disabled={index<=0} accessibilityState={{disabled:index<=0}} style={styles.hit} onPress={()=>void choose(months[index-1])}><Text style={lookbackStyles.action}>›</Text></Pressable>
      </View>:null}
      {choosing?<View style={styles.months}>{months.map(m=><Pressable key={`${m.year}-${m.month}`} testID={`calendar-month-${m.year}-${m.month}`} accessibilityRole="button" accessibilityState={{selected:!!selected&&sameMonth(m,selected)}} style={styles.month} onPress={()=>void choose(m)}><Text style={lookbackStyles.action}>{tr('{0}年{1}月',[m.year,m.month])}</Text></Pressable>)}</View>:null}
      {loading?<LookbackMessage>{tr('正在读取。')}</LookbackMessage>:failed?<View><LookbackMessage>{tr('回看暂时读不出来，原来的记录还在。')}</LookbackMessage><Pressable testID="calendar-retry" accessibilityRole="button" style={styles.hit} onPress={()=>void load()}><Text style={lookbackStyles.action}>{tr('再试一次')}</Text></Pressable></View>:page?<>
        <LookbackMonthCalendar page={page} year={page.year} month={page.month} onOpenDay={openDay}/>
        <LookbackMonthEntries page={page} year={page.year} month={page.month} onOpenDay={openDay}/>
      </>:<LookbackMessage>{tr('还没有日期明确的记录。')}</LookbackMessage>}
      {book&&(book.unknownCount>0||book.years.some(y=>y.yearUnconfirmedCount>0)||!!page?.dayUnconfirmedCount)?<Text style={styles.note}>{tr('日期未确认的记录仍在时间目录中。')}</Text>:null}
    </>:null}
  </LookbackScaffold>;
}
const styles=StyleSheet.create({note:{...type.meta,color:inkSoft,marginVertical:12},navigation:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},hit:{minWidth:44,minHeight:48,alignItems:'center',justifyContent:'center'},months:{flexDirection:'row',flexWrap:'wrap',gap:12,marginBottom:16},month:{minHeight:48,justifyContent:'center',paddingHorizontal:8,borderBottomWidth:1,borderBottomColor:sage}});
