import { tr } from '../i18n';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import type { ImageView } from '../application/use-cases';
import { clay,inkSoft,paper } from './life-page';
import { Text } from './life-text';
import {LifeIcon} from './life-icons';

export const RECENT_IMAGE_PAIR_MIN_WIDTH = 280;

export function momentImageAspectRatio(image: { width?: number; height?: number }): number {
  if (image.width && image.height && image.width > 0 && image.height > 0) {
    return image.width / image.height;
  }
  return 4 / 3;
}

export function isPortraitLikeImage(image: { width?: number; height?: number }): boolean {
  return momentImageAspectRatio(image) <= 1;
}

export function canPairDetailImages(left: ImageView, right: ImageView): boolean {
  return (
    left.status === 'available' &&
    right.status === 'available' &&
    isPortraitLikeImage(left) &&
    isPortraitLikeImage(right)
  );
}

export type DetailImageBand = {
  kind: 'solo' | 'pair';
  images: ImageView[];
};

export function shouldPairRecentImages(contentWidth: number): boolean {
  return contentWidth >= RECENT_IMAGE_PAIR_MIN_WIDTH;
}

export function recentImageBands(images: ImageView[], pair: boolean): DetailImageBand[] {
  if (!pair) return images.map((image) => ({ kind: 'solo' as const, images: [image] }));
  return detailImageBands(images);
}

export function detailImageBands(images: ImageView[]): DetailImageBand[] {
  if (images.length === 0) return [];
  if (images.length === 1) return [{ kind: 'solo', images }];
  if (images.length === 2) {
    if (canPairDetailImages(images[0], images[1])) {
      return [{ kind: 'pair', images }];
    }
    return images.map((image) => ({ kind: 'solo' as const, images: [image] }));
  }

  const bands: DetailImageBand[] = [{ kind: 'solo', images: [images[0]] }];
  const rest = images.slice(1);
  if (rest.length === 2 && canPairDetailImages(rest[0], rest[1])) {
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
  wrapAvailable,
  appearance,
  frameSize,
}: {
  image: ImageView;
  testIDPrefix: string;
  onRemoveImage?: (assetId: string) => void;
  paired?: boolean;
  wrapAvailable?: (image: ImageView, slot: ReactNode) => ReactNode;
  appearance?: 'capture';
  frameSize?: { width: number; height: number };
}) {
  const capture=appearance==='capture';
  const ratio = capture?4/3:momentImageAspectRatio(image);
  const available = image.status === 'available' && !!image.uri;
  const frame = (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          available ? image.label : `${image.label}。${image.unavailableLabel}`
        }
        testID={`${testIDPrefix}-frame-${image.id}`}
        style={available ? [styles.frame, frameSize ?? { aspectRatio: ratio },frameSize&&styles.boundedFrame,capture&&styles.captureFrame] : [styles.missingFrame,capture&&styles.captureFrame]}
      >
        {available ? (
          <Image
            testID={`${testIDPrefix}-${image.id}`}
            source={{ uri: image.uri }}
            style={[styles.image, frameSize ? { height: '100%' } : { aspectRatio: ratio }]}
            contentFit={capture || frameSize ? 'contain' : 'cover'}
            accessible={false}
          />
        ) : (
          <View testID={`${testIDPrefix}-unavailable-${image.id}`} style={styles.missing}>
            <Text style={styles.missingText} accessible={false}>
              {image.unavailableLabel || tr("这张照片暂时找不到了，但这条记录还在。")}
            </Text>
          </View>
        )}
      </View>
  );
  return (
    <View style={[styles.item, paired && styles.pairedItem]}>
      {available && wrapAvailable ? wrapAvailable(image, frame) : frame}
      {onRemoveImage ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr("移除这张照片，{0}", [image.label])}
          testID={`${testIDPrefix}-remove-${image.id}`}
          onPress={() => {
            onRemoveImage(image.id);
          }}
          style={[styles.removeHit,capture&&available&&styles.captureRemoveHit]}
        >
          {capture&&available?<View style={styles.captureRemoveMark}><LifeIcon name="clear" size={20} color={inkSoft} decorative/></View>:<Text style={styles.remove}>{tr("移除这张照片")}</Text>}
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
  wrapAvailable,
  appearance,
  frameSize,
}: {
  images: ImageView[];
  testIDPrefix: string;
  onRemoveImage?: (assetId: string) => void;
  rhythm?: boolean;
  wrapAvailable?: (image: ImageView, slot: ReactNode) => ReactNode;
  appearance?: 'capture';
  /** A bounded, full-image frame for editorial previews. Other scenes keep their sizing. */
  frameSize?: { width: number; height: number };
}) {
  if (images.length === 0) return null;

  const capture=appearance==='capture';
  const bands = rhythm && !capture
    ? detailImageBands(images)
    : images.map((image) => ({ kind: 'solo' as const, images: [image] }));

  return (
    <View style={[styles.stack,capture&&styles.captureStack]}>
      {bands.map((band) => (
        <View
          key={band.images.map((image) => image.id).join('-')}
          testID={band.kind === 'pair' ? `${testIDPrefix}-band-pair` : undefined}
          style={capture?styles.captureTile:band.kind === 'pair' ? styles.pair : undefined}
        >
          {band.images.map((image) => (
            <ImageSlot
              key={image.id}
              image={image}
              testIDPrefix={testIDPrefix}
              onRemoveImage={onRemoveImage}
              paired={band.kind === 'pair'}
              wrapAvailable={wrapAvailable}
              appearance={appearance}
              frameSize={frameSize}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  boundedFrame: { alignSelf: 'center' },
  captureStack: { gap: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', rowGap: 12 },
  captureTile: { width: '48%' },
  captureFrame: { borderRadius: 5, backgroundColor: '#E9E5DC' },
  captureRemoveHit: { position: 'absolute', top: 0, right: 0, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  captureRemoveMark: { width: 26, height: 26, borderRadius: 13, backgroundColor: paper, alignItems: 'center', justifyContent: 'center' },
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
  missingFrame: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
    minHeight: 88,
    overflow: 'visible',
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
