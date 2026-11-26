import {StyleSheet} from 'react-native';
import {hairline,ink,inkSoft,paperDeep,sage} from './life-page';
import {type} from './life-text';

/** One geometry for personal and family album overview pages. */
export const albumOverviewStyles=StyleSheet.create({
  hero: { gap: 18 },
  heroCover: { width: '100%', aspectRatio: 1.85, backgroundColor: paperDeep, overflow: 'hidden' },
  coverQuiet: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  coverSpine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, backgroundColor: sage, opacity: .65 },
  heroCopy: { gap: 5 },
  heroTitle: { ...type.title, color: ink, fontWeight: '500', marginBottom: 2 },
  count: { ...type.meta, color: inkSoft, fontSize: 13, lineHeight: 20 },
  primaryActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 8, paddingBottom: 8 },
  primaryHit: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 12 },
  primaryLabel: { ...type.action, color: ink, fontWeight: '500' },
  secondaryHit: { paddingLeft: 16, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: hairline },
  secondaryLabel: { ...type.meta, color: sage, flexShrink: 1 },
  headerAction: { minWidth: 54, minHeight: 48, alignItems: 'flex-end', justifyContent: 'center' },
  menuHit: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  menu: { gap: 2, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: hairline },
});
