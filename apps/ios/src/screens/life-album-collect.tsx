import { Pressable, StyleSheet, View } from 'react-native';

import {
  ALBUM_ALREADY_IN,
  ALBUM_COLLECT_ACTION,
  ALBUM_COLLECT_MENU,
  ALBUM_COLLECTED_ACTION,
  ALBUM_EXIT_COLLECT,
  ALBUM_GONE,
  ALBUM_LOADING,
  ALBUM_NEW_ACTION,
  ALBUM_WRITE_FAILED,
  albumCollectingLabel,
} from '../application/life-album';
import { ink, inkSoft, sage } from './life-page';
import { Text, type } from './life-text';

export function LifeAlbumCollectBanner({
  name,
  missing,
  loading,
  error,
  onExit,
}: {
  name?: string;
  missing?: boolean;
  loading?: boolean;
  error?: string | null;
  onExit: () => void;
}) {
  const title = missing
    ? ALBUM_GONE
    : loading
      ? ALBUM_LOADING
      : name
        ? albumCollectingLabel(name)
        : ALBUM_LOADING;
  return (
    <View style={styles.banner} testID="life-album-collect-banner">
      <Text style={styles.bannerTitle}>{title}</Text>
      {error ? <Text style={styles.bannerError}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={ALBUM_EXIT_COLLECT}
        testID="life-album-collect-exit"
        onPress={onExit}
        style={styles.hit}
      >
        <Text style={styles.exit}>{ALBUM_EXIT_COLLECT}</Text>
      </Pressable>
    </View>
  );
}

export function LifeAlbumCollectAction({
  collected,
  busy,
  disabled,
  error,
  onPress,
  testID,
}: {
  collected: boolean;
  busy?: boolean;
  disabled?: boolean;
  error?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const label = collected ? ALBUM_COLLECTED_ACTION : ALBUM_COLLECT_ACTION;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled || !!busy, selected: collected }}
        accessibilityLabel={label}
        testID={testID}
        onPress={disabled || busy ? undefined : onPress}
        style={styles.hit}
      >
        <Text style={[styles.collect, (disabled || busy) && styles.disabled]}>{label}</Text>
      </Pressable>
      {error ? <Text style={styles.bannerError}>{ALBUM_WRITE_FAILED}</Text> : null}
    </View>
  );
}

export function lifeAlbumCollectMenuTitle(): string {
  return ALBUM_COLLECT_MENU;
}

export function lifeAlbumAlreadyInLabel(): string {
  return ALBUM_ALREADY_IN;
}

export function lifeAlbumNewActionLabel(): string {
  return ALBUM_NEW_ACTION;
}

const styles = StyleSheet.create({
  banner: {
    gap: 8,
    paddingBottom: 12,
  },
  bannerTitle: {
    ...type.action,
    color: ink,
  },
  bannerError: {
    ...type.meta,
    color: inkSoft,
  },
  exit: {
    ...type.action,
    color: sage,
  },
  collect: {
    ...type.meta,
    color: inkSoft,
  },
  disabled: {
    opacity: 0.45,
  },
  hit: {
    minHeight: 48,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
});
