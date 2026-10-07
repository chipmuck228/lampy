import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';

import { getUseCases } from '../application/container';
import { ApplicationError, isApplicationError } from '../application/errors';
import {
  ALBUM_CREATE_AND_COLLECT_ACTION,
  ALBUM_CREATE_COLLECT_RETRY,
  ALBUM_CREATE_COLLECT_SUCCESS,
  ALBUM_CREATE_ONLY_ACTION,
  ALBUM_CREATED_COLLECT_FAILED,
  ALBUM_WRITE_FAILED,
  DEFAULT_ALBUM_NAME,
  normalizeAlbumName,
} from '../application/life-album';
import { ALBUM_SOURCE_UNAVAILABLE } from '../application/life-album-use-cases';
import {
  albumCollectCreateIntentWasIssued,
  consumeAlbumCollectCreateIntent,
  finishCollectCreateToMoment,
  forgetAlbumCollectCreateIntent,
  peekAlbumCollectCreateMomentId,
  shouldReturnToMomentAfterCollectCreate,
} from './album-collect-create-intent';
import {
  albumNewSourceKey,
  shouldApplyAlbumNewRequest,
} from './life-album-new-request';
import { firstSearchParam } from './lookback-origin';
import { ink, inkSoft, sage } from './life-page';
import { Text, TextInput, type } from './life-text';
import { SettingsPage } from './settings-chrome';

export { shouldApplyAlbumNewRequest } from './life-album-new-request';

