import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import type { ImageView } from '../application/use-cases';

export function MomentImages({
  images,
  testIDPrefix,
  onRemoveImage,
}: {
  images: ImageView[];
  testIDPrefix: string;
  onRemoveImage?: (assetId: string) => void;
}) {
  if (images.length === 0) return null;

  return (
    <View style={styles.stack}>
      {images.map((image) => {
        const ratio =
          image.width && image.height && image.width > 0 && image.height > 0
            ? image.width / image.height
            : 4 / 3;
        return (
          <View key={image.id} style={styles.item}>
            <View
              accessible
              accessibilityRole="image"
              accessibilityLabel={
                image.status === 'available'
                  ? image.label
                  : `${image.label}。${image.unavailableLabel}`
              }
              style={[styles.frame, { aspectRatio: ratio }]}
            >
              {image.status === 'available' && image.uri ? (
                <Image
                  testID={`${testIDPrefix}-${image.id}`}
                  source={{ uri: image.uri }}
                  style={styles.image}
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
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  item: { gap: 8 },
  frame: {
    width: '100%',
    maxHeight: 520,
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  missing: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 88,
  },
  missingText: { fontSize: 16, lineHeight: 24, color: '#5C5851' },
  removeHit: { minHeight: 44, justifyContent: 'center' },
  remove: { fontSize: 16, lineHeight: 22, color: '#87513D' },
});
