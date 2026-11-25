import { useCallback, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './life-text';
import { tr } from '../i18n';
import { paper } from './life-page';

/** A deliberate horizontal gesture reveals a button; swiping never deletes directly. */
export function AlbumEditionSwipeRow({ id, disabled, onDelete, onShare, children }: {
  id: string; disabled: boolean; onDelete(): void; onShare?(): void; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [offset] = useState(() => new Animated.Value(0));
  const [previousDisabled, setPreviousDisabled] = useState(disabled);
  if (previousDisabled !== disabled) {
    setPreviousDisabled(disabled);
    if (disabled) setOpen(false);
  }
  const width = onShare ? 176 : 88;
  const settle = useCallback((value: boolean) => { offset.setValue(value ? -width : 0); setOpen(value); }, [offset, width]);
  useLayoutEffect(() => { if (disabled) offset.setValue(0); }, [disabled, offset]);
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => !disabled && Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5 && (g.dx < 0 || open),
    onPanResponderMove: (_, g) => { offset.setValue(Math.max(-width, Math.min(0, (open ? -width : 0) + g.dx))); },
    onPanResponderRelease: (_, g) => { settle((open ? -width : 0) + g.dx < -40); },
    onPanResponderTerminate: () => settle(false),
    onPanResponderTerminationRequest: () => true,
  }), [disabled, open, offset, settle, width]);
  return <View style={styles.container} testID={`edition-row-${id}`}>
    {open && !disabled ? <View style={[styles.actions,{width}]}>
      {onShare?<Pressable testID={`edition-share-${id}`} style={styles.share} accessibilityRole="button" accessibilityLabel={tr('分享电子册')} onPress={()=>{settle(false);onShare();}}><Text style={styles.deleteText}>{tr('分享')}</Text></Pressable>:null}
      <Pressable style={styles.delete} accessibilityRole="button" accessibilityLabel={tr('删除这版成品')} onPress={() => { settle(false); onDelete(); }}><Text style={styles.deleteText}>{tr('删除')}</Text></Pressable>
    </View> : null}
    <Animated.View testID={`edition-pan-${id}`} {...pan.panHandlers} style={{ transform: [{ translateX: offset }], backgroundColor: paper, paddingRight: onShare ? 0 : 44 }}>
      {onShare ? <Pressable testID={`edition-open-${id}`} accessibilityRole="button" accessibilityHint={tr('分享电子册')} accessibilityState={{disabled}} disabled={disabled}
        accessibilityActions={[{name:'activate',label:tr('分享')},{name:'delete',label:tr('删除')},{name:'showActions',label:tr('成品操作')}]}
        onAccessibilityAction={e=>{if(disabled)return;if(e.nativeEvent.actionName==='showActions')settle(true);else if(e.nativeEvent.actionName==='delete')onDelete();else if(e.nativeEvent.actionName==='activate')onShare();}}
        onPress={()=>{settle(false);onShare();}} style={{paddingVertical:18}}>{children}</Pressable> : <>
        <Pressable style={styles.more} disabled={disabled} accessibilityRole="button" accessibilityLabel={tr('成品操作')} accessibilityState={{ disabled, expanded: open }} onPress={() => settle(!open)}><Text>···</Text></Pressable>
        {children}
      </>}
    </Animated.View>
  </View>;
}
const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  actions: {position:'absolute',right:0,top:0,bottom:0,flexDirection:'row'},
  share:{width:88,backgroundColor:'#58746C',justifyContent:'center',alignItems:'center'},
  delete: { width: 88, backgroundColor: '#9D3E34', justifyContent: 'center', alignItems: 'center' },
  deleteText: { color: '#FFFFFF', fontSize: 15 },
  more: { position: 'absolute', top: 0, right: 0, minHeight: 44, width: 44, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
});
