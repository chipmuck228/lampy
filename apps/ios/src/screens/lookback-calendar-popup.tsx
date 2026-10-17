import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePageMetrics } from './use-page-metrics';
import { tr } from '../i18n';
import { getUseCases } from '../application/container';
import type { LookbackBookView } from '../application/lookback-book';
import { lookbackMonthPage, type LookbackMonthPage } from '../application/lookback-month';
import { readLookbackBookOpen, readLookbackReadingSnapshot } from '../application/lookback-session';
import { useDeviceLock } from './device-lock-context';
import { LookbackMessage, lookbackStyles } from './lookback-chrome';
import { LookbackMonthCalendar } from './lookback-month';
import { Text, type } from './life-text';
import { inkSoft, sage, paper } from './life-page';

type Month = { year:number; month:number };
const sameMonth = (a:Month,b:Month) => a.year===b.year && a.month===b.month;

export default function LookbackCalendarPopup({visible,onClose,onOpenDay}:{
  visible:boolean;
  onClose:()=>void;
  onOpenDay:(date:{year:number;month:number;day:number})=>void;
}) {
  const {width,height}=usePageMetrics();
  const insets=useSafeAreaInsets();
  const lock=useDeviceLock();
  const [foreground,setForeground]=useState(AppState.currentState==='active');
  const allowed=visible&&foreground&&!lock?.snapshot.locked;
  const [book,setBook]=useState<LookbackBookView|null>(null);
  const [selected,setSelected]=useState<Month|null>(null);
  const [page,setPage]=useState<LookbackMonthPage|null>(null);
  const [loading,setLoading]=useState(true);
  const [failed,setFailed]=useState(false);
  const [choosing,setChoosing]=useState(false);
  const generation=useRef(0);
  const invalidate=useCallback(()=>{generation.current++;},[]);
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
  },[allowed]);
  useEffect(()=>{
    let active=true;
    void Promise.resolve().then(()=>{if(active)load();});
    return()=>{active=false;invalidate();};
  },[load,invalidate]);
  useEffect(()=>{
    if(visible&&(!foreground||lock?.snapshot.locked))onClose();
  },[visible,foreground,lock?.snapshot.locked,onClose]);
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
    onOpenDay({year:page.year,month:page.month,day});
  }
  if(!allowed)return null;
  return <Modal transparent visible animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait','landscape']}>
    <View style={styles.overlay} accessibilityViewIsModal>
      <Pressable testID="calendar-backdrop" style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={tr('关闭日历')} onPress={onClose}/>
      <View testID="lookback-calendar-popup" style={[styles.panel,{width:Math.min(640,width-insets.left-insets.right-24),maxHeight:height-insets.top-insets.bottom-32}]}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.heading}><Text accessibilityRole="header" style={type.title}>{tr('记录日历')}</Text><Pressable testID="calendar-close" accessibilityRole="button" accessibilityLabel={tr('关闭日历')} style={styles.hit} onPress={onClose}><Text style={lookbackStyles.action}>×</Text></Pressable></View>
      <Text style={styles.note}>{tr('日期下的数字是当天的记录条数。')}</Text>
      {selected?<View style={styles.navigation}>
        <Pressable testID="calendar-earlier" accessibilityRole="button" accessibilityLabel={tr('更早的月份')} disabled={index<0||index===months.length-1} accessibilityState={{disabled:index<0||index===months.length-1}} style={styles.hit} onPress={()=>void choose(months[index+1])}><Text style={lookbackStyles.action}>‹</Text></Pressable>
        <Pressable testID="calendar-month-picker" accessibilityRole="button" accessibilityLabel={tr('选择月份')} accessibilityState={{expanded:choosing}} style={styles.hit} onPress={()=>setChoosing(!choosing)}><Text style={lookbackStyles.action}>{tr('{0}年{1}月',[selected.year,selected.month])}</Text></Pressable>
        <Pressable testID="calendar-later" accessibilityRole="button" accessibilityLabel={tr('更晚的月份')} disabled={index<=0} accessibilityState={{disabled:index<=0}} style={styles.hit} onPress={()=>void choose(months[index-1])}><Text style={lookbackStyles.action}>›</Text></Pressable>
      </View>:null}
      {choosing?<View style={styles.months}>{months.map(m=><Pressable key={`${m.year}-${m.month}`} testID={`calendar-month-${m.year}-${m.month}`} accessibilityRole="button" accessibilityState={{selected:!!selected&&sameMonth(m,selected)}} style={styles.month} onPress={()=>void choose(m)}><Text style={lookbackStyles.action}>{tr('{0}年{1}月',[m.year,m.month])}</Text></Pressable>)}</View>:null}
      {loading?<LookbackMessage>{tr('正在读取。')}</LookbackMessage>:failed?<View><LookbackMessage>{tr('回看暂时读不出来，原来的记录还在。')}</LookbackMessage><Pressable testID="calendar-retry" accessibilityRole="button" style={styles.hit} onPress={()=>void load()}><Text style={lookbackStyles.action}>{tr('再试一次')}</Text></Pressable></View>:page?<>
        <LookbackMonthCalendar page={page} year={page.year} month={page.month} onOpenDay={openDay}/>
      </>:<LookbackMessage>{tr('还没有日期明确的记录。')}</LookbackMessage>}
      {book&&(book.unknownCount>0||book.years.some(y=>y.yearUnconfirmedCount>0)||!!page?.dayUnconfirmedCount)?<Text style={styles.note}>{tr('日期未确认的记录仍在时间目录中。')}</Text>:null}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
const styles=StyleSheet.create({overlay:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(37,35,31,0.22)'},panel:{backgroundColor:paper,borderRadius:20,overflow:'hidden'},content:{padding:16},heading:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12},note:{...type.meta,color:inkSoft,marginVertical:12},navigation:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},hit:{minWidth:44,minHeight:48,alignItems:'center',justifyContent:'center'},months:{flexDirection:'row',flexWrap:'wrap',gap:12,marginBottom:16},month:{minHeight:48,justifyContent:'center',paddingHorizontal:8,borderBottomWidth:1,borderBottomColor:sage}});
