import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { LookbackMonthPage, LookbackMonthWeekCell } from '../application/lookback-month';
import { pad2 } from '../domain-adapters/calendar';

export function LookbackMonthCalendar({
  page,
  year,
  month,
  onOpenDay,
}: {
  page: LookbackMonthPage;
  year: number;
  month: number;
  onOpenDay: (day: number) => void;
}) {
  return (
    <View testID="lookback-month-calendar" style={styles.calendar}>
      <View style={styles.weekdays} accessible={false}>
        {page.weekdayLabels.map((label) => (
          <Text key={label} style={styles.weekday}>
            {label}
          </Text>
        ))}
      </View>
      {page.weeks.map((week, weekIndex) => (
        <View key={`week-${weekIndex}`} style={styles.week}>
          {week.map((cell) => (
            <MonthDayCell
              key={cell.key}
              cell={cell}
              title={page.title}
              year={year}
              month={month}
              onOpenDay={onOpenDay}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export function LookbackMonthEntries({
  page,
  year,
  month,
  onOpenDay,
}: {
  page: LookbackMonthPage;
  year: number;
  month: number;
  onOpenDay: (day: number) => void;
}) {
  if (page.entries.length === 0) return null;
  return (
    <View testID="lookback-month-entries" style={styles.entries}>
      <Text style={styles.entryHeading}>有记录的日子</Text>
      {page.entries.map((entry) => (
        <Pressable
          key={entry.day}
          accessibilityRole="button"
          accessibilityLabel={`${page.title}${entry.day}日，${entry.summary}`}
          testID={`lookback-month-entry-${year}-${pad2(month)}-${pad2(entry.day)}`}
          onPress={() => onOpenDay(entry.day)}
          style={styles.entryHit}
        >
          <Text style={styles.entry}>
            {entry.label} · {entry.summary}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function MonthDayCell({
  cell,
  title,
  year,
  month,
  onOpenDay,
}: {
  cell: LookbackMonthWeekCell;
  title: string;
  year: number;
  month: number;
  onOpenDay: (day: number) => void;
}) {
  if (cell.kind === 'pad') {
    return <View style={styles.pad} accessible={false} />;
  }
  if (cell.kind === 'quiet') {
    return (
      <View
        style={styles.cell}
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${title}${cell.day}日，安静`}
        testID={`lookback-day-quiet-${year}-${pad2(month)}-${pad2(cell.day)}`}
      >
        <Text style={styles.quietNumeral}>{cell.numeral}</Text>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}${cell.day}日，${cell.summary}`}
      testID={`lookback-day-${year}-${pad2(month)}-${pad2(cell.day)}`}
      onPress={() => onOpenDay(cell.day)}
      style={styles.cell}
    >
      <Text style={styles.filledNumeral}>{cell.numeral}</Text>
      <View style={styles.mark} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  calendar: { width: '100%', maxWidth: '100%', minWidth: 0, gap: 4 },
  weekdays: { flexDirection: 'row', width: '100%' },
  weekday: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    color: '#53604F',
  },
  week: { flexDirection: 'row', width: '100%', alignItems: 'stretch' },
  pad: { flex: 1, minWidth: 0, minHeight: 44 },
  cell: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 4,
  },
  quietNumeral: { fontSize: 16, lineHeight: 22, color: '#5C5851' },
  filledNumeral: { fontSize: 16, lineHeight: 22, color: '#25231F' },
  mark: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#53604F' },
  entries: { gap: 4, width: '100%', minWidth: 0 },
  entryHeading: { fontSize: 16, lineHeight: 22, color: '#5C5851', paddingTop: 8 },
  entryHit: { minHeight: 44, justifyContent: 'center' },
  entry: { fontSize: 18, lineHeight: 24, color: '#53604F' },
});
