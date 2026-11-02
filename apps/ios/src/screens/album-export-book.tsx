import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { tr } from '../i18n';
import { ALBUM_PAGE_HEIGHT_PT, ALBUM_PAGE_WIDTH_PT, type AlbumPage } from '../application/album-layout';
import type { AlbumLayoutMediaMap } from '../application/album-layout-input';
import {
  albumLeafPages,
  albumSpreadCount,
  albumSpreadLabel,
  albumSpreadPages,
} from '../application/album-export-showcase';
import { ALBUM_READING_STYLES, type AlbumReadingStyle } from '../application/album-reading';
import { requireAlbumNativePageView } from '../../modules/lampy-album-layout';
import { AlbumBlockView } from './life-album-preview-screen';
import { LifeIcon } from './life-icons';
import { inkSoft, sage } from './life-page';
import { Text, type } from './life-text';

const NativeAlbumPageView = requireAlbumNativePageView() as ComponentType<{
  pageJson: string;
  mediaJson: string;
  playingJson: string;
  renderScale?: number;
  style?: object;
}> | null;

const PERSPECTIVE = 1800;
const FLIP_MS = 640;
const FLIP_EASING = Easing.bezier(0.33, 0, 0.18, 1);
const SHADE = 0.26;
const MAX_PAGE_WIDTH = 230;
const EDGE_TONES = ['#FCFAF4', '#D9D1C2'];

export type AlbumExportBookProps = {
  pages: AlbumPage[];
  /** JSON of the asset map, stringified once by the owner. */
  mediaJson: string;
  media: AlbumLayoutMediaMap;
  style: AlbumReadingStyle;
  /** Width the stage may use. */
  width: number;
  title: string;
  /** Binding in progress: the book closes, rests, and catches light. */
  busy: boolean;
  /** Increment after a finished edition for a short settle. */
  celebrate: number;
  autoOpen?: boolean;
  /** Dev review only: hold the book at a fractional spread to inspect a turn. */
  holdAt?: number;
};

/**
 * Flat pages are the real measured layout drawn by the same Core Text page view
 * as the paper preview. The book is presentation only: no page is re-measured.
 */
