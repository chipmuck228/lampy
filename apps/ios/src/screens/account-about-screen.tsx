import { Image, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';

import { ink, inkSoft } from './life-page';
import { Text, type } from './life-text';
import { SettingsPage } from './settings-chrome';
import { dismissToSettingsRoot, lampyAppVersionLabel } from './settings-nav';

const mark = require('../../assets/images/splash-icon.png');

export default function AccountAboutScreen() {
  const router = useRouter();
  const version = lampyAppVersionLabel({
    version: Constants.expoConfig?.version,
    build: Constants.expoConfig?.ios?.buildNumber ?? Constants.nativeBuildVersion,
  });
  return (
    <SettingsPage
      title="关于 Lampy"
      accessibilityLabel="关于 Lampy"
      testID="account-about-scroll"
      onBack={() => dismissToSettingsRoot(router)}
    >
      <View style={styles.brand}>
        <Image source={mark} style={styles.mark} accessible={false} />
        <Text style={styles.name} accessibilityRole="header">
          Lampy
        </Text>
        <Text style={styles.line}>把生活，留给自己。</Text>
        <Text style={styles.version} testID="account-version">
          {version}
        </Text>
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', paddingTop: 24, gap: 12 },
  mark: { width: 72, height: 72 },
  name: { ...type.title, color: ink },
  line: { ...type.body, color: inkSoft, textAlign: 'center' },
  version: { ...type.meta, color: inkSoft, marginTop: 8 },
});