export default function LifeAlbumNewScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ m?: string | string[]; c?: string | string[] }>();
  const collectMomentId = peekAlbumCollectCreateMomentId(params.c, params.m);
  const collectMode = !!collectMomentId;
  const sourceKey = albumNewSourceKey({
    intentToken: params.c,
    momentParam: params.m,
  });
  const [name, setName] = useState(DEFAULT_ALBUM_NAME);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Retained after create so collect retry does not mint another album. */
  const [createdAlbumId, setCreatedAlbumId] = useState<string | null>(null);
  /** Real name returned by createAlbum — used after partial failure / success. */
  const [createdAlbumName, setCreatedAlbumName] = useState<string | null>(null);
  const savingRef = useRef(false);
  const finishedRef = useRef(false);
  const requestGenRef = useRef(0);
  const sourceKeyRef = useRef(sourceKey);

  function invalidateRequests() {
    requestGenRef.current += 1;
  }

  function isEligible(requestId: number): boolean {
    return shouldApplyAlbumNewRequest({
      requestId,
      currentRequestId: requestGenRef.current,
    });
  }

  useEffect(() => {
    if (sourceKeyRef.current === sourceKey) return;
    sourceKeyRef.current = sourceKey;
    invalidateRequests();
    savingRef.current = false;
    finishedRef.current = false;
    setSaving(false);
    setError(null);
    setCreatedAlbumId(null);
    setCreatedAlbumName(null);
    setName(DEFAULT_ALBUM_NAME);
  }, [sourceKey]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        invalidateRequests();
      };
    }, []),
  );

  useEffect(() => {
    const remove = navigation.addListener('beforeRemove', () => {
      invalidateRequests();
    });
    return () => {
      remove();
    };
  }, [navigation]);

  useEffect(() => {
    return () => {
      invalidateRequests();
    };
  }, []);

  function leaveWithoutWrite() {
    // Do not block the chrome / system back — invalidate in-flight work instead.
    invalidateRequests();
    if (!finishedRef.current) {
      forgetAlbumCollectCreateIntent(params.c);
    }
    router.back();
  }

  async function save() {
    if (savingRef.current || finishedRef.current || saving) return;

    const requestId = requestGenRef.current + 1;
    requestGenRef.current = requestId;
    const sessionToken = firstSearchParam(params.c);
    const momentId = collectMomentId;
    const nameInput = name;
    const existingAlbumId = createdAlbumId;
    const existingAlbumName = createdAlbumName;
    const capturedSourceKey = sourceKey;

    savingRef.current = true;
    setSaving(true);
    setError(null);

    try {
      const app = await getUseCases();
      if (!isEligible(requestId)) return;

      let albumId = existingAlbumId;
      let albumName = existingAlbumName ?? normalizeAlbumName(nameInput);

      if (!albumId) {
        if (!isEligible(requestId)) return;
        const album = await app.createAlbum({ name: nameInput });
        albumId = album.id;
        albumName = album.name;
        // DB write already happened — never roll back from the page.
        // Keep albumId on the same source so a later retry joins this册, but never
        // apply create results onto a different intent / moment target.
        if (sourceKeyRef.current === capturedSourceKey) {
          setCreatedAlbumId(albumId);
          setCreatedAlbumName(albumName);
          setName(albumName);
        }
        if (!isEligible(requestId)) return;
      }

      if (momentId) {
        if (!isEligible(requestId)) return;
        if (!albumCollectCreateIntentWasIssued(sessionToken)) {
          if (isEligible(requestId)) setError(ALBUM_WRITE_FAILED);
          return;
        }
        if (!isEligible(requestId)) return;
        try {
          await app.collectAlbumEntry({ albumId, momentId });
        } catch (caught) {
          if (!isEligible(requestId)) return;
          if (
            caught instanceof ApplicationError &&
            caught.code === ALBUM_SOURCE_UNAVAILABLE
          ) {
            setError(caught.message);
          } else if (albumId) {
            setError(ALBUM_CREATED_COLLECT_FAILED);
          } else if (isApplicationError(caught)) {
            setError(caught.message);
          } else {
            setError(ALBUM_WRITE_FAILED);
          }
          return;
        }
        if (!isEligible(requestId)) return;
        const openedFromMoment = shouldReturnToMomentAfterCollectCreate({
          intentToken: sessionToken,
          momentId,
          navigationState: navigation.getState() as {
            index?: number;
            routes?: { name?: string; params?: { id?: string | string[] } }[];
          },
        });
        finishedRef.current = true;
        consumeAlbumCollectCreateIntent(sessionToken);
        const successName = albumName;
        Alert.alert(ALBUM_CREATE_COLLECT_SUCCESS, `已收进「${successName}」`, [
          {
            text: '好',
            onPress: () => {
              if (!isEligible(requestId)) return;
              finishCollectCreateToMoment(router, {
                openedFromMoment,
                momentId,
              });
            },
          },
        ]);
        return;
      }

      if (!isEligible(requestId)) return;
      finishedRef.current = true;
      router.replace({ pathname: '/albums/[id]', params: { id: albumId } });
    } catch (caught) {
      if (!isEligible(requestId)) return;
      setError(isApplicationError(caught) ? caught.message : ALBUM_WRITE_FAILED);
    } finally {
      if (!isEligible(requestId)) {
        savingRef.current = false;
        if (sourceKeyRef.current === capturedSourceKey) setSaving(false);
        return;
      }
      if (!finishedRef.current) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  }

  const nameLocked = !!createdAlbumId;
  const displayName = nameLocked ? (createdAlbumName ?? name) : name;
  const shownSubmitLabel = collectMode
    ? nameLocked
      ? ALBUM_CREATE_COLLECT_RETRY
      : ALBUM_CREATE_AND_COLLECT_ACTION
    : ALBUM_CREATE_ONLY_ACTION;
  const submitBusyLabel = collectMode
    ? nameLocked
      ? '正在加入'
      : '正在创建'
    : '正在记下';

  return (
    <SettingsPage
      title="新建一册"
      backLabel={collectMode ? '返回' : '我的生活册'}
      accessibilityLabel="新建一册"
      pageTestID="life-album-new"
      scrollEnabled={false}
      onBack={leaveWithoutWrite}
    >
      <Text style={styles.label}>册名</Text>
      <TextInput
        testID="life-album-new-name"
        value={displayName}
        onChangeText={setName}
        placeholder={DEFAULT_ALBUM_NAME}
        editable={!saving && !nameLocked}
        autoCorrect={false}
        autoCapitalize="none"
        style={[styles.input, nameLocked && styles.inputLocked]}
      />
      {error ? (
        <Text testID="life-album-new-error" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: saving }}
        accessibilityLabel={shownSubmitLabel}
        testID="life-album-new-save"
        onPress={() => {
          void save();
        }}
        style={styles.hit}
      >
        <Text style={[styles.action, saving && styles.disabled]}>
          {saving ? submitBusyLabel : shownSubmitLabel}
        </Text>
      </Pressable>
      <View />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  label: { ...type.meta, color: inkSoft, marginBottom: 8, marginTop: 8 },
  input: {
    fontSize: type.body.fontSize,
    color: ink,
    width: '100%',
    minHeight: 48,
    paddingTop: 12,
    paddingBottom: 12,
    paddingRight: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: sage,
  },
  inputLocked: {
    color: inkSoft,
  },
  action: { ...type.action, color: sage },
  disabled: { opacity: 0.45 },
  error: { ...type.meta, color: inkSoft },
  hit: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
});
