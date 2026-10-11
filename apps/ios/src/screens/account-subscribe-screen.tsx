import { tr } from '../i18n';
import { useRouter } from 'expo-router';

import { SettingsPage } from './settings-chrome';
import { dismissToSettingsRoot } from './settings-nav';
import { SettingsDetailLead, SettingsFact } from './settings-rows';

export default function AccountSubscribeScreen() {
  const router = useRouter();
  return (
    <SettingsPage
      title={tr("订阅与付费")}
      backLabel={tr("本机设置")}
      accessibilityLabel={tr("订阅与付费")}
      testID="account-subscribe-scroll"
      onBack={() => dismissToSettingsRoot(router)}
    >
      <SettingsDetailLead icon="subscribe" title={tr("订阅与付费")}>
        <SettingsFact testID="account-subscribe-none">{tr("目前没有付费项目。")}</SettingsFact>
        <SettingsFact testID="account-subscribe-store">{tr("当前版本没有可购买的内容、订阅或试用，也没有购买、恢复购买或管理订阅。")}</SettingsFact>
      </SettingsDetailLead>
    </SettingsPage>
  );
}
