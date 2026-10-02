import { useRouter } from 'expo-router';

import { SETTINGS_TERMS_CHAPTERS, SETTINGS_TERMS_UPDATED } from './settings-terms-copy';
import { SettingsPage } from './settings-chrome';
import { dismissToSettingsRoot } from './settings-nav';
import { SettingsCopyArticle, SettingsDetailLead } from './settings-rows';

export default function AccountTermsScreen() {
  const router = useRouter();
  return (
    <SettingsPage
      title="使用条款"
      backLabel="本机设置"
      accessibilityLabel="使用条款"
      testID="account-terms-scroll"
      onBack={() => dismissToSettingsRoot(router)}
    >
      <SettingsDetailLead icon="terms" title="使用条款" />
      <SettingsCopyArticle
        updated={SETTINGS_TERMS_UPDATED}
        updatedTestID="account-terms-updated"
        chapters={SETTINGS_TERMS_CHAPTERS}
        testIDPrefix="account-terms"
      />
    </SettingsPage>
  );
}
