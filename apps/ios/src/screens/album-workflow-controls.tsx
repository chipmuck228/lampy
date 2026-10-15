import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput, type } from './life-text';
import { ink, inkSoft, paperDeep, sage } from './life-page';
import { tr } from '../i18n';
import { ALBUM_OPENING_HINT } from '../application/life-album';
// Shared presentation for personal and family albums; persistence/permission stay with adapters.
export function AlbumCreateFields({
  name,
  onChangeName,
  placeholder,
  locked = false,
  busy = false,
  error,
  submitLabel,
  busyLabel,
  onSubmit,
  prefix = 'life-album-new',
  maxLength
}: {
  name: string;
  onChangeName: (value: string) => void;
  placeholder: string;
  locked?: boolean;
  busy?: boolean;
  error?: string | null;
  submitLabel: string;
  busyLabel: string;
  onSubmit: () => void;
  prefix?: string;
  maxLength?: number;
}) {
  return <><Text style={styles.createLabel}>{tr('册名')}</Text><TextInput accessibilityLabel={tr('册名')} testID={`${prefix}-name`} value={name} onChangeText={onChangeName} placeholder={placeholder} editable={!busy && !locked} autoCorrect={false} autoCapitalize="none" maxLength={maxLength} style={[styles.createInput, locked && {
      color: inkSoft
    }]} />{error ? <Text testID={`${prefix}-error`} style={styles.hint}>{error}</Text> : null}<Pressable accessibilityRole="button" accessibilityState={{
      disabled: busy
    }} accessibilityLabel={submitLabel} testID={`${prefix}-save`} disabled={busy} onPress={onSubmit} style={styles.hit}><Text style={[styles.action, busy && styles.disabled]}>{busy ? busyLabel : submitLabel}</Text></Pressable></>;
}
export function AlbumManageToolbar({
  editing,
  organizing,
  busy,
  onEdit,
  onOrganize,
  prefix = 'life-album'
}: {
  editing: boolean;
  organizing: boolean;
  busy: boolean;
  onEdit: () => void;
  onOrganize: () => void;
  prefix?: string;
}) {
  return <View style={styles.toolbar}><Pressable accessibilityRole="button" accessibilityLabel={tr(editing ? '取消' : '编辑册子')} testID={`${prefix}-${editing ? 'cancel-edit' : 'edit'}`} disabled={busy} onPress={onEdit} style={styles.hit}><Text style={styles.action}>{tr(editing ? '取消' : '编辑册子')}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={tr(organizing ? '完成' : '整理')} testID={`${prefix}-${organizing ? 'organize-done' : 'organize'}`} disabled={busy} onPress={onOrganize} style={organizing ? styles.doneHit : styles.hit}><Text style={organizing ? styles.doneLabel : styles.action}>{tr(organizing ? '完成' : '整理')}</Text></Pressable></View>;
}
export function AlbumEntryActions({
  id,
  first,
  last,
  busy,
  onMoveUp,
  onMoveDown,
  onRemove,
  prefix = 'life-album'
}: {
  id: string;
  first: boolean;
  last: boolean;
  busy: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  prefix?: string;
}) {
  return <View style={styles.row}>{([{
      label: '上移',
      key: 'move-up',
      disabled: busy || first,
      work: onMoveUp
    }, {
      label: '下移',
      key: 'move-down',
      disabled: busy || last,
      work: onMoveDown
    }, {
      label: '移出',
      key: 'remove',
      disabled: busy,
      work: onRemove
    }] as const).map(action => <Pressable key={action.key} accessibilityRole="button" accessibilityState={{
      disabled: action.disabled
    }} accessibilityLabel={tr(action.label)} testID={`${prefix}-${action.key}-${id}`} disabled={action.disabled} onPress={action.work} style={styles.hit}><Text style={[styles.action, action.disabled && styles.disabled]}>{tr(action.label)}</Text></Pressable>)}</View>;
}
export function AlbumEditorFields({
  name,
  opening,
  busy,
  onName,
  onOpening,
  onSaveName,
  onSaveOpening,
  prefix = 'life-album-manage',
  maxName,
  maxOpening
}: {
  name: string;
  opening: string;
  busy: boolean;
  onName: (value: string) => void;
  onOpening: (value: string) => void;
  onSaveName: () => void;
  onSaveOpening: () => void;
  prefix?: string;
  maxName?: number;
  maxOpening?: number;
}) {
  return <><Text style={styles.label}>{tr('册名')}</Text><TextInput accessibilityLabel={tr('册名')} testID={`${prefix}-name`} value={name} onChangeText={onName} editable={!busy} maxLength={maxName} style={styles.input} /><Pressable accessibilityRole="button" accessibilityState={{
      disabled: busy
    }} accessibilityLabel={tr('保存册名')} testID={`${prefix}-save-name`} disabled={busy} onPress={onSaveName} style={styles.hit}><Text style={[styles.action, busy && styles.disabled]}>{tr('保存册名')}</Text></Pressable><Text style={styles.label}>{tr('开篇')}</Text><Text style={styles.hint}>{ALBUM_OPENING_HINT}</Text><TextInput accessibilityLabel={tr('开篇')} testID={`${prefix}-opening`} value={opening} onChangeText={onOpening} editable={!busy} multiline maxLength={maxOpening} style={styles.input} /><Pressable accessibilityRole="button" accessibilityState={{
      disabled: busy
    }} accessibilityLabel={tr('保存开篇')} testID={`${prefix}-save-opening`} disabled={busy} onPress={onSaveOpening} style={styles.hit}><Text style={[styles.action, busy && styles.disabled]}>{tr('保存开篇')}</Text></Pressable></>;
}
const styles = StyleSheet.create({
  createLabel: {
    ...type.meta,
    color: inkSoft,
    marginBottom: 8,
    marginTop: 8
  },
  createInput: {
    fontSize: type.body.fontSize,
    color: ink,
    width: '100%',
    minHeight: 48,
    paddingTop: 12,
    paddingBottom: 12,
    paddingRight: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: sage
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center'
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  hit: {
    minHeight: 48,
    justifyContent: 'center',
    alignSelf: 'flex-start'
  },
  action: {
    ...type.action,
    color: sage
  },
  disabled: {
    opacity: 0.45
  },
  doneHit: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: paperDeep,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sage,
    justifyContent: 'center'
  },
  doneLabel: {
    ...type.action,
    color: ink
  },
  label: {
    ...type.meta,
    color: sage,
    marginTop: 4
  },
  hint: {
    ...type.meta,
    color: inkSoft
  },
  input: {
    fontSize: type.body.fontSize,
    color: ink,
    minHeight: 48,
    paddingTop: 12,
    paddingBottom: 12
  }
});
