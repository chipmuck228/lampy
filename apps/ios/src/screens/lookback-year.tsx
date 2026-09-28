import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  LOOKBACK_MONTH_EXPAND_ERROR,
  LOOKBACK_MONTH_EXPAND_LOADING,
  type LookbackMonthPage,
} from '../application/lookback-month';
import type { LookbackYearMonthCell, LookbackYearPage } from '../application/lookback-year';
import { pad2 } from '../domain-adapters/calendar';

export type LookbackYearExpandStatus =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; page: LookbackMonthPage };

export function LookbackYearMonths({
  page,
  onOpenMonth,
}: {
  page: LookbackYearPage;
  onOpenMonth: (month: number) => void;
}) {
  return (
    <View testID="lookback-year-months" style={styles.grid}>
      {page.months.map((cell) => (
        <YearMonthCell key={cell.month} cell={cell} title={page.title} year={page.year} onOpenMonth={onOpenMonth} />
      ))}
    </View>
  );
}

export function LookbackYearEntries({
  page,
  expandedMonth,
  expand,
  onToggleMonth,
  onRetryExpand,
  onOpenDay,
  onOpenDayUnconfirmed,
}: {
  page: LookbackYearPage;
  expandedMonth: number | null;
  expand: LookbackYearExpandStatus | null;
  onToggleMonth: (month: number) => void;
  onRetryExpand: (month: number) => void;
  onOpenDay: (month: number, day: number) => void;
  onOpenDayUnconfirmed: (month: number) => void;
}) {
  if (page.entries.length === 0) return null;
  return (
    <View testID="lookback-year-entries" style={styles.entries}>
      <Text style={styles.entryHeading}>有记录的月份</Text>
      {page.entries.map((entry) => {
        const open = expandedMonth === entry.month;
        return (
          <View key={entry.month}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${page.title}${entry.month}月，${entry.summary}`}
              testID={`lookback-month-entry-${page.year}-${pad2(entry.month)}`}
              onPress={() => onToggleMonth(entry.month)}
              style={styles.entryHit}
            >
              <Text style={styles.entry}>
                {entry.label} · {entry.summary}
              </Text>
            </Pressable>
            {open && expand ? (
              <LookbackYearMonthExpand
                year={page.year}
                month={entry.month}
                expand={expand}
                onRetry={() => onRetryExpand(entry.month)}
                onOpenDay={onOpenDay}
                onOpenDayUnconfirmed={onOpenDayUnconfirmed}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function LookbackYearMonthExpand({
  year,
  month,
  expand,
  onRetry,
  onOpenDay,
  onOpenDayUnconfirmed,
}: {
  year: number;
  month: number;
  expand: LookbackYearExpandStatus;
  onRetry: () => void;
  onOpenDay: (month: number, day: number) => void;
  onOpenDayUnconfirmed: (month: number) => void;
}) {
  return (
    <View testID={`lookback-year-expand-${year}-${pad2(month)}`} style={styles.expand}>
      {expand.kind === 'loading' ? (
        <Text
          testID={`lookback-year-expand-loading-${year}-${pad2(month)}`}
          style={styles.status}
        >
          {LOOKBACK_MONTH_EXPAND_LOADING}
        </Text>
      ) : null}
      {expand.kind === 'error' ? (
        <>
          <Text
            testID={`lookback-year-expand-error-${year}-${pad2(month)}`}
            style={styles.status}
          >
            {LOOKBACK_MONTH_EXPAND_ERROR}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="再试一次"
            testID={`lookback-year-expand-retry-${year}-${pad2(month)}`}
            onPress={onRetry}
            style={styles.entryHit}
          >
            <Text style={styles.entry}>再试一次</Text>
          </Pressable>
        </>
      ) : null}
      {expand.kind === 'ready' && expand.page.month === month && expand.page.dayUnconfirmedCount > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${expand.page.dayUnconfirmedLabel}，有${expand.page.dayUnconfirmedCount}条记录`}
          testID={`lookback-year-expand-unconfirmed-${year}-${pad2(month)}`}
          onPress={() => onOpenDayUnconfirmed(month)}
          style={styles.entryHit}
        >
          <Text style={styles.unconfirmed}>
            {expand.page.dayUnconfirmedLabel} · {expand.page.dayUnconfirmedCount}条
          </Text>
        </Pressable>
      ) : null}
      {expand.kind === 'ready' && expand.page.month === month
        ? expand.page.entries.map((entry) => (
            <Pressable
              key={entry.day}
              accessibilityRole="button"
              accessibilityLabel={`${expand.page.title}${entry.day}日，${entry.summary}`}
              testID={`lookback-year-expand-day-${year}-${pad2(month)}-${pad2(entry.day)}`}
              onPress={() => onOpenDay(month, entry.day)}
              style={styles.entryHit}
            >
              <Text style={styles.dayEntry}>
                {entry.label} · {entry.summary}
              </Text>
            </Pressable>
          ))
        : null}
    </View>
  );
}

function YearMonthCell({
  cell,
  title,
  year,
  onOpenMonth,
}: {
  cell: LookbackYearMonthCell;
  title: string;
  year: number;
  onOpenMonth: (month: number) => void;
}) {
  if (cell.kind === 'quiet') {
    return (
      <View
        style={styles.cell}
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${title}${cell.month}月，安静`}
        testID={`lookback-month-quiet-${year}-${pad2(cell.month)}`}
      >
        <Text style={styles.quiet}>{cell.numeral}</Text>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}${cell.month}月，${cell.summary}`}
      testID={`lookback-month-${year}-${pad2(cell.month)}`}
      onPress={() => onOpenMonth(cell.month)}
      style={styles.cell}
    >
      <Text style={styles.filled}>{cell.numeral}</Text>
      <View style={styles.mark} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: '100%' },
  cell: {
    width: '33.333%',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 4,
  },
  quiet: { fontSize: 16, lineHeight: 22, color: '#5C5851' },
  filled: { fontSize: 16, lineHeight: 22, color: '#25231F' },
  mark: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#53604F' },
  entries: { gap: 4, width: '100%', minWidth: 0 },
  entryHeading: { fontSize: 16, lineHeight: 22, color: '#5C5851', paddingTop: 8 },
  entryHit: { minHeight: 44, justifyContent: 'center' },
  entry: { fontSize: 18, lineHeight: 24, color: '#53604F' },
  expand: {
    paddingLeft: 16,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(37, 35, 31, 0.16)',
    marginLeft: 4,
    marginBottom: 8,
  },
  unconfirmed: { fontSize: 18, lineHeight: 24, color: '#25231F' },
  dayEntry: { fontSize: 18, lineHeight: 24, color: '#53604F' },
  status: { fontSize: 16, lineHeight: 24, color: '#5C5851', paddingTop: 8 },
});
