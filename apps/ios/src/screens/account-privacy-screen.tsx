import { tr } from '../i18n';
import { useRouter } from 'expo-router';

import { SETTINGS_PRIVACY_CHAPTERS, SETTINGS_PRIVACY_UPDATED } from './settings-privacy-copy';
import { SettingsPage } from './settings-chrome';
import { dismissToSettingsRoot } from './settings-nav';
import { SettingsCopyArticle, SettingsDetailLead } from './settings-rows';

export default function AccountPrivacyScreen() {
  const router = useRouter();
  return (
    <SettingsPage
      title={tr("隐私政策")}
      backLabel={tr("本机设置")}
      accessibilityLabel={tr("隐私政策")}
      testID="account-privacy-scroll"
      onBack={() => dismissToSettingsRoot(router)}
    >
      <SettingsDetailLead icon="privacy" title={tr("隐私政策")} />
      <SettingsCopyArticle
        updated={SETTINGS_PRIVACY_UPDATED}
        updatedTestID="account-privacy-updated"
        chapters={SETTINGS_PRIVACY_CHAPTERS}
        testIDPrefix="account-privacy"
      />
    </SettingsPage>
  );
}
