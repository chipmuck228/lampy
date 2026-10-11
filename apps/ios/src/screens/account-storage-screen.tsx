import { tr } from '../i18n';
import { useRouter } from 'expo-router';

import { SettingsPage } from './settings-chrome';
import { dismissToSettingsRoot } from './settings-nav';
import { SettingsDetailLead, SettingsFact } from './settings-rows';

export default function AccountStorageScreen() {
  const router = useRouter();
  return (
    <SettingsPage
      title={tr("记录与存储")}
      backLabel={tr("本机设置")}
      accessibilityLabel={tr("记录与存储")}
      testID="account-storage-scroll"
      onBack={() => dismissToSettingsRoot(router)}
    >
      <SettingsDetailLead icon="storage" title={tr("记录与存储")}>
        <SettingsFact testID="account-personal">{tr("文字、感受、发生日期和写下时间保存在这台设备上的应用数据库里。")}</SettingsFact>
        <SettingsFact testID="account-storage-media">{tr("照片和声音复制到这台设备上的应用文件里，不会写回系统相册。")}</SettingsFact>
        <SettingsFact testID="account-storage-sync">{tr("当前版本没有由 Lampy 提供的跨设备同步或云备份。")}</SettingsFact>
        <SettingsFact testID="account-storage-keep">{tr("卸载应用通常会清掉应用空间里的这些记录和文件。系统备份是否包含它们、以及重新安装后能否看见，取决于系统和备份设置，Lampy 不能保证。")}</SettingsFact>
        <SettingsFact testID="account-storage-reinstall">{tr("重新安装不会自动找回已经卸载的记录。")}</SettingsFact>
      </SettingsDetailLead>
    </SettingsPage>
  );
}
