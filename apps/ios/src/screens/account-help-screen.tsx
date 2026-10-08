import { tr } from '../i18n';
import { useRouter } from 'expo-router';

import { SETTINGS_HELP_CHAPTERS } from './settings-help-copy';
import { SettingsPage } from './settings-chrome';
import { dismissToSettingsRoot } from './settings-nav';
import { SettingsCopyArticle, SettingsDetailLead } from './settings-rows';

export default function AccountHelpScreen() {
  const router = useRouter();
  return (
    <SettingsPage
      title={tr("使用帮助")}
      backLabel={tr("本机设置")}
      accessibilityLabel={tr("使用帮助")}
      testID="account-help-scroll"
      onBack={() => dismissToSettingsRoot(router)}
    >
      <SettingsDetailLead icon="help" title={tr("使用帮助")} />
      <SettingsCopyArticle chapters={SETTINGS_HELP_CHAPTERS} testIDPrefix="account-help" />
    </SettingsPage>
  );
}
