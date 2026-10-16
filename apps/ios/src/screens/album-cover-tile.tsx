import {LifeIcon} from './life-icons';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { albumEntryCountLabel } from '../application/life-album';
import { ALBUM_COVER_RADIUS } from './album-cover-wall';
import { hairline, ink, inkSoft, paperDeep } from './life-page';
import { Text, type } from './life-text';

/** Shared cover face: photo thumbnail or warm words fallback (missing / read fail). */
export function AlbumCoverFace({
  name,
  coverUri,
  width,
  height,
  wordsTestID,
  privateMedia = false,
}: {
  name: string;
  coverUri: string | null;
  width: number;
  height: number;
  wordsTestID?: string;
  privateMedia?: boolean;
}) {
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      changed = true;
      if (active) setReduceMotion(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (active && !changed) setReduceMotion(value);
    }).catch(() => undefined);
    return () => { active = false; subscription.remove(); };
  }, []);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showImage = !!coverUri && failedUri !== coverUri;

  return (
    <View style={[styles.cover, { width, height }]}>
      {showImage ? (
        <Image
          source={{ uri: coverUri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={reduceMotion ? 0 : {duration: 960, effect: 'cross-dissolve'}}
          cachePolicy={privateMedia ? "none" : undefined}
          accessibilityIgnoresInvertColors
          onError={() => setFailedUri(coverUri)}
        />
      ) : (
        <View style={styles.wordsCover} testID={wordsTestID}>
          <Text style={styles.wordsName} numberOfLines={3}>
            {name}
          </Text>
        </View>
      )}
    </View>
  );
}

/** Shared name + real entry count under a cover. */
export function AlbumCoverMeta({ name, entryCount }: { name: string; entryCount: number }) {
  return (
    <View style={styles.metaBlock}>
      <Text style={styles.tileName} numberOfLines={2}>
        {name}
      </Text>
      <Text style={styles.tileMeta}>{albumEntryCountLabel(entryCount)}</Text>
    </View>
  );
}

/** A creation slot occupies the same cover grid cell as an existing book. */
export function AlbumCreateTile({width,height,label,onPress,testID}:{width:number;height:number;label:string;onPress:()=>void;testID?:string}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} testID={testID} style={{width,minHeight:48,gap:6}}>
    <View style={[styles.cover,{width,height,alignItems:'center',justifyContent:'center'}]}><LifeIcon name="plus" size={32} color={inkSoft} decorative/></View>
  </Pressable>;
}

const styles = StyleSheet.create({
  cover: {
    borderRadius: ALBUM_COVER_RADIUS,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: paperDeep,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: hairline,
  },
  wordsCover: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 14,
    justifyContent: 'flex-end',
    backgroundColor: paperDeep,
  },
  wordsName: { ...type.action, color: ink, fontSize: 17, lineHeight: 24 },
  metaBlock: { gap: 6 },
  tileName: { ...type.action, color: ink, fontSize: 16, lineHeight: 22 },
  tileMeta: { ...type.meta, color: inkSoft },
});
