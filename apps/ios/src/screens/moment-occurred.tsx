import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  isCalendarDayAfter,
  isSameCalendarDayParts,
  type CalendarDayParts,
  type OccurredChoiceView,
  type OccurredDraftInput,
} from '../application/occurred-date';
import { daysInMonth } from '../domain-adapters/calendar';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

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
}: {
  value: OccurredChoiceView;
  today: CalendarDayParts;
  disabled?: boolean;
  onChange: (next: OccurredDraftInput) => void;
}) {
  const selectedDay =
    value.kind !== 'unknown' && value.year && value.month && value.day
      ? { year: value.year, month: value.month, day: value.day }
      : today;
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState<CalendarDayParts>({
    year: selectedDay.year,
    month: selectedDay.month,
    day: 1,
  });

  function openCalendar() {
    setVisibleMonth({ year: selectedDay.year, month: selectedDay.month, day: 1 });
    setCalendarOpen(true);
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
    <View accessibilityLabel="这件事发生在哪一天" style={styles.block}>
      <Text style={styles.heading}>这件事发生在哪一天</Text>
      <View style={styles.chips}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={value.kind === 'today' ? '发生日期，今天，已选中' : '发生日期，今天'}
          accessibilityState={{ selected: value.kind === 'today', disabled: !!disabled }}
          testID="composer-occurred-today"
          disabled={disabled}
          onPress={() => onChange({ kind: 'today' })}
          style={[styles.chip, value.kind === 'today' && styles.chipSelected]}
        >
          <Text style={[styles.chipText, value.kind === 'today' && styles.chipTextSelected]}>今天</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            value.kind === 'unknown' ? '发生日期，时间不确定，已选中' : '发生日期，时间不确定'
          }
          accessibilityState={{ selected: value.kind === 'unknown', disabled: !!disabled }}
          testID="composer-occurred-unknown"
          disabled={disabled}
          onPress={() => onChange({ kind: 'unknown' })}
          style={[styles.chip, value.kind === 'unknown' && styles.chipSelected]}
        >
          <Text style={[styles.chipText, value.kind === 'unknown' && styles.chipTextSelected]}>
            时间不确定
          </Text>
        </Pressable>
      </View>
      {value.kind === 'day' ? <Text style={styles.chosen}>{value.label}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="选择过去的一天"
        accessibilityState={{ disabled: !!disabled, expanded: calendarOpen }}
        testID="composer-occurred-pick"
        disabled={disabled}
        onPress={() => {
          if (calendarOpen) setCalendarOpen(false);
          else openCalendar();
        }}
        style={styles.pickHit}
      >
        <Text style={styles.pick}>{calendarOpen ? '收起日期' : '选择过去的一天'}</Text>
      </Pressable>
      {calendarOpen ? (
        <View testID="composer-occurred-calendar" style={styles.calendar}>
          <View style={styles.monthRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="上个月"
              testID="composer-occurred-prev-month"
              disabled={disabled}
              onPress={() => setVisibleMonth(prevMonth)}
              style={styles.monthHit}
            >
              <Text style={styles.monthNav}>上个月</Text>
            </Pressable>
            <Text style={styles.monthTitle}>
              {visibleMonth.year}年{visibleMonth.month}月
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="下个月"
              testID="composer-occurred-next-month"
              disabled={disabled || !canGoNext}
              onPress={() => {
                if (canGoNext) setVisibleMonth(nextMonth);
              }}
              style={styles.monthHit}
            >
              <Text style={[styles.monthNav, !canGoNext && styles.monthNavDisabled]}>下个月</Text>
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
                      ? `${parts.month}月${day}日，还没到`
                      : selected
                        ? `${parts.month}月${day}日，已选中`
                        : `${parts.month}月${day}日`
                  }
                  accessibilityState={{ disabled: !!disabled || future, selected }}
                  testID={`composer-occurred-day-${parts.year}-${parts.month}-${day}`}
                  disabled={disabled || future}
                  onPress={() => {
                    onChange(isToday ? { kind: 'today' } : { kind: 'day', ...parts });
                    setCalendarOpen(false);
                  }}
                  style={[styles.dayCell, selected && styles.daySelected]}
                >
                  <Text style={[styles.dayText, future && styles.dayFuture, selected && styles.dayTextSelected]}>
                    {day}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 8 },
  heading: { fontSize: 16, lineHeight: 22, color: '#5C5851' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipSelected: { borderColor: '#25231F' },
  chipText: { fontSize: 16, lineHeight: 24, color: '#5C5851' },
  chipTextSelected: { color: '#25231F', textDecorationLine: 'underline' },
  chosen: { fontSize: 16, lineHeight: 22, color: '#25231F' },
  pickHit: { minHeight: 44, justifyContent: 'center' },
  pick: { fontSize: 16, lineHeight: 22, color: '#53604F' },
  calendar: { gap: 8 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthHit: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  monthNav: { fontSize: 16, lineHeight: 22, color: '#53604F' },
  monthNavDisabled: { color: '#A7A39B' },
  monthTitle: { fontSize: 16, lineHeight: 22, color: '#25231F' },
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
