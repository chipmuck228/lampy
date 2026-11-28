import { tr, appLanguage, weekdayLabel, dateLabel, monthLabel } from '../i18n';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './life-text';

import { LifeIcon } from './life-icons';
import {inkSoft,sage} from './life-page';

import {
  isCalendarDayAfter,
  isSameCalendarDayParts,
  type CalendarDayParts,
  type OccurredChoiceView,
  type OccurredDraftInput,
} from '../application/occurred-date';
import { daysInMonth } from '../domain-adapters/calendar';

const WEEKDAYS = appLanguage === 'en' ? Array.from({ length: 7 }, (_, index) => weekdayLabel(index, true)) : ['一', '二', '三', '四', '五', '六', '日'];

function shiftMonth(parts: CalendarDayParts, delta: number): CalendarDayParts {
  const next = new Date(Date.UTC(parts.year, parts.month - 1 + delta, 1));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: 1,
  };
}

function mondayFirstIndex(year: number, month: number): number {
  const sundayIndex = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return (sundayIndex + 6) % 7;
}

export function OccurredDatePicker({
  value,
  today,
  disabled,
  onChange,
  layoutRevision,
  appearance,
}: {
  value: OccurredChoiceView;
  today: CalendarDayParts;
  disabled?: boolean;
  onChange: (next: OccurredDraftInput) => void;
  layoutRevision?: number;
  appearance?: 'capture';
}) {
  const capture=appearance==='capture';
  const selectedDay =
    value.kind !== 'unknown' && value.year && value.month && value.day
      ? { year: value.year, month: value.month, day: value.day }
      : today;
  const [open, setOpen] = useState(value.kind !== 'today');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMode, setCalendarMode] = useState<'day' | 'year' | 'month'>('day');
  const [yearEnd, setYearEnd] = useState(today.year);
  const [visibleMonth, setVisibleMonth] = useState<CalendarDayParts>({
    year: selectedDay.year,
    month: selectedDay.month,
    day: 1,
  });

  function openCalendar() {
    setVisibleMonth({ year: selectedDay.year, month: selectedDay.month, day: 1 });
    setCalendarMode('day');
    setCalendarOpen(true);
  }

  function openYears() {
    // Keep the currently browsed year on the first page, even for an old draft.
    setYearEnd(Math.min(today.year, visibleMonth.year + 5));
    setCalendarMode('year');
  }

  const leading = mondayFirstIndex(visibleMonth.year, visibleMonth.month);
  const dim = daysInMonth(visibleMonth.year, visibleMonth.month);
  const prevMonth = shiftMonth(visibleMonth, -1);
  const nextMonth = shiftMonth(visibleMonth, 1);
  const canGoNext = !isCalendarDayAfter(
    { year: nextMonth.year, month: nextMonth.month, day: 1 },
    { year: today.year, month: today.month, day: 1 },
  );

  return (
    <View style={styles.block}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr("这件事发生在哪一天")}
        accessibilityState={{ expanded: open, disabled: !!disabled }}
        testID="composer-occurred-toggle"
        disabled={disabled}
        onPress={() =>
          setOpen((current) => {
            if (current) setCalendarOpen(false);
            return !current;
          })
        }
        style={styles.toggleHit}
      >
        <View style={styles.toggleRow}>
          <View style={[styles.toggleCopy,capture&&captureStyles.toggleCopy]}>
            <Text key={`occurred-heading-${layoutRevision ?? 1}`} style={[styles.heading,capture&&captureStyles.heading]}>
              {tr("发生日期")}</Text>
            <Text key={`occurred-chosen-${layoutRevision ?? 1}`} style={[styles.chosen,capture&&captureStyles.chosen]} accessible={false}>
              {value.label}
            </Text>
          </View>
          <LifeIcon name={open ? 'collapse' : 'expand'} size={14} decorative />
        </View>
      </Pressable>
      {open ? (
        <View testID="composer-occurred-options">
      <View style={styles.chips}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={value.kind === 'today' ? tr("发生日期，今天，已选中") : tr("发生日期，今天")}
          accessibilityState={{ selected: value.kind === 'today', disabled: !!disabled }}
          testID="composer-occurred-today"
          disabled={disabled}
          onPress={() => onChange({ kind: 'today' })}
          style={[styles.chip, value.kind === 'today' && styles.chipSelected,capture&&captureStyles.chip,capture&&value.kind==='today'&&captureStyles.selected]}
        >
          <Text style={[styles.chipText, value.kind === 'today' && styles.chipTextSelected,capture&&captureStyles.text,capture&&value.kind==='today'&&captureStyles.selectedText]}>{tr("今天")}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            value.kind === 'unknown' ? tr("发生日期，时间不确定，已选中") : tr("发生日期，时间不确定")
          }
          accessibilityState={{ selected: value.kind === 'unknown', disabled: !!disabled }}
          testID="composer-occurred-unknown"
          disabled={disabled}
          onPress={() => onChange({ kind: 'unknown' })}
          style={[styles.chip, value.kind === 'unknown' && styles.chipSelected,capture&&captureStyles.chip,capture&&value.kind==='unknown'&&captureStyles.selected]}
        >
          <Text style={[styles.chipText, value.kind === 'unknown' && styles.chipTextSelected,capture&&captureStyles.text,capture&&value.kind==='unknown'&&captureStyles.selectedText]}>
            {tr("时间不确定")}</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr("选择过去的一天")}
        accessibilityState={{ disabled: !!disabled, expanded: calendarOpen }}
        testID="composer-occurred-pick"
        disabled={disabled}
        onPress={() => {
          if (calendarOpen) setCalendarOpen(false);
          else openCalendar();
        }}
        style={styles.pickHit}
      >
        <Text style={styles.pick}>{calendarOpen ? tr("收起日期") : tr("选择过去的一天")}</Text>
      </Pressable>
      {calendarOpen ? (
        <View testID="composer-occurred-calendar" style={styles.calendar}>
          {calendarMode === 'day' ? <>
          <View style={styles.monthRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr("上个月")}
              testID="composer-occurred-prev-month"
              disabled={disabled}
              onPress={() => setVisibleMonth(prevMonth)}
              style={styles.monthHit}
            >
              <Text style={styles.monthNav}>{tr("上个月")}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={tr('选择年份')}
              accessibilityHint={dateLabel(visibleMonth.year, visibleMonth.month)}
              testID="composer-occurred-choose-year" disabled={disabled}
              onPress={openYears} style={styles.monthPickerHit}>
              <Text style={styles.monthTitle}>{dateLabel(visibleMonth.year, visibleMonth.month)}</Text>
              <LifeIcon name="expand" size={14} decorative />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr("下个月")}
              testID="composer-occurred-next-month"
              disabled={disabled || !canGoNext}
              onPress={() => {
                if (canGoNext) setVisibleMonth(nextMonth);
              }}
              style={styles.monthHit}
            >
              <Text style={[styles.monthNav, !canGoNext && styles.monthNavDisabled]}>{tr("下个月")}</Text>
            </Pressable>
          </View>
          <View style={styles.weekRow}>
            {WEEKDAYS.map((label) => (
              <Text key={label} style={styles.weekday}>
                {label}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {Array.from({ length: leading }, (_, index) => (
              <View key={`pad-${index}`} style={styles.dayCell} />
            ))}
            {Array.from({ length: dim }, (_, index) => {
              const day = index + 1;
              const parts = { year: visibleMonth.year, month: visibleMonth.month, day };
              const future = isCalendarDayAfter(parts, today);
              const isToday = isSameCalendarDayParts(parts, today);
              const selected =
                (value.kind === 'today' && isToday) ||
                (value.kind === 'day' &&
                  !!value.year &&
                  isSameCalendarDayParts(parts, {
                    year: value.year,
                    month: value.month || 0,
                    day: value.day || 0,
                  }));
              return (
                <Pressable
                  key={day}
                  accessibilityRole="button"
                  accessibilityLabel={
                    future
                      ? tr("{0}月{1}日，还没到", [parts.month, day])
                      : selected
                        ? tr("{0}月{1}日，已选中", [parts.month, day])
                        : tr("{0}月{1}日", [parts.month, day])
                  }
                  accessibilityState={{ disabled: !!disabled || future, selected }}
                  testID={`composer-occurred-day-${parts.year}-${parts.month}-${day}`}
                  disabled={disabled || future}
                  onPress={() => {
                    onChange(isToday ? { kind: 'today' } : { kind: 'day', ...parts });
                    setCalendarOpen(false);
                  }}
                  style={[styles.dayCell, selected && styles.daySelected,capture&&captureStyles.day,capture&&selected&&captureStyles.selected]}
                >
                  <Text style={[styles.dayText, future && styles.dayFuture, selected && styles.dayTextSelected,capture&&selected&&captureStyles.selectedText]}>
                    {day}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          </> : <View testID="composer-occurred-period-picker" style={styles.calendar}>
            <View style={styles.monthRow}>
              <Pressable accessibilityRole="button" accessibilityLabel={tr('返回日期')}
                testID="composer-occurred-back-days" disabled={disabled}
                onPress={() => setCalendarMode('day')} style={styles.monthHit}>
                <Text style={styles.monthNav}>{tr('返回日期')}</Text>
              </Pressable>
              <Text style={styles.monthTitle}>{calendarMode === 'year' ? tr('选择年份') : tr('选择月份')}</Text>
            </View>
            {calendarMode === 'year' ? <>
              <View style={styles.monthRow}>
                <Pressable accessibilityRole="button" accessibilityLabel={tr('更早的年份')}
                  testID="composer-occurred-earlier-years" disabled={disabled || yearEnd <= 12}
                  onPress={() => setYearEnd(Math.max(1, yearEnd - 12))} style={styles.monthHit}>
                  <Text style={[styles.monthNav, yearEnd <= 12 && styles.monthNavDisabled]}>{tr('更早的年份')}</Text>
                </Pressable>
                <Text style={styles.yearRange}>{Math.max(1, yearEnd - 11)}–{yearEnd}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={tr('更近的年份')}
                  testID="composer-occurred-later-years" disabled={disabled || yearEnd >= today.year}
                  onPress={() => setYearEnd(Math.min(today.year, yearEnd + 12))} style={styles.monthHit}>
                  <Text style={[styles.monthNav, yearEnd >= today.year && styles.monthNavDisabled]}>{tr('更近的年份')}</Text>
                </Pressable>
              </View>
              <View style={styles.periodGrid}>
                {Array.from({length: Math.min(12, yearEnd)}, (_, index) => yearEnd - index).map(year =>
                  <Pressable key={year} accessibilityRole="button" accessibilityLabel={tr('{0}年', [year])}
                    accessibilityState={{selected: year === visibleMonth.year, disabled: !!disabled}}
                    testID={`composer-occurred-year-${year}`} disabled={disabled}
                    style={[styles.periodCell, year === visibleMonth.year && styles.periodSelected]}
                    onPress={() => {
                      setVisibleMonth({year, month: year === today.year ? Math.min(visibleMonth.month, today.month) : visibleMonth.month, day: 1});
                      setCalendarMode('month');
                    }}><Text style={styles.monthNav}>{year}</Text></Pressable>)}
              </View>
            </> : <>
              <Pressable accessibilityRole="button" accessibilityLabel={tr('选择年份')}
                testID="composer-occurred-change-year" disabled={disabled} onPress={openYears} style={styles.monthHit}>
                <Text style={styles.monthNav}>{tr('{0}年', [visibleMonth.year])}</Text>
              </Pressable>
              <View style={styles.periodGrid}>
                {Array.from({length: 12}, (_, index) => index + 1).map(month => {
                  const future = visibleMonth.year === today.year && month > today.month;
                  return <Pressable key={month} accessibilityRole="button" accessibilityLabel={monthLabel(month)}
                    accessibilityState={{disabled: !!disabled || future, selected: month === visibleMonth.month}}
                    testID={`composer-occurred-month-${month}`} disabled={disabled || future}
                    style={[styles.periodCell, month === visibleMonth.month && styles.periodSelected]}
                    onPress={() => {setVisibleMonth({...visibleMonth, month, day: 1}); setCalendarMode('day');}}>
                    <Text style={[styles.monthNav, future && styles.monthNavDisabled]}>{monthLabel(month, true)}</Text>
                  </Pressable>;
                })}
              </View>
            </>}
          </View>}
        </View>
      ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 8 },
  toggleHit: { minHeight: 48, justifyContent: 'center' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggleCopy: { flex: 1, flexShrink: 1, gap: 2 },
  heading: { fontSize: 16, color: '#5C5851' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipSelected: { borderColor: '#25231F' },
  chipText: { fontSize: 16, lineHeight: 24, color: '#5C5851' },
  chipTextSelected: { color: '#25231F', textDecorationLine: 'underline' },
  chosen: { fontSize: 16, lineHeight: 22, color: '#25231F' },
  pickHit: { minHeight: 48, justifyContent: 'center' },
  pick: { fontSize: 16, lineHeight: 22, color: '#53604F' },
  calendar: { gap: 8 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthHit: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  monthNav: { fontSize: 16, lineHeight: 22, color: '#53604F' },
  monthNavDisabled: { color: '#A7A39B' },
  monthTitle: { fontSize: 16, lineHeight: 22, color: '#25231F' },
  monthPickerHit: { minHeight: 44, flexShrink: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  yearRange: { fontSize: 14, lineHeight: 22, color: inkSoft, flexShrink: 1, textAlign: 'center' },
  periodGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 },
  periodCell: { width: '33.3333%', minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 7 },
  periodSelected: { backgroundColor: '#E1E5D5' },
  weekRow: { flexDirection: 'row' },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    color: '#5C5851',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: '14.2857%',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySelected: { borderWidth: 1, borderColor: '#25231F' },
  dayText: { fontSize: 16, lineHeight: 22, color: '#25231F' },
  dayTextSelected: { textDecorationLine: 'underline' },
  dayFuture: { color: '#A7A39B' },
});

const captureStyles=StyleSheet.create({
 toggleCopy:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',columnGap:12,rowGap:4},
 heading:{fontSize:15,lineHeight:24,color:inkSoft},chosen:{fontSize:15,lineHeight:24,color:sage,flexShrink:1},
 chip:{borderRadius:7,borderColor:'transparent'},selected:{backgroundColor:'#E1E5D5',borderColor:'transparent'},
 text:{color:sage},selectedText:{color:sage,fontWeight:'500',textDecorationLine:'none'},day:{borderRadius:22},
});
