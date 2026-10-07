import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getUseCases } from '../application/container';
import { isApplicationError } from '../application/errors';
import {
  ALBUM_COLLECT_MENU,
  ALBUM_COLLECTED_ACTION,
  ALBUM_JOIN_ACTION,
  ALBUM_NEW_ACTION,
  ALBUM_READ_FAILED,
  ALBUM_WRITE_FAILED,
  albumEntryCountLabel,
  type AlbumListItem,
} from '../application/life-album';
import { albumCollectCreateHref } from './album-collect-create-intent';
import { AlbumCoverFace, AlbumCoverMeta } from './album-cover-tile';
import { albumCoverWallLayout, ALBUM_COVER_WALL_GAP } from './album-cover-wall';
import {
  COLLECT_SHEET_RADIUS,
  collectSheetMaskColor,
  collectSheetMaxHeight,
  collectSheetPaperColor,
  collectSheetShadowColor,
  collectSheetUsesBackdropBlur,
  shouldApplyCollectSheetResult,
} from './life-album-collect-sheet-chrome';
import { LifeIcon } from './life-icons';
import { ink, inkSoft, paperDeep, sage } from './life-page';
import { Text, type } from './life-text';

export { shouldApplyCollectSheetResult } from './life-album-collect-sheet-chrome';

const FOOTER_GAP = 12;
/** Below this inner width, stack create/cancel so labels stay uncropped. */
const FOOTER_STACK_BELOW = 300;

