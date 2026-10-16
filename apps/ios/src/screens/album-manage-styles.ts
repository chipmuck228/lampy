import {StyleSheet} from 'react-native';
import {hairline,ink,paperDeep} from './life-page';
import {type} from './life-text';

// Personal and family books share the same management geometry.
export const albumManageStyles=StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 },
  heroCover: {
    width: 72,
    height: 96,
    borderRadius: 4,
    backgroundColor: paperDeep,
    overflow: 'hidden',
    justifyContent: 'center',
    padding: 8,
    flexShrink: 0,
  },
  heroImage: { width: 72, height: 96 },
  heroWords: { ...type.meta, color: ink, fontSize: 13, lineHeight: 18 },
  heroCopy: { flex: 1, minWidth: 0, gap: 6 },
  heroTitle: { ...type.action, color: ink, flexShrink: 1 },
  entry: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: hairline,
    paddingTop: 10,
    gap: 6,
  },
  entryHit: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 48 },
  entryCopy: { flex: 1, minWidth: 0, gap: 2 },
  thumb: { width: 56, height: 56, borderRadius: 4, backgroundColor: paperDeep, flexShrink: 0 },
  mediaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  audioMark: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
