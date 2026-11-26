import { tr } from '../i18n';
import { Pressable, StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import { Text, type } from './life-text';
import { SymbolView } from 'expo-symbols';

import { inkSoft, sage } from './life-page';

export const LIFE_ICON_NAMES = {
  share:'square.and.arrow.up',
  trash:'trash',
  settings: 'gearshape',
  person: 'person.crop.circle',
  back: 'chevron.left',
  open: 'chevron.right',
  lock: 'lock',
  info: 'info.circle',
  storage: 'internaldrive',
  subscribe: 'creditcard',
  help: 'questionmark.circle',
  terms: 'doc.text',
  privacy: 'hand.raised',
  play: 'play.fill',
  pause: 'pause.fill',
  replay: 'gobackward',
  camera: 'camera',
  photo: 'photo.on.rectangle',
  record: 'mic',
  expand: 'chevron.down',
  collapse: 'chevron.up',
  plus: 'plus',
  recent: 'line.3.horizontal',
  lookback: 'book',
  family: 'person.2',
  album: 'text.book.closed',
  more: 'ellipsis',
  clear: 'xmark.circle.fill',
  refresh: 'arrow.clockwise',
  check: 'checkmark.circle',
  printer: 'printer',
  textCursor: 'character.cursor.ibeam',
  edition: 'square.stack.3d.up',
  waveform: 'waveform',
  sealed: 'checkmark.seal',
} as const;

const ANDROID_ICON_NAMES = {
  share:'ios_share',trash:'delete_outline',
  settings:'settings', person:'account_circle', back:'chevron_left', open:'chevron_right',
  lock:'lock', info:'info', storage:'storage', subscribe:'credit_card', help:'help',
  terms:'description', privacy:'front_hand', play:'play_arrow', pause:'pause',
  replay:'replay', camera:'photo_camera', photo:'photo_library', record:'mic',
  expand:'expand_more', collapse:'expand_less', plus:'add', recent:'list',
  lookback:'menu_book', family:'group', album:'book', more:'more_horiz',
  clear:'cancel', refresh:'refresh', check:'check_circle',
  printer:'print', textCursor:'text_fields', edition:'library_books', waveform:'graphic_eq', sealed:'verified',
} as const satisfies Record<keyof typeof LIFE_ICON_NAMES, string>;

export type LifeIconName = keyof typeof LIFE_ICON_NAMES;

/** Shared editorial linework: one stroke and tint on iOS and Android. */
function NavigationIcon({name,size,color,decorative}:{name:LifeIconName;size:number;color:string;decorative:boolean}) {
  const stroke={borderWidth:1.7,borderColor:color};
  const square=(left:number,top:number,width:number,height=width)=>({position:'absolute' as const,left,top,width,height,...stroke,borderRadius:2.5});
  return <View testID={`life-navigation-icon-${name}`} style={{width:size,height:size}} accessibilityElementsHidden={decorative} importantForAccessibility={decorative?'no':'auto'}>
    <View style={{width:24,height:24,transform:[{scale:size/24}],transformOrigin:'top left'}}>
      {name==='recent'?<>{[5,12,19].map(top=><View key={top} style={{position:'absolute',left:3,top,width:18,height:1.7,borderRadius:1,backgroundColor:color}}/>)}</>:null}
      {name==='lookback'?<><View style={square(2,7,9,15)}/><View style={square(2,14,16,8)}/><View style={square(14,2,8)}/></>:null}
      {name==='album'?<><View style={square(2,3,10,18)}/><View style={square(12,3,10,18)}/><View style={{position:'absolute',left:11.2,top:4,width:1.7,height:18,backgroundColor:color}}/></>:null}
      {name==='family'?<>
        <View style={{...square(3,2,7),borderRadius:4}}/><View style={{...square(1,10,12,8),borderRadius:7,borderBottomWidth:0}}/>
        <View style={{...square(15,14,7),borderRadius:4}}/><View style={{...square(13,21,11,3),borderRadius:7,borderBottomWidth:0}}/>
        <View style={{...square(14,1,9,10),borderTopRightRadius:12,borderBottomWidth:0,borderLeftWidth:0}}/>
        <View style={{...square(1,17,9,7),borderBottomLeftRadius:12,borderTopWidth:0,borderRightWidth:0}}/>
      </>:null}
    </View>
  </View>;
}

export function LifeIcon({
  name,
  size = 18,
  color = sage,
  decorative = true,
}: {
  name: LifeIconName;
  size?: number;
  color?: string;
  decorative?: boolean;
}) {
  if (['recent','lookback','family','album'].includes(name)) return <NavigationIcon name={name} size={size} color={color} decorative={decorative}/>;
  return (
    <SymbolView
      name={{ ios: LIFE_ICON_NAMES[name], android: ANDROID_ICON_NAMES[name] }}
      size={size}
      tintColor={color}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no' : 'auto'}
      fallback={<View style={{ width: size, height: size }} />}
    />
  );
}

export function LifeIconButton({
  name,
  label,
  onPress,
  testID,
  color = inkSoft,
  size = 22,
}: {
  name: LifeIconName;
  label: string;
  onPress: () => void;
  testID?: string;
  color?: string;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      style={styles.iconHit}
    >
      <LifeIcon name={name} size={size} color={color} decorative />
    </Pressable>
  );
}

export function LifeLabeledHit({
  icon,
  label,
  onPress,
  testID,
  disabled,
  accessibilityLabel,
  layoutRevision,
  appearance,
}: {
  icon: LifeIconName;
  label: string;
  onPress: () => void;
  testID?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  layoutRevision?: number;
  appearance?: 'capture';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={[styles.labeledHit,appearance==='capture'&&disabled&&styles.captureDisabled]}
    >
      <View key={`labeled-${layoutRevision ?? 1}`} style={styles.labeledRow}>
        <LifeIcon name={icon} size={appearance==='capture'?19:18} color={sage} decorative />
        <Text key={`labeled-text-${layoutRevision ?? 1}`} style={[styles.labeledText,appearance==='capture'&&styles.captureLabeledText]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

function openChildIds(testID?: string) {
  if (!testID) return null;
  const match = /^(.*)-open-(.+)$/.exec(testID);
  if (!match) return null;
  return {
    row: `${match[1]}-open-row-${match[2]}`,
    label: `${match[1]}-open-label-${match[2]}`,
    mark: `${match[1]}-open-mark-${match[2]}`,
  };
}

export function LookThisHit({
  onPress,
  testID,
  accessibilityLabel,
  caption = tr("看这条"),
  tight,
  align = 'center',
  captionStyle,
}: {
  onPress: () => void;
  testID?: string;
  accessibilityLabel: string;
  caption?: string;
  tight?: boolean;
  align?: 'center' | 'end';
  captionStyle?: StyleProp<TextStyle>;
}) {
  const ids = openChildIds(testID);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={tr("打开这条记录")}
      testID={testID}
      onPress={onPress}
      style={[
        styles.lookThis,
        tight && styles.lookThisTight,
        align === 'end' && styles.lookThisEnd,
      ]}
    >
      <View
        style={[
          styles.lookThisRow,
          tight && styles.lookThisRowTight,
          align === 'end' && styles.lookThisRowEnd,
        ]}
        testID={ids?.row}
      >
        <Text
          style={[styles.lookThisText, align === 'end' && styles.lookThisTextEnd, captionStyle]}
          testID={ids?.label}
        >
          {caption}
        </Text>
        <View accessible={false} testID={ids?.mark} style={styles.lookThisMark}>
          <LifeIcon name="open" size={16} color={sage} decorative />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconHit: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  labeledHit: {
    minWidth: 48,
    minHeight: 48,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  labeledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 48,
  },
  captureLabeledText: { fontSize: 15, lineHeight: 24 },
  captureDisabled: { opacity: .45 },
  labeledText: {
    ...type.action,
    color: sage,
  },
  lookThis: {
    minHeight: 48,
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
  },
  lookThisTight: {
    minHeight: 48,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  lookThisEnd: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  lookThisRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    maxWidth: '100%',
  },
  lookThisRowTight: {
    justifyContent: 'flex-start',
  },
  lookThisRowEnd: {
    flexWrap: 'nowrap',
    flexShrink: 0,
    justifyContent: 'flex-end',
  },
  lookThisText: {
    ...type.action,
    color: sage,
    flexShrink: 1,
  },
  lookThisTextEnd: {
    flexGrow: 0,
    flexShrink: 0,
  },
  lookThisMark: {
    flexShrink: 0,
  },
});
