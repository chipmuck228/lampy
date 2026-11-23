import {isAppstoreLaunchBuild} from '../infrastructure/launch-release-config';
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
        {isAppstoreLaunchBuild()?<>
          <SettingsFact>{tr('个人生活册可以导出为 EPUB 或 PDF。需要购买的功能会在确认付款前显示 Apple 提供的价格；付款与恢复购买由 App Store 处理。')}</SettingsFact>
          <SettingsFact>{tr('在生活册的导出页面，可以查看价格、购买或恢复已有购买。')}</SettingsFact>
        </>:<>
        <SettingsFact testID="account-subscribe-none">{tr("目前没有付费项目。")}</SettingsFact>
        <SettingsFact testID="account-subscribe-store">{tr("当前版本没有可购买的内容、订阅或试用，也没有购买、恢复购买或管理订阅。")}</SettingsFact>
        </>}
      </SettingsDetailLead>
    </SettingsPage>
  );
}
