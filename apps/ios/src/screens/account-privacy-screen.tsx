import { useRouter } from 'expo-router';

import { SETTINGS_PRIVACY_CHAPTERS, SETTINGS_PRIVACY_UPDATED } from './settings-privacy-copy';
import { SettingsPage } from './settings-chrome';
import { dismissToSettingsRoot } from './settings-nav';
import { SettingsCopyArticle, SettingsDetailLead } from './settings-rows';

export default function AccountPrivacyScreen() {
  const router = useRouter();
  return (
    <SettingsPage
      title="隐私政策"
      backLabel="本机设置"
      accessibilityLabel="隐私政策"
      testID="account-privacy-scroll"
      onBack={() => dismissToSettingsRoot(router)}
    >
      <SettingsDetailLead icon="privacy" title="隐私政策" />
      <SettingsCopyArticle
        updated={SETTINGS_PRIVACY_UPDATED}
        updatedTestID="account-privacy-updated"
        chapters={SETTINGS_PRIVACY_CHAPTERS}
        testIDPrefix="account-privacy"
      />
    </SettingsPage>
  );
}
