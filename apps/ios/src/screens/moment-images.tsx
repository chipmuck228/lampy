import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import type { ImageView } from '../application/use-cases';
import { clay } from './life-page';

export function momentImageAspectRatio(image: { width?: number; height?: number }): number {
  if (image.width && image.height && image.width > 0 && image.height > 0) {
    return image.width / image.height;
  }
  return 4 / 3;
}

export function isPortraitLikeImage(image: { width?: number; height?: number }): boolean {
  return momentImageAspectRatio(image) <= 1;
}

export type DetailImageBand = {
  kind: 'solo' | 'pair';
  images: ImageView[];
};

export function detailImageBands(images: ImageView[]): DetailImageBand[] {
  if (images.length === 0) return [];
  if (images.length === 1) return [{ kind: 'solo', images }];
  if (images.length === 2) {
    if (isPortraitLikeImage(images[0]) && isPortraitLikeImage(images[1])) {
      return [{ kind: 'pair', images }];
    }
    return images.map((image) => ({ kind: 'solo' as const, images: [image] }));
  }

  const bands: DetailImageBand[] = [{ kind: 'solo', images: [images[0]] }];
  const rest = images.slice(1);
  if (rest.length === 2 && isPortraitLikeImage(rest[0]) && isPortraitLikeImage(rest[1])) {
    bands.push({ kind: 'pair', images: rest });
    return bands;
  }
  for (const image of rest) {
    bands.push({ kind: 'solo', images: [image] });
  }
  return bands;
}

function ImageSlot({
  image,
  testIDPrefix,
  onRemoveImage,
  paired,
}: {
  image: ImageView;
  testIDPrefix: string;
  onRemoveImage?: (assetId: string) => void;
  paired?: boolean;
}) {
  const ratio = momentImageAspectRatio(image);
  return (
    <View style={[styles.item, paired && styles.pairedItem]}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          image.status === 'available' ? image.label : `${image.label}。${image.unavailableLabel}`
        }
        testID={`${testIDPrefix}-frame-${image.id}`}
        style={[styles.frame, { aspectRatio: ratio }]}
      >
        {image.status === 'available' && image.uri ? (
          <Image
            testID={`${testIDPrefix}-${image.id}`}
            source={{ uri: image.uri }}
            style={[styles.image, { aspectRatio: ratio }]}
            contentFit="cover"
            accessible={false}
          />
        ) : (
          <View testID={`${testIDPrefix}-unavailable-${image.id}`} style={styles.missing}>
            <Text style={styles.missingText} accessible={false}>
              {image.unavailableLabel || '这张照片暂时找不到了，但这条记录还在。'}
            </Text>
          </View>
        )}
      </View>
      {onRemoveImage ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`移除这张照片，${image.label}`}
          testID={`${testIDPrefix}-remove-${image.id}`}
          onPress={() => {
            onRemoveImage(image.id);
          }}
          style={styles.removeHit}
        >
          <Text style={styles.remove}>移除这张照片</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function MomentImages({
  images,
  testIDPrefix,
  onRemoveImage,
  rhythm = false,
}: {
  images: ImageView[];
  testIDPrefix: string;
  onRemoveImage?: (assetId: string) => void;
  rhythm?: boolean;
}) {
  if (images.length === 0) return null;

  const bands = rhythm
    ? detailImageBands(images)
    : images.map((image) => ({ kind: 'solo' as const, images: [image] }));

  return (
    <View style={styles.stack}>
      {bands.map((band) => (
        <View
          key={band.images.map((image) => image.id).join('-')}
          testID={band.kind === 'pair' ? `${testIDPrefix}-band-pair` : undefined}
          style={band.kind === 'pair' ? styles.pair : undefined}
        >
          {band.images.map((image) => (
            <ImageSlot
              key={image.id}
              image={image}
              testIDPrefix={testIDPrefix}
              onRemoveImage={onRemoveImage}
              paired={band.kind === 'pair'}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16, width: '100%', maxWidth: '100%', minWidth: 0 },
  pair: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
  },
  item: { gap: 8, width: '100%', maxWidth: '100%', minWidth: 0 },
  pairedItem: { flex: 1, width: undefined },
  frame: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
    position: 'relative',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
  },
  missing: {
    width: '100%',
    justifyContent: 'center',
    paddingVertical: 24,
    minHeight: 88,
  },
  missingText: { fontSize: 17, lineHeight: 26, color: clay },
  removeHit: { minHeight: 44, justifyContent: 'center' },
  remove: { fontSize: 16, lineHeight: 22, color: clay },
});
