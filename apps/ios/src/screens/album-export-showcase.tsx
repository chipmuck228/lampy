import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { tr } from '../i18n';
import { albumFontFace, type AlbumLayout } from '../application/album-layout';
import type { AlbumLayoutMediaMap } from '../application/album-layout-input';
import type { AlbumPrintProgress } from '../application/album-print';
import {
  albumEditionFacts,
  albumPrintProgressCopy,
  albumPrintProgressFraction,
  albumSpanLabel,
  styleAlbumPages,
} from '../application/album-export-showcase';
import { ALBUM_READING_STYLES, type AlbumReadingStyle } from '../application/album-reading';
import { AlbumExportBook, AlbumExportBookPlaceholder } from './album-export-book';
import { LifeIcon, type LifeIconName } from './life-icons';
import { hairline, ink, inkSoft, paper, sage } from './life-page';
import { Text, type } from './life-text';

const serif = albumFontFace('album-serif');

/**
 * The finished edition, shown before anything is generated: the user's own
 * measured pages as a book, its real counts, and what the file will be.
 */
export function AlbumExportShowcase({
  layout,
  media,
  failed,
  style,
  onStyle,
  width,
  busy,
  celebrate,
  holdAt,
  children,
}: {
  layout: AlbumLayout | null;
  media: AlbumLayoutMediaMap;
  failed: boolean;
  style: AlbumReadingStyle;
  onStyle: (style: AlbumReadingStyle) => void;
  width: number;
  busy: boolean;
  celebrate: number;
  holdAt?: number;
  children?: ReactNode;
}) {
  const pages = useMemo(() => (layout ? styleAlbumPages(layout, style) : []), [layout, style]);
  const mediaJson = useMemo(() => JSON.stringify(media), [media]);
  const facts = useMemo(() => (layout ? albumEditionFacts(layout) : null), [layout]);
  const name = layout?.sourceFingerprint.name ?? '';
  const span = facts ? albumSpanLabel(facts.span) : null;
  return (
    <View style={styles.body}>
      {layout ? (
        <AlbumExportBook
          pages={pages}
          media={media}
          mediaJson={mediaJson}
          style={style}
          width={width}
          title={name}
          busy={busy}
          celebrate={celebrate}
          holdAt={holdAt}
        />
      ) : failed ? null : (
        <AlbumExportBookPlaceholder width={width} />
      )}
      {layout ? <Text style={styles.caption}>{tr('翻一翻，这就是导出后的样子。')}</Text> : null}
      {failed ? <Text style={[styles.meta, styles.center]}>{tr('这一册暂时排不出来。收进的记录还在。')}</Text> : null}
      {layout && facts ? (
        <>
          <View style={styles.titleBlock}>
            <Text style={styles.name} accessibilityRole="header">
              {name}
            </Text>
            <Text style={styles.subtitle}>
              {[span, tr('A5 · 148×210 mm')].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <StylePicker style={style} onStyle={onStyle} disabled={busy} />
          <EditionStats
            items={[
              { value: facts.pageCount, label: tr('页') },
              { value: facts.recordCount, label: tr('条记录') },
              { value: facts.photoCount, label: tr('张照片') },
              ...(facts.soundCount ? [{ value: facts.soundCount, label: tr('段声音') }] : []),
            ]}
          />
          <EditionPromises sounds={facts.soundCount > 0} />
        </>
      ) : null}
      {children}
    </View>
  );
}

function StylePicker({
  style,
  onStyle,
  disabled,
}: {
  style: AlbumReadingStyle;
  onStyle: (style: AlbumReadingStyle) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.pickerRow} accessibilityRole="radiogroup" accessibilityLabel={tr('纸张')}>
      {(['plain', 'handmade'] as const).map((choice) => {
        const selected = choice === style;
        return (
          <Pressable
            key={choice}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={tr(choice === 'plain' ? '素纸' : '手作')}
            disabled={disabled}
            testID={`album-export-style-${choice}`}
            onPress={() => onStyle(choice)}
            style={[styles.chip, selected && styles.chipSelected, disabled && styles.dim]}
          >
            <View
              style={[
                styles.swatch,
                {
                  backgroundColor: ALBUM_READING_STYLES[choice].paper,
                  borderWidth: choice === 'handmade' ? 2.5 : StyleSheet.hairlineWidth,
                  borderColor: choice === 'handmade' ? '#FFFFFF' : hairline,
                },
              ]}
            />
            <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{tr(choice === 'plain' ? '素纸' : '手作')}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function EditionStats({ items }: { items: { value: number; label: string }[] }) {
  return (
    <View style={styles.stats} accessible accessibilityLabel={items.map((item) => `${item.value}${item.label}`).join('，')}>
      {items.map((item, index) => (
        <View key={item.label} style={[styles.stat, index > 0 && styles.statRule]}>
          <Text style={styles.statValue}>{item.value}</Text>
          <Text style={styles.statLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function EditionPromises({ sounds }: { sounds: boolean }) {
  const rows: { icon: LifeIconName; text: string }[] = [
    { icon: 'printer', text: tr('精确A5尺寸，按100%打印就能装订成册') },
    { icon: 'photo', text: tr('照片按原比例整张呈现，不裁切') },
    { icon: 'textCursor', text: tr('文字可以选择、搜索，不是一张张截图') },
    { icon: 'edition', text: tr('每次导出都是独立的一版，之后改了记录，这一版也不会变') },
    ...(sounds ? [{ icon: 'waveform' as const, text: tr('声音在纸上留下标记与时长') }] : []),
  ];
  return (
    <View style={styles.promises}>
      {rows.map((row) => (
        <View key={row.icon} style={styles.promise}>
          <View style={styles.promiseIcon}>
            <LifeIcon name={row.icon} size={17} color={sage} />
          </View>
          <Text style={styles.promiseText}>{row.text}</Text>
        </View>
      ))}
    </View>
  );
}

export function ShowcaseButton({
  label,
  onPress,
  disabled,
  testID,
  tone = 'solid',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  tone?: 'solid' | 'quiet';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        tone === 'solid' ? styles.solid : styles.quiet,
        pressed && styles.pressed,
        disabled && styles.dim,
      ]}
    >
      <Text style={tone === 'solid' ? styles.solidLabel : styles.quietLabel}>{label}</Text>
    </Pressable>
  );
}

export function ShowcaseUnlocked() {
  return (
    <View style={styles.unlocked} accessible accessibilityLabel={tr('已解锁导出')}>
      <LifeIcon name="check" size={15} color={sage} />
      <Text style={styles.unlockedLabel}>{tr('已解锁导出')}</Text>
    </View>
  );
}

export function ShowcaseNote({ children, live }: { children: ReactNode; live?: boolean }) {
  return (
    <Text accessibilityLiveRegion={live ? 'polite' : undefined} style={styles.note}>
      {children}
    </Text>
  );
}

/** Binding in progress. Steps are reported by the export service, not timed. */
export function BindingPanel({
  progress,
  onCancel,
}: {
  progress: AlbumPrintProgress | null;
  onCancel: () => void;
}) {
  const [fill] = useState(() => new Animated.Value(0));
  const fraction = albumPrintProgressFraction(progress);
  useEffect(() => {
    Animated.timing(fill, { toValue: Math.max(0.02, fraction), duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [fill, fraction]);
  return (
    <View style={styles.binding} testID="album-export-binding">
      <Text style={styles.bindingTitle} accessibilityLiveRegion="polite">
        {albumPrintProgressCopy(progress)}
      </Text>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { transform: [{ scaleX: fill }] }]} />
      </View>
      <Text style={styles.note}>{tr('正在冻结并排成PDF。')}</Text>
      <ShowcaseButton tone="quiet" label={tr('取消')} onPress={onCancel} />
    </View>
  );
}

export function FreshEdition({
  number,
  pages,
  size,
  onShare,
  disabled,
}: {
  number: number;
  pages: number;
  size: string;
  onShare: () => void;
  disabled: boolean;
}) {
  const [rise] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(rise, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [rise]);
  return (
    <Animated.View
      testID="album-export-fresh"
      style={[styles.fresh, { opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}
    >
      <View style={styles.freshHead}>
        <LifeIcon name="sealed" size={22} color={sage} />
        <Text style={styles.freshTitle} accessibilityLiveRegion="polite">
          {tr('这一册装订好了。')}
        </Text>
      </View>
      <Text style={styles.freshMeta}>{tr('第{0}版 · {1}页 · {2}', [number, pages, size])}</Text>
      <ShowcaseButton label={tr('保存或打印PDF')} onPress={onShare} disabled={disabled} testID="album-export-fresh-share" />
      <Text style={styles.note}>{tr('导出会生成一份文件。它不再只待在Lampy里，Lampy也不能从别人的设备收回。')}</Text>
    </Animated.View>
  );
}

export function ShelfHeader() {
  return (
    <View style={styles.shelfHead}>
      <Text style={styles.shelfTitle}>{tr('已装订的版本')}</Text>
    </View>
  );
}

export function MiniBook({ style }: { style: AlbumReadingStyle }) {
  return (
    <View style={styles.mini}>
      <View style={[styles.miniEdge, { left: 2.2, top: 2.2 }]} />
      <View style={[styles.miniEdge, { left: 1.1, top: 1.1, backgroundColor: '#FCFAF4' }]} />
      <View style={[styles.miniCover, { backgroundColor: ALBUM_READING_STYLES[style].paper }]}>
        <View style={styles.miniHinge} />
        <View style={styles.miniLine} />
        <View style={[styles.miniLine, { width: 10, marginTop: 3 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 20, gap: 18, alignItems: 'stretch' },
  caption: { ...type.meta, fontSize: 13, lineHeight: 18, color: inkSoft, textAlign: 'center', marginTop: -10 },
  meta: { ...type.meta, color: inkSoft },
  center: { textAlign: 'center' },
  titleBlock: { alignItems: 'center', gap: 4, paddingTop: 4 },
  name: { fontFamily: serif, fontSize: 28, lineHeight: 36, color: ink, textAlign: 'center' },
  subtitle: { ...type.meta, color: inkSoft, textAlign: 'center' },
  pickerRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  chip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: hairline,
  },
  chipSelected: { borderColor: sage, borderWidth: 1.5, backgroundColor: 'rgba(83,96,79,0.06)' },
  chipLabel: { ...type.meta, color: inkSoft },
  chipLabelSelected: { color: ink },
  swatch: { width: 18, height: 24, borderRadius: 2, boxShadow: '0px 1px 2px rgba(37,35,31,0.18)' },
  stats: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: hairline,
    paddingVertical: 14,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statRule: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: hairline },
  statValue: { fontFamily: serif, fontSize: 30, lineHeight: 36, color: ink, fontVariant: ['tabular-nums'] },
  statLabel: { ...type.meta, fontSize: 13, lineHeight: 18, color: inkSoft },
  promises: { gap: 12 },
  promise: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  promiseIcon: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  promiseText: { ...type.meta, color: ink, flex: 1 },
  solid: {
    minHeight: 54,
    borderRadius: 27,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: sage,
    boxShadow: '0px 8px 18px rgba(83,96,79,0.30)',
  },
  solidLabel: { ...type.action, color: paper, fontWeight: '600', textAlign: 'center' },
  quiet: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  quietLabel: { ...type.action, color: sage, textAlign: 'center' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  dim: { opacity: 0.45 },
  unlocked: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  unlockedLabel: { ...type.meta, color: sage },
  note: { ...type.meta, fontSize: 13, lineHeight: 19, color: inkSoft, textAlign: 'center' },
  binding: { gap: 12, paddingTop: 4 },
  bindingTitle: { fontFamily: serif, fontSize: 20, lineHeight: 28, color: ink, textAlign: 'center' },
  track: { height: 3, borderRadius: 1.5, backgroundColor: hairline, overflow: 'hidden' },
  fill: { height: 3, width: '100%', backgroundColor: sage, transformOrigin: 'left center' },
  fresh: {
    gap: 12,
    padding: 20,
    borderRadius: 22,
    backgroundColor: '#FBF9F4',
    boxShadow: '0px 6px 20px rgba(37,35,31,0.08)',
  },
  freshHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  freshTitle: { fontFamily: serif, fontSize: 22, lineHeight: 30, color: ink },
  freshMeta: { ...type.meta, color: inkSoft, textAlign: 'center', fontVariant: ['tabular-nums'] },
  shelfHead: {
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: hairline,
  },
  shelfTitle: { ...type.meta, color: inkSoft, paddingTop: 12 },
  mini: { width: 34, height: 46 },
  miniEdge: { position: 'absolute', width: 31, height: 43, backgroundColor: '#D9D1C2', borderRadius: 1 },
  miniCover: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 31,
    height: 43,
    borderRadius: 1,
    paddingTop: 13,
    paddingLeft: 8,
    boxShadow: '0px 3px 6px rgba(37,35,31,0.18)',
  },
  miniHinge: { position: 'absolute', left: 3, top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(37,35,31,0.18)' },
  miniLine: { width: 16, height: 1.5, backgroundColor: 'rgba(37,35,31,0.45)' },
});