export function AlbumExportBook(props: AlbumExportBookProps) {
  const { pages, style, width, busy, celebrate, title, autoOpen = true, holdAt } = props;
  const count = pages.length;
  const lastSpread = Math.max(0, albumSpreadCount(count) - 1);
  // pw × ph is the closed cover on screen; an open page is openWidth wide.
  const openWidth = Math.floor(Math.min(width / 2 - 8, MAX_PAGE_WIDTH));
  const closedScale = Math.min(1.36, (width * 0.68) / openWidth);
  const pw = Math.round(openWidth * closedScale);
  const ph = Math.round((pw * ALBUM_PAGE_HEIGHT_PT) / ALBUM_PAGE_WIDTH_PT);
  const openScale = openWidth / pw;
  const endAlone = lastSpread > 0 && albumSpreadPages(lastSpread, count).right == null;

  // A held review position is fixed for the life of this book (dev review only).
  const [held] = useState(() =>
    holdAt == null ? null : { at: holdAt, base: Math.max(0, Math.min(lastSpread, Math.floor(holdAt))) },
  );
  const [pos] = useState(() => new Animated.Value(held?.at ?? 0));
  const [glint] = useState(() => new Animated.Value(0));
  // Movement only by translation: any resting scale softens the page bitmaps.
  const [lift] = useState(() => new Animated.Value(0));
  const [appear] = useState(() => new Animated.Value(held ? 1 : 0));
  const [spread, setSpread] = useState(held?.base ?? 0);
  // Only the leaf being turned carries a perspective transform; resting pages
  // stay 2D, which Core Animation scales cleanly.
  const [turn, setTurn] = useState<{ leaf: number; id: number } | null>(
    held && held.at > held.base ? { leaf: held.base, id: 0 } : null,
  );
  const moving = turn?.leaf ?? null;
  const turnId = useRef(0);
  const setMoving = useCallback((leaf: number | null) => {
    setTurn((current) => (leaf == null ? null : current?.leaf === leaf ? current : { leaf, id: ++turnId.current }));
  }, []);
  const pending = useRef<(() => void) | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const spreadRef = useRef(held?.base ?? 0);
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const touched = useRef(false);
  const live = useRef({ busy, lastSpread, openWidth, width });
  useLayoutEffect(() => {
    live.current = { busy, lastSpread, openWidth, width };
  });

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => alive && setReduceMotion(value))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  const commit = useCallback(
    (next: number) => {
      spreadRef.current = next;
      setSpread(next);
      setMoving(null);
      pos.setValue(next);
    },
    [pos, setMoving],
  );

  const stepTo = useCallback(
    (target: number, duration = FLIP_MS) => {
      const goal = Math.max(0, Math.min(live.current.lastSpread, target));
      const step = () => {
        const from = spreadRef.current;
        if (goal === from) return;
        const next = from + (goal > from ? 1 : -1);
        animation.current?.stop();
        const flip = Animated.timing(pos, {
          toValue: next,
          duration,
          easing: FLIP_EASING,
          useNativeDriver: true,
        });
        // Start once the turning leaf has its 3D transform, so frame one already turns.
        pending.current = () => {
          animation.current = flip;
          flip.start(({ finished }) => {
            if (!finished) return;
            commit(next);
            if (next !== goal) requestAnimationFrame(step);
          });
        };
        setTurn({ leaf: goal > from ? from : next, id: ++turnId.current });
      };
      step();
    },
    [commit, pos],
  );

  useEffect(() => {
    const start = pending.current;
    pending.current = null;
    start?.();
  }, [turn]);

  /** Long jumps fade instead of riffling through every leaf. */
  const jumpTo = useCallback(
    (target: number) => {
      const distance = Math.abs(target - spreadRef.current);
      if (distance === 0) return;
      if (distance <= 3 && !reduceMotion) {
        stepTo(target, 380);
        return;
      }
      animation.current?.stop();
      Animated.timing(appear, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
        commit(target);
        Animated.timing(appear, { toValue: 1, duration: 260, useNativeDriver: true }).start();
      });
    },
    [appear, commit, reduceMotion, stepTo],
  );

  // Arrival: rise, catch the light once, then open on the first spread.
  const arrived = count > 0;
  useEffect(() => {
    if (!arrived) return;
    if (reduceMotion || held) {
      appear.setValue(1);
      return;
    }
    appear.setValue(0);
    glint.setValue(0);
    Animated.sequence([
      Animated.timing(appear, { toValue: 1, duration: 620, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(glint, { toValue: 1, duration: 950, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished && autoOpen && !held && !touched.current && !live.current.busy) {
        stepTo(1, 1100);
      }
    });
    // Arrival runs once per book, not per style change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrived, reduceMotion]);

  useEffect(() => {
    if (!held) return;
    // Re-send once the turning leaf has mounted its 3D transform.
    const timer = setTimeout(() => pos.setValue(held.at), 120);
    return () => clearTimeout(timer);
  }, [held, pos]);

  // Binding: close the book and let light pass over the resting cover.
  useEffect(() => {
    if (!busy) return;
    touched.current = true;
    jumpTo(0);
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glint, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(500),
        Animated.timing(glint, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [busy, glint, jumpTo, reduceMotion]);

  // A finished edition is set down once: a small lift, then it settles.
  useEffect(() => {
    if (!celebrate || reduceMotion) return;
    Animated.sequence([
      Animated.timing(lift, { toValue: -12, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(lift, { toValue: 0, friction: 5, tension: 140, useNativeDriver: true }),
    ]).start();
    glint.setValue(0);
    Animated.timing(glint, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
  }, [celebrate, glint, lift, reduceMotion]);

  useEffect(() => {
    if (spreadRef.current > lastSpread) commit(lastSpread);
  }, [commit, lastSpread]);

  // Plain responder events: refs are only read when a touch arrives.
  const drag = useRef({ start: 0, x0: 0, y0: 0, lastX: 0, lastT: 0, vx: 0 });
  const travel = (pageX: number) => {
    const { start, x0 } = drag.current;
    const raw = start - (pageX - x0) / (live.current.openWidth * 1.5);
    return Math.max(Math.max(0, start - 1), Math.min(Math.min(live.current.lastSpread, start + 1), raw));
  };
  const settle = (goal: number, from: number) => {
    animation.current = Animated.timing(pos, {
      toValue: goal,
      duration: 200 + 380 * Math.min(1, Math.abs(goal - from)),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.current.start(({ finished }) => {
      if (finished) commit(goal);
    });
  };
  const turnByTap = (locationX: number) => {
    if (live.current.busy) return;
    touched.current = true;
    const start = spreadRef.current;
    const forward = locationX > live.current.width / 2;
    if (forward ? start < live.current.lastSpread : start > 0) stepTo(start + (forward ? 1 : -1));
  };
  // Horizontal drags turn pages; vertical drags stay with the page scroll; taps go to the Pressable below.
  const touches = {
    onStartShouldSetResponderCapture: (event: GestureResponderEvent) => {
      drag.current.x0 = event.nativeEvent.pageX;
      drag.current.y0 = event.nativeEvent.pageY;
      return false;
    },
    onMoveShouldSetResponderCapture: (event: GestureResponderEvent) => {
      const dx = event.nativeEvent.pageX - drag.current.x0;
      const dy = event.nativeEvent.pageY - drag.current.y0;
      return !live.current.busy && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.3;
    },
    onResponderTerminationRequest: () => false,
    onResponderGrant: (event: GestureResponderEvent) => {
      const { pageX, timestamp } = event.nativeEvent;
      touched.current = true;
      animation.current?.stop();
      Object.assign(drag.current, { start: spreadRef.current, lastX: pageX, lastT: timestamp, vx: 0 });
      pos.setValue(spreadRef.current);
      // Keep the page scroll from taking a turn already in progress.
      return true;
    },
    onResponderMove: (event: GestureResponderEvent) => {
      const { pageX, timestamp } = event.nativeEvent;
      const state = drag.current;
      if (timestamp > state.lastT) state.vx = (pageX - state.lastX) / (timestamp - state.lastT);
      state.lastX = pageX;
      state.lastT = timestamp;
      const value = travel(pageX);
      if (value !== state.start) setMoving(value > state.start ? state.start : state.start - 1);
      pos.setValue(value);
    },
    onResponderRelease: (event: GestureResponderEvent) => {
      const { start, vx } = drag.current;
      const value = travel(event.nativeEvent.pageX);
      let goal = start;
      if (value - start > 0.22 || -vx > 0.35) goal = start + 1;
      else if (value - start < -0.22 || -vx < -0.35) goal = start - 1;
      settle(Math.max(0, Math.min(live.current.lastSpread, goal)), value);
    },
    onResponderTerminate: () => settle(spreadRef.current, spreadRef.current),
  };

  // Interpolations over the continuous spread position.
  const shiftClosed = -pw / 2;
  const endShift = endAlone ? (pw * openScale) / 2 : 0;
  const placement = useMemo(() => {
    if (lastSpread === 0) return { input: [0, 1], shift: [shiftClosed, shiftClosed], scale: [1, 1] };
    if (lastSpread === 1) return { input: [0, 1], shift: [shiftClosed, endShift], scale: [1, openScale] };
    if (lastSpread === 2) return { input: [0, 1, 2], shift: [shiftClosed, 0, endShift], scale: [1, openScale, openScale] };
    return {
      input: [0, 1, lastSpread - 1, lastSpread],
      shift: [shiftClosed, 0, 0, endShift],
      scale: [1, openScale, openScale, openScale],
    };
  }, [endShift, lastSpread, openScale, shiftClosed]);
  const translateX = pos.interpolate({ inputRange: placement.input, outputRange: placement.shift, extrapolate: 'clamp' });
  const bookScale = pos.interpolate({ inputRange: placement.input, outputRange: placement.scale, extrapolate: 'clamp' });
  const rise = Animated.add(appear.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }), lift);
  const leftShadow = pos.interpolate({ inputRange: [0.48, 0.52], outputRange: [0, 1], extrapolate: 'clamp' });
  const rightShadow = endAlone
    ? pos.interpolate({ inputRange: [lastSpread - 0.52, lastSpread - 0.48], outputRange: [1, 0], extrapolate: 'clamp' })
    : 1;
  const contact = pos.interpolate({ inputRange: placement.input, outputRange: placement.scale.map((s) => (s === 1 ? 0.62 : 1)), extrapolate: 'clamp' });

  // Pages are drawn at their resting on-screen size: the cover size while
  // closed, the spread size once open. At rest every outer scale is exactly 1;
  // scaling a layer that holds the page bitmap composites coarsely.
  const bw = spread === 0 ? pw : openWidth;
  const bh = Math.round((bw * ALBUM_PAGE_HEIGHT_PT) / ALBUM_PAGE_WIDTH_PT);
  const by = (ph - bh) / 2;
  const sideScale = bw === pw ? bookScale : Animated.multiply(bookScale, pw / bw);
  const glintX = glint.interpolate({ inputRange: [0, 1], outputRange: [-pw * 0.9, pw * 1.3] });
  const coverRest = pos.interpolate({ inputRange: [0, 0.04], outputRange: [1, 0], extrapolate: 'clamp' });
  const lo = Math.max(0, spread - 2);
  const hi = Math.min(lastSpread, spread + 1);
  const leaves: number[] = [];
  for (let leaf = lo; leaf <= hi; leaf += 1) leaves.push(leaf);
  const leafTotal = Math.max(1, lastSpread);
  const edgeLines = Math.max(2, Math.min(7, Math.round(count / 7)));
  const rightEdges = spread < lastSpread || !endAlone ? Math.max(1, Math.round((edgeLines * (lastSpread - spread)) / leafTotal)) : 0;
  const leftEdges = spread > 0 ? Math.max(1, Math.round((edgeLines * spread) / leafTotal)) : 0;
  const stageHeight = ph + 72;
  const paperColor = ALBUM_READING_STYLES[style].paper;
  const label = count ? albumSpreadLabel(spread, count) : '';

  return (
    <View style={styles.wrap}>
      <View
        testID="album-export-book"
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={tr('《{0}》成品预览，{1}', [title, label])}
        accessibilityHint={tr('上下轻扫可翻页')}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          if (busy) return;
          touched.current = true;
          const next = spreadRef.current + (event.nativeEvent.actionName === 'increment' ? 1 : -1);
          if (next >= 0 && next <= lastSpread) jumpTo(next);
        }}
        style={[styles.stage, { height: stageHeight }]}
        {...touches}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.contact,
            { width: openWidth * 2 * 0.92, top: stageHeight / 2 + ph / 2 - 4, opacity: appear, transform: [{ scaleX: contact }] },
          ]}
        />
        <Animated.View
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={{
            width: pw * 2,
            height: ph,
            opacity: appear,
            // Translation only. A scaled parent composites its 3D pages coarsely,
            // so each side scales itself about the spine instead.
            transform: [{ translateY: rise }, { translateX }],
          }}
        >
          <Animated.View style={[styles.side, { left: pw - bw, top: by, width: bw, height: bh, transformOrigin: 'right center', transform: [{ scale: sideScale }] }]}>
            <Animated.View style={[styles.shadow, { left: 0, width: bw, height: bh, opacity: leftShadow }]} />
            {Array.from({ length: leftEdges }, (_, index) => (
              <View
                key={`le${index}`}
                style={[styles.edge, { left: -(leftEdges - index) * 0.9, top: (leftEdges - index) * 0.9, width: bw, height: bh, backgroundColor: EDGE_TONES[index % 2] }]}
              />
            ))}
          </Animated.View>
          <Animated.View style={[styles.side, { left: pw, top: by, width: bw, height: bh, transformOrigin: 'left center', transform: [{ scale: sideScale }] }]}>
            <Animated.View style={[styles.shadow, { left: 0, width: bw, height: bh, opacity: rightShadow }]} />
            {Array.from({ length: rightEdges }, (_, index) => (
              <View
                key={`re${index}`}
                style={[styles.edge, { left: (rightEdges - index) * 0.9, top: (rightEdges - index) * 0.9, width: bw, height: bh, backgroundColor: EDGE_TONES[index % 2] }]}
              />
            ))}
          </Animated.View>
          {leaves.map((leaf) => {
            const faces = albumLeafPages(leaf, count);
            const z = moving === leaf ? 40 : leaf < spread ? 10 + (leaf - lo) : 30 - (leaf - spread);
            const frontRotate = pos.interpolate({ inputRange: [leaf, leaf + 0.5], outputRange: ['0deg', '-90deg'], extrapolate: 'clamp' });
            const frontOpacity = pos.interpolate({ inputRange: [leaf + 0.49, leaf + 0.5], outputRange: [1, 0], extrapolate: 'clamp' });
            const frontShade = pos.interpolate({ inputRange: [leaf, leaf + 0.5], outputRange: [0, SHADE], extrapolate: 'clamp' });
            const backRotate = pos.interpolate({ inputRange: [leaf + 0.5, leaf + 1], outputRange: ['90deg', '0deg'], extrapolate: 'clamp' });
            const backOpacity = pos.interpolate({ inputRange: [leaf + 0.5, leaf + 0.51], outputRange: [0, 1], extrapolate: 'clamp' });
            const backShade = pos.interpolate({ inputRange: [leaf + 0.5, leaf + 1], outputRange: [SHADE, 0], extrapolate: 'clamp' });
            return [
              faces.front != null || leaf < lastSpread ? (
                <Animated.View
                  key={`f${leaf}`}
                  style={[
                    styles.face,
                    {
                      left: pw,
                      top: by,
                      width: bw,
                      height: bh,
                      zIndex: z,
                      opacity: frontOpacity,
                      transformOrigin: 'left center',
                      transform: moving === leaf ? [{ scale: sideScale }, { perspective: PERSPECTIVE }, { rotateY: frontRotate }] : [{ scale: sideScale }],
                    },
                  ]}
                >
                  <PageFace page={faces.front == null ? null : pages[faces.front]} mediaJson={props.mediaJson} media={props.media} style={style} width={bw} paper={paperColor} />
                  <View style={[styles.gutter, leaf === 0 ? styles.hinge : styles.gutterRight, { width: bw * (leaf === 0 ? 0.07 : 0.14) }]} />
                  <Animated.View style={[StyleSheet.absoluteFill, styles.shade, { opacity: frontShade }]} />
                </Animated.View>
              ) : null,
              leaf < lastSpread ? (
                <Animated.View
                  key={`b${leaf}`}
                  style={[
                    styles.face,
                    {
                      left: pw - bw,
                      top: by,
                      width: bw,
                      height: bh,
                      zIndex: z,
                      opacity: backOpacity,
                      transformOrigin: 'right center',
                      transform: moving === leaf ? [{ scale: sideScale }, { perspective: PERSPECTIVE }, { rotateY: backRotate }] : [{ scale: sideScale }],
                    },
                  ]}
                >
                  <PageFace page={faces.back == null ? null : pages[faces.back]} mediaJson={props.mediaJson} media={props.media} style={style} width={bw} paper={paperColor} />
                  <View style={[styles.gutter, styles.gutterLeft, { width: bw * 0.14 }]} />
                  <Animated.View style={[StyleSheet.absoluteFill, styles.shade, { opacity: backShade }]} />
                </Animated.View>
              ) : null,
            ];
          })}
          {/* Light passes over the resting cover only, clipped to it. */}
          <Animated.View
            pointerEvents="none"
            style={[styles.glintClip, { left: pw, width: pw, height: ph, opacity: coverRest, transformOrigin: 'left center', transform: [{ scale: bookScale }] }]}
          >
            <Animated.View
              style={[styles.glint, { width: pw * 0.55, height: ph * 1.6, top: -ph * 0.3, transform: [{ translateX: glintX }, { rotate: '16deg' }] }]}
            />
          </Animated.View>
        </Animated.View>
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          testID="album-export-book-tap"
          style={StyleSheet.absoluteFill}
          onPress={(event) => turnByTap(event.nativeEvent.locationX)}
        />
      </View>
      {count > 0 ? (
        <View style={styles.nav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('上一页')}
            accessibilityState={{ disabled: busy || spread === 0 }}
            disabled={busy || spread === 0}
            testID="album-export-book-prev"
            hitSlop={8}
            onPress={() => {
              touched.current = true;
              stepTo(spreadRef.current - 1);
            }}
            style={[styles.navHit, (busy || spread === 0) && styles.dim]}
          >
            <LifeIcon name="back" size={16} color={sage} />
          </Pressable>
          <Text style={styles.navLabel} testID="album-export-book-label">
            {label}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('下一页')}
            accessibilityState={{ disabled: busy || spread >= lastSpread }}
            disabled={busy || spread >= lastSpread}
            testID="album-export-book-next"
            hitSlop={8}
            onPress={() => {
              touched.current = true;
              stepTo(spreadRef.current + 1);
            }}
            style={[styles.navHit, (busy || spread >= lastSpread) && styles.dim]}
          >
            <LifeIcon name="open" size={16} color={sage} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const PageFace = memo(function PageFace({
  page,
  mediaJson,
  media,
  style,
  width,
  paper,
}: {
  page: AlbumPage | null;
  mediaJson: string;
  media: AlbumLayoutMediaMap;
  style: AlbumReadingStyle;
  width: number;
  paper: string;
}) {
  const scale = width / ALBUM_PAGE_WIDTH_PT;
  const pageJson = useMemo(() => (page ? JSON.stringify(page) : ''), [page]);
  return (
    <View style={{ width, height: (width * ALBUM_PAGE_HEIGHT_PT) / ALBUM_PAGE_WIDTH_PT, backgroundColor: paper }}>
      {page ? (
        <View style={{ width: ALBUM_PAGE_WIDTH_PT, height: ALBUM_PAGE_HEIGHT_PT, transform: [{ scale }], transformOrigin: 'top left' }}>
          {NativeAlbumPageView ? (
            <NativeAlbumPageView
              pageJson={pageJson}
              mediaJson={mediaJson}
              playingJson="[]"
              renderScale={scale}
              style={{ width: ALBUM_PAGE_WIDTH_PT, height: ALBUM_PAGE_HEIGHT_PT }}
            />
          ) : (
            page.blocks.map((block, index) => (
              <AlbumBlockView key={`${block.kind}-${index}`} block={block} readingStyle={style} media={media} playing={false} />
            ))
          )}
        </View>
      ) : null}
    </View>
  );
});

/** Fixed-size placeholder while the real pages are measured. */
export function AlbumExportBookPlaceholder({ width }: { width: number }) {
  const openWidth = Math.floor(Math.min(width / 2 - 8, MAX_PAGE_WIDTH));
  const pw = Math.round(openWidth * Math.min(1.36, (width * 0.68) / openWidth));
  const ph = Math.round((pw * ALBUM_PAGE_HEIGHT_PT) / ALBUM_PAGE_WIDTH_PT);
  const [pulse] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={styles.wrap}>
      <View style={[styles.stage, { height: ph + 72 }]}>
        <Animated.View style={[styles.placeholder, { width: pw, height: ph, opacity: pulse }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 4 },
  stage: {
    width: '100%',
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#E7E0D3',
    experimental_backgroundImage:
      'radial-gradient(ellipse at 50% 34%, rgba(255,253,247,0.95) 0%, rgba(255,253,247,0.35) 46%, rgba(255,253,247,0) 74%)',
  },
  contact: {
    position: 'absolute',
    height: 26,
    borderRadius: 13,
    experimental_backgroundImage: 'radial-gradient(closest-side, rgba(37,35,31,0.26), rgba(37,35,31,0))',
  },
  shadow: {
    position: 'absolute',
    top: 0,
    backgroundColor: '#F8F5ED',
    boxShadow: '0px 14px 26px rgba(37,35,31,0.22), 0px 2px 5px rgba(37,35,31,0.14)',
  },
  side: { position: 'absolute', top: 0 },
  edge: { position: 'absolute', borderRadius: 1 },
  face: { position: 'absolute', top: 0 },
  glintClip: { position: 'absolute', top: 0, overflow: 'hidden', zIndex: 60 },
  gutter: { position: 'absolute', top: 0, bottom: 0 },
  gutterRight: {
    left: 0,
    experimental_backgroundImage:
      'linear-gradient(to right, rgba(37,35,31,0.2) 0%, rgba(37,35,31,0.07) 30%, rgba(37,35,31,0) 100%)',
  },
  gutterLeft: {
    right: 0,
    experimental_backgroundImage:
      'linear-gradient(to left, rgba(37,35,31,0.2) 0%, rgba(37,35,31,0.07) 30%, rgba(37,35,31,0) 100%)',
  },
  hinge: {
    left: 0,
    experimental_backgroundImage:
      'linear-gradient(to right, rgba(37,35,31,0.16) 0%, rgba(37,35,31,0.04) 55%, rgba(255,255,255,0.4) 75%, rgba(255,255,255,0) 100%)',
  },
  glint: {
    position: 'absolute',
    left: 0,
    experimental_backgroundImage:
      'linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.42) 50%, rgba(255,255,255,0) 100%)',
  },
  shade: { backgroundColor: '#25231F' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48 },
  navHit: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  navLabel: { ...type.meta, color: inkSoft, fontVariant: ['tabular-nums'], minWidth: 150, textAlign: 'center' },
  dim: { opacity: 0.35 },
  placeholder: {
    backgroundColor: '#F8F5ED',
    boxShadow: '0px 14px 26px rgba(37,35,31,0.16)',
  },
});
