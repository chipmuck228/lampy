import { useCallback, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './life-text';
import { tr } from '../i18n';
import { paper } from './life-page';

/** A deliberate horizontal gesture reveals a button; swiping never deletes directly. */
export function AlbumEditionSwipeRow({ id, disabled, onDelete, children }: {
  id: string; disabled: boolean; onDelete(): void; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [offset] = useState(() => new Animated.Value(0));
  const [previousDisabled, setPreviousDisabled] = useState(disabled);
  if (previousDisabled !== disabled) {
    setPreviousDisabled(disabled);
    if (disabled) setOpen(false);
  }
  const settle = useCallback((value: boolean) => { offset.setValue(value ? -88 : 0); setOpen(value); }, [offset]);
  useLayoutEffect(() => { if (disabled) offset.setValue(0); }, [disabled, offset]);
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => !disabled && Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5 && (g.dx < 0 || open),
    onPanResponderMove: (_, g) => { offset.setValue(Math.max(-88, Math.min(0, (open ? -88 : 0) + g.dx))); },
    onPanResponderRelease: (_, g) => { settle((open ? -88 : 0) + g.dx < -40); },
    onPanResponderTerminate: () => settle(false),
    onPanResponderTerminationRequest: () => true,
  }), [disabled, open, offset, settle]);
  return <View style={styles.container} testID={`edition-row-${id}`}>
    {open && !disabled ? <Pressable style={styles.delete} accessibilityRole="button" accessibilityLabel={tr('删除这版成品')} onPress={() => { settle(false); onDelete(); }}><Text style={styles.deleteText}>{tr('删除')}</Text></Pressable> : null}
    <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: offset }], backgroundColor: paper, paddingRight: 44 }}>
      <Pressable style={styles.more} disabled={disabled} accessibilityRole="button" accessibilityLabel={tr('成品操作')} accessibilityState={{ disabled, expanded: open }} onPress={() => settle(!open)}><Text>···</Text></Pressable>
      {children}
    </Animated.View>
  </View>;
}
const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  delete: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 88, backgroundColor: '#9D3E34', justifyContent: 'center', alignItems: 'center' },
  deleteText: { color: '#FFFFFF', fontSize: 15 },
  more: { position: 'absolute', top: 0, right: 0, minHeight: 44, width: 44, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
});
