import { Image, StyleSheet, View } from 'react-native';
import { Text, type } from './life-text';

import type { FIRST_RUN_SCREENS } from '../application/first-run';
import { isCompactHeight, pageGutter, paper, readingWidth } from './life-page';

const PHOTOS = {
  coffee: require('../../assets/first-run/coffee.jpg'),
  flowers: require('../../assets/first-run/flowers.jpg'),
  window: require('../../assets/first-run/window.jpg'),
} as const;

export function firstRunPhotoBox(windowWidth: number, windowHeight: number) {
  const width = Math.min(
    readingWidth(windowWidth, windowHeight),
    Math.max(windowWidth - pageGutter(windowWidth, windowHeight) * 2, 0),
  );
  const height = isCompactHeight(windowHeight)
    ? Math.max(112, Math.round(windowHeight * 0.26))
    : Math.min(Math.round(windowHeight * 0.36), Math.round(width * 0.72), 280);
  return { width, height };
}

export function FirstRunScene({
  id,
  photo,
  photoAlt,
  photoNote,
  photoWidth,
  photoHeight,
}: {
  id: (typeof FIRST_RUN_SCREENS)[number]['id'];
  photo: (typeof FIRST_RUN_SCREENS)[number]['photo'];
  photoAlt: string;
  photoNote: string;
  photoWidth: number;
  photoHeight: number;
}) {
  return (
    <View testID={`first-run-scene-${id}`} style={[styles.scene, { width: photoWidth }]}>
      <View style={[styles.photoWrap, { width: photoWidth, height: photoHeight }]}>
        <Image
          testID={`first-run-photo-${id}`}
          source={PHOTOS[photo]}
          accessibilityLabel={photoAlt}
          resizeMode="cover"
          style={styles.photo}
        />
        <View pointerEvents="none" style={styles.shade} />
        <Text style={styles.note} testID={`first-run-photo-note-${id}`}>
          {photoNote}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { alignSelf: 'center' },
  photoWrap: {
    overflow: 'hidden',
    backgroundColor: paper,
    justifyContent: 'flex-end',
  },
  photo: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  shade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '40%',
    backgroundColor: 'rgba(37,35,31,0.28)',
  },
  note: {
    ...type.meta,
    color: paper,
    paddingHorizontal: 14,
    paddingBottom: 14,
    textShadowColor: 'rgba(37,35,31,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
