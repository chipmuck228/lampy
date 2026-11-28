import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ImageView } from '../application/use-cases';
import { MomentImages, momentImageAspectRatio } from './moment-images';

/** Full image, bounded by both width and height; never crop to fill the page. */
export function recentEditorialImageSize(image: ImageView, width: number, maxHeight: number) {
  const ratio = momentImageAspectRatio(image);
  const fittedWidth = Math.min(Math.max(1, width), maxHeight * ratio);
  return { width: fittedWidth, height: fittedWidth / ratio };
}

export function RecentEditorialPhotos({ images, maxHeight, testIDPrefix, wrapAvailable }: {
  images: ImageView[];
  maxHeight: number;
  testIDPrefix: string;
  wrapAvailable: (image: ImageView, slot: ReactNode) => ReactNode;
}) {
  const [width, setWidth] = useState(0);
  return <View testID={`${testIDPrefix}-wall`} style={styles.wall}
    onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    {images.map((image, index) => {
      const lead = images.length === 1 || (images.length >= 3 && index === 0);
      const cellWidth = lead ? width : Math.max(1, width * 0.48);
      const cap = images.length >= 3 ? maxHeight * (lead ? 0.62 : 0.34) : maxHeight;
      return <View key={image.id} testID={`${testIDPrefix}-tile-${image.id}`}
        style={[styles.tile, { width: lead ? '100%' : '48%' }]}>
        <MomentImages images={[image]} testIDPrefix={testIDPrefix}
          frameSize={recentEditorialImageSize(image, cellWidth || 280, cap)}
          wrapAvailable={wrapAvailable} />
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  wall: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  tile: { minWidth: 0 },
});
