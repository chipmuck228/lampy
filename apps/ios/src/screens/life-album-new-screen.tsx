import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { getUseCases } from '../application/container';
import { isApplicationError } from '../application/errors';
import {
  ALBUM_WRITE_FAILED,
  DEFAULT_ALBUM_NAME,
  normalizeAlbumName,
} from '../application/life-album';
import { lookbackParamsWithCollect } from './lookback-origin';
import { ink, inkSoft, sage } from './life-page';
import { Text, TextInput, type } from './life-text';
import { SettingsPage } from './settings-chrome';

export default function LifeAlbumNewScreen() {
  const router = useRouter();
  const [name, setName] = useState(DEFAULT_ALBUM_NAME);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const app = await getUseCases();
      const album = await app.createAlbum({ name });
      router.replace({
        pathname: '/lookback',
        params: lookbackParamsWithCollect({}, album.id),
      });
    } catch (caught) {
      setError(isApplicationError(caught) ? caught.message : ALBUM_WRITE_FAILED);
      setSaving(false);
    }
  }

  return (
    <SettingsPage
      title="新建一册"
      backLabel="我的生活册"
      accessibilityLabel="新建一册"
      pageTestID="life-album-new"
      scrollEnabled={false}
      onBack={() => router.back()}
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
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: saving }}
        accessibilityLabel="开始收进"
        testID="life-album-new-save"
        onPress={() => {
          void save();
        }}
        style={styles.hit}
      >
        <Text style={[styles.action, saving && styles.disabled]}>
          {saving ? '正在记下' : `开始收进《${normalizeAlbumName(name)}》`}
        </Text>
      </Pressable>
      <View />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  label: { ...type.meta, color: inkSoft, marginBottom: 8, marginTop: 8 },
  input: {
    ...type.body,
    color: ink,
    width: '100%',
    minHeight: 48,
    paddingVertical: 10,
    paddingRight: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: sage,
  },
  action: { ...type.action, color: sage },
  disabled: { opacity: 0.45 },
  error: { ...type.meta, color: inkSoft },
  hit: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
});
