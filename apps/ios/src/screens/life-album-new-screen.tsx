import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';

import { getUseCases } from '../application/container';
import { ApplicationError, isApplicationError } from '../application/errors';
import {
  ALBUM_CREATE_AND_COLLECT_ACTION,
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
import { ink, inkSoft, sage } from './life-page';
import { Text, TextInput, type } from './life-text';
import { SettingsPage } from './settings-chrome';

export default function LifeAlbumNewScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ m?: string | string[]; c?: string | string[] }>();
  const collectMomentId = peekAlbumCollectCreateMomentId(params.c, params.m);
  const collectMode = !!collectMomentId;
  const [name, setName] = useState(DEFAULT_ALBUM_NAME);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Retained after create so collect retry does not mint another album. */
  const [createdAlbumId, setCreatedAlbumId] = useState<string | null>(null);
  const savingRef = useRef(false);
  const finishedRef = useRef(false);

  function leaveWithoutWrite() {
    if (savingRef.current || finishedRef.current) return;
    forgetAlbumCollectCreateIntent(params.c);
    router.back();
  }

  async function save() {
    if (savingRef.current || finishedRef.current || saving) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const sessionToken = typeof params.c === 'string' ? params.c : params.c?.[0];
    const momentId = collectMomentId;
    try {
      const app = await getUseCases();
      let albumId = createdAlbumId;
      let albumName = normalizeAlbumName(name);

      if (!albumId) {
        const album = await app.createAlbum({ name });
        albumId = album.id;
        albumName = album.name;
        setCreatedAlbumId(albumId);
      }

      if (momentId) {
        if (!albumCollectCreateIntentWasIssued(sessionToken)) {
          setError(ALBUM_WRITE_FAILED);
          return;
        }
        try {
          await app.collectAlbumEntry({ albumId, momentId });
        } catch (caught) {
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
        if (finishedRef.current) return;
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
        Alert.alert(ALBUM_CREATE_COLLECT_SUCCESS, `已收进「${albumName}」`, [
          {
            text: '好',
            onPress: () => {
              finishCollectCreateToMoment(router, {
                openedFromMoment,
                momentId,
              });
            },
          },
        ]);
        return;
      }

      if (finishedRef.current) return;
      finishedRef.current = true;
      router.replace({ pathname: '/albums/[id]', params: { id: albumId } });
    } catch (caught) {
      setError(isApplicationError(caught) ? caught.message : ALBUM_WRITE_FAILED);
    } finally {
      if (!finishedRef.current) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  }

  const submitLabel = ALBUM_CREATE_AND_COLLECT_ACTION;
  const listSubmitLabel = ALBUM_CREATE_ONLY_ACTION;
  const shownSubmitLabel = collectMode ? submitLabel : listSubmitLabel;
  const submitBusyLabel = collectMode
    ? createdAlbumId
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
        value={name}
        onChangeText={setName}
        placeholder={DEFAULT_ALBUM_NAME}
        editable={!saving}
        autoCorrect={false}
        autoCapitalize="none"
        style={styles.input}
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
  action: { ...type.action, color: sage },
  disabled: { opacity: 0.45 },
  error: { ...type.meta, color: inkSoft },
  hit: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
});