export function LifeAlbumCollectSheet({
  visible,
  momentId,
  onClose,
}: {
  visible: boolean;
  momentId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sheetMax = collectSheetMaxHeight({
    windowHeight: height,
    topInset: insets.top,
    bottomInset: insets.bottom,
  });
  const [albums, setAlbums] = useState<AlbumListItem[]>([]);
  const [contained, setContained] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [wallWidth, setWallWidth] = useState<number | null>(null);
  const [footerWidth, setFooterWidth] = useState<number | null>(null);
  const [reduceTransparency, setReduceTransparency] = useState<boolean | null>(null);
  const wallLayout = albumCoverWallLayout(wallWidth);
  const footerStacked = footerWidth != null && footerWidth < FOOTER_STACK_BELOW;
  // expo-glass-effect already linked (iOS 26+). Falls back to solid when unavailable.
  const blurAvailable = Platform.OS === 'ios' && isLiquidGlassAvailable();
  const usesBlur = collectSheetUsesBackdropBlur({
    reduceTransparency,
    blurAvailable,
  });
  const sheetKey = `${visible ? 'open' : 'closed'}:${momentId}:${loadKey}`;
  const [resetKey, setResetKey] = useState(sheetKey);
  const sessionRef = useRef(0);
  const cancelledRef = useRef(false);
  const busyRef = useRef(false);
  if (resetKey !== sheetKey) {
    setResetKey(sheetKey);
    if (visible) {
      setError(null);
      setBusyId(null);
      setWallWidth(null);
    }
  }

  useEffect(() => {
    if (!visible) return;
    busyRef.current = false;
  }, [visible, momentId, loadKey]);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((value) => {
        if (alive) setReduceTransparency(value === true);
      })
      .catch(() => {
        // Query failed → solid paper + plain mask (no blur claimed).
        if (alive) setReduceTransparency(true);
      });
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', (value) => {
      setReduceTransparency(value === true);
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  function dismiss() {
    sessionRef.current += 1;
    cancelledRef.current = true;
    onClose();
  }

  useEffect(() => {
    sessionRef.current += 1;
    const session = sessionRef.current;
    if (!visible) {
      cancelledRef.current = true;
      return;
    }
    cancelledRef.current = false;
    getUseCases()
      .then(async (app) => {
        const [list, ids] = await Promise.all([
          app.listAlbums(),
          app.albumIdsContainingMoment(momentId),
        ]);
        if (!shouldApplyCollectSheetResult({
          session,
          currentSession: sessionRef.current,
          cancelled: cancelledRef.current,
        })) {
          return;
        }
        if (list.status === 'ready') setAlbums(list.albums);
        else setError(ALBUM_READ_FAILED);
        setContained(ids);
      })
      .catch(() => {
        if (
          shouldApplyCollectSheetResult({
            session,
            currentSession: sessionRef.current,
            cancelled: cancelledRef.current,
          })
        ) {
          setError(ALBUM_READ_FAILED);
        }
      });
    return () => {
      cancelledRef.current = true;
    };
  }, [visible, momentId, loadKey]);

  async function collectInto(albumId: string) {
    if (busyRef.current || busyId || contained.includes(albumId)) return;
    const session = sessionRef.current;
    busyRef.current = true;
    setBusyId(albumId);
    setError(null);
    try {
      const app = await getUseCases();
      await app.collectAlbumEntry({ albumId, momentId });
      if (
        !shouldApplyCollectSheetResult({
          session,
          currentSession: sessionRef.current,
          cancelled: cancelledRef.current,
        })
      ) {
        return;
      }
      setContained((ids) => (ids.includes(albumId) ? ids : [...ids, albumId]));
    } catch (caught) {
      if (
        !shouldApplyCollectSheetResult({
          session,
          currentSession: sessionRef.current,
          cancelled: cancelledRef.current,
        })
      ) {
        return;
      }
      setError(isApplicationError(caught) ? caught.message : ALBUM_WRITE_FAILED);
    } finally {
      if (
        shouldApplyCollectSheetResult({
          session,
          currentSession: sessionRef.current,
          cancelled: cancelledRef.current,
        })
      ) {
        busyRef.current = false;
        setBusyId(null);
      }
    }
  }

  function openCreate() {
    if (busyRef.current || busyId) return;
    const href = albumCollectCreateHref(momentId);
    dismiss();
    router.push(href);
  }

  const paperFill = collectSheetPaperColor(usesBlur);
  const maskColor = collectSheetMaskColor(usesBlur);
  const createBusy = !!busyId;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={dismiss}
      accessibilityViewIsModal
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
        testID="life-album-collect-sheet"
      >
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {usesBlur ? (
            <GlassView
              testID="life-album-sheet-blur"
              glassEffectStyle="regular"
              colorScheme="light"
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
              accessible={false}
              importantForAccessibility="no"
            />
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭"
            testID="life-album-sheet-mask"
            onPress={dismiss}
            style={[StyleSheet.absoluteFill, { backgroundColor: maskColor }]}
          />
        </View>

        {/* Outer lift: soft shadow. Inner clip: continuous radius + paper fill. */}
        <View
          style={styles.sheetLift}
          testID="life-album-sheet-lift"
          pointerEvents="box-none"
        >
          <View
            style={[
              styles.sheetClip,
              { maxHeight: sheetMax, backgroundColor: paperFill },
            ]}
            accessibilityLabel={ALBUM_COLLECT_MENU}
            testID="life-album-sheet-panel"
            onStartShouldSetResponder={() => true}
          >
            <Text style={styles.title}>{ALBUM_COLLECT_MENU}</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <ScrollView
              testID="life-album-collect-sheet-scroll"
              style={styles.sheetScroll}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
            >
              <View
                testID="life-album-collect-cover-wall"
                style={[styles.wall, { gap: ALBUM_COVER_WALL_GAP }]}
                onLayout={(event) => {
                  const next = Math.round(event.nativeEvent.layout.width);
                  setWallWidth((prev) => (prev === next ? prev : next));
                }}
              >
                {albums.map((album) => {
                  const already = contained.includes(album.id);
                  const joining = busyId === album.id;
                  const busy = !!busyId;
                  const statusLabel = already ? ALBUM_COLLECTED_ACTION : ALBUM_JOIN_ACTION;
                  const a11y = `${album.name}，${albumEntryCountLabel(album.entryCount)}，${statusLabel}`;
                  return (
                    <View key={album.id} style={[styles.tile, { width: wallLayout.tileWidth }]}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ disabled: busy || already }}
                        accessibilityLabel={a11y}
                        testID={`life-album-sheet-tile-${album.id}`}
                        disabled={busy || already}
                        onPress={() => {
                          void collectInto(album.id);
                        }}
                        style={styles.tileHit}
                      >
                        <AlbumCoverFace
                          name={album.name}
                          coverUri={album.coverUri}
                          width={wallLayout.tileWidth}
                          height={wallLayout.tileHeight}
                          wordsTestID={`life-album-sheet-words-cover-${album.id}`}
                        />
                        <AlbumCoverMeta name={album.name} entryCount={album.entryCount} />
                      </Pressable>
                      {already ? (
                        <Text
                          accessibilityRole="text"
                          accessibilityLabel={a11y}
                          testID={`life-album-sheet-status-${album.id}`}
                          style={styles.status}
                        >
                          {ALBUM_COLLECTED_ACTION}
                        </Text>
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ disabled: busy }}
                          accessibilityLabel={a11y}
                          testID={`life-album-sheet-${album.id}`}
                          disabled={busy}
                          onPress={() => {
                            void collectInto(album.id);
                          }}
                          style={[styles.capsule, busy && styles.capsuleDisabled]}
                        >
                          <Text style={styles.capsuleLabel}>
                            {joining ? '正在加入' : ALBUM_JOIN_ACTION}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
              {error ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="再试一次"
                  onPress={() => setLoadKey((value) => value + 1)}
                  style={styles.hit}
                >
                  <Text style={styles.action}>再试一次</Text>
                </Pressable>
              ) : null}
            </ScrollView>
            <View
              testID="life-album-sheet-footer"
              style={[styles.footer, footerStacked && styles.footerStacked]}
              onLayout={(event) => {
                const next = Math.round(event.nativeEvent.layout.width);
                setFooterWidth((prev) => (prev === next ? prev : next));
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={ALBUM_NEW_ACTION}
                accessibilityState={{ disabled: createBusy }}
                testID="life-album-sheet-create"
                disabled={createBusy}
                onPress={openCreate}
                style={[
                  styles.createHit,
                  footerStacked ? styles.createHitStacked : styles.createHitRow,
                  createBusy && styles.createHitDisabled,
                ]}
              >
                <LifeIcon name="plus" size={18} color={ink} decorative />
                <Text style={styles.createLabel} numberOfLines={1}>
                  {ALBUM_NEW_ACTION}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="取消"
                testID="life-album-sheet-cancel"
                onPress={dismiss}
                style={[
                  styles.cancelHit,
                  footerStacked ? styles.cancelHitStacked : styles.cancelHitRow,
                ]}
              >
                <Text style={styles.cancelLabel} numberOfLines={1}>
                  取消
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sheetLift: {
    zIndex: 1,
    borderRadius: COLLECT_SHEET_RADIUS,
    shadowColor: collectSheetShadowColor,
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  sheetClip: {
    borderRadius: COLLECT_SHEET_RADIUS,
    borderCurve: 'continuous',
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 10,
    gap: 8,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  title: { ...type.action, color: ink },
  wall: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    alignSelf: 'stretch',
  },
  tile: {
    gap: 8,
    marginBottom: 4,
  },
  tileHit: {
    minHeight: 48,
    gap: 6,
  },
  status: {
    ...type.meta,
    color: inkSoft,
    minHeight: 48,
    textAlignVertical: 'center',
    paddingTop: 12,
  },
  error: { ...type.meta, color: inkSoft },
  action: { ...type.action, color: sage },
  hit: { minHeight: 48, justifyContent: 'center' },
  capsule: {
    minHeight: 48,
    minWidth: 88,
    paddingHorizontal: 14,
    borderRadius: 24,
    backgroundColor: paperDeep,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sage,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  capsuleDisabled: { opacity: 0.45 },
  capsuleLabel: { ...type.action, color: ink, fontSize: 14 },
  footer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: FOOTER_GAP,
    marginTop: 2,
    paddingBottom: 2,
  },
  footerStacked: {
    flexDirection: 'column',
  },
  createHit: {
    minHeight: 48,
    borderRadius: 22,
    backgroundColor: paperDeep,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(90, 100, 90, 0.28)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
  },
  createHitRow: {
    flex: 2,
  },
  createHitStacked: {
    alignSelf: 'stretch',
  },
  createHitDisabled: { opacity: 0.45 },
  createLabel: { ...type.action, color: ink },
  cancelHit: {
    minHeight: 48,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(90, 100, 90, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  cancelHitRow: {
    flex: 1,
  },
  cancelHitStacked: {
    alignSelf: 'stretch',
  },
  cancelLabel: { ...type.action, color: sage },
});
