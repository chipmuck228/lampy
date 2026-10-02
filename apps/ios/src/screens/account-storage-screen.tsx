import { useRouter } from 'expo-router';

import { SettingsPage } from './settings-chrome';
import { dismissToSettingsRoot } from './settings-nav';
import { SettingsFact } from './settings-rows';

export default function AccountStorageScreen() {
  const router = useRouter();
  return (
    <SettingsPage
      title="记录与存储"
      accessibilityLabel="记录与存储"
      testID="account-storage-scroll"
      onBack={() => dismissToSettingsRoot(router)}
    >
      <SettingsFact testID="account-personal">
        个人记录保存在这台设备。
      </SettingsFact>
      <SettingsFact testID="account-storage-sync">
        当前版本没有跨设备同步或云备份。
      </SettingsFact>
      <SettingsFact testID="account-storage-keep">
        卸载或更换设备前，先确认这些记录要怎么保留。
      </SettingsFact>
    </SettingsPage>
  );
}
