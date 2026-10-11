import { tr } from '../i18n';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';

import { hairline, inkSoft } from './life-page';
import { Text, type } from './life-text';
import { SettingsPage } from './settings-chrome';
import { dismissToSettingsRoot, lampyAppVersionLabel } from './settings-nav';
import { SettingsAboutMark } from './settings-rows';

export default function AccountAboutScreen() {
  const router = useRouter();
  const version = lampyAppVersionLabel({
    version: Constants.nativeAppVersion,
    build: Constants.nativeBuildVersion,
  });
  return (
    <SettingsPage
      title={tr("关于 Lampy")}
      backLabel={tr("本机设置")}
      accessibilityLabel={tr("关于 Lampy")}
      testID="account-about-scroll"
      onBack={() => dismissToSettingsRoot(router)}
    >
      <SettingsAboutMark />
      <View style={styles.versionRule}>
        <Text style={styles.version} testID="account-version">
          {version}
        </Text>
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  versionRule: {
    marginTop: 75,
    paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: hairline,
    alignItems: 'center',
  },
  version: { ...type.meta, color: inkSoft, textAlign: 'center' },
});
