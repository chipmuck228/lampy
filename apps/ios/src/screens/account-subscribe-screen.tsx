import { useRouter } from 'expo-router';

import { SettingsPage } from './settings-chrome';
import { dismissToSettingsRoot } from './settings-nav';
import { SettingsDetailLead, SettingsFact } from './settings-rows';

export default function AccountSubscribeScreen() {
  const router = useRouter();
  return (
    <SettingsPage
      title="订阅与付费"
      backLabel="本机设置"
      accessibilityLabel="订阅与付费"
      testID="account-subscribe-scroll"
      onBack={() => dismissToSettingsRoot(router)}
    >
      <SettingsDetailLead icon="subscribe" title="订阅与付费">
        <SettingsFact testID="account-subscribe-none">目前没有付费项目。</SettingsFact>
        <SettingsFact testID="account-subscribe-store">
          当前版本没有可购买的内容、订阅或试用，也没有购买、恢复购买或管理订阅。
        </SettingsFact>
      </SettingsDetailLead>
    </SettingsPage>
  );
}
