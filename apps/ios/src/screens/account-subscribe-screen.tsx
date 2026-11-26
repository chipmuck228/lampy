import {paidEpubInformationVisible} from './settings-capabilities';
import {useState} from 'react';
import {Linking} from 'react-native';
import {AlbumExportUnlock} from './album-export-unlock';
import {ShowcaseButton,ShowcaseNote} from './album-export-showcase';
import { tr } from '../i18n';
import { useRouter } from 'expo-router';

import { SettingsPage } from './settings-chrome';
import { dismissToSettingsRoot } from './settings-nav';
import { SettingsDetailLead, SettingsFact } from './settings-rows';

export default function AccountSubscribeScreen() {
  const router = useRouter();
  const paid=paidEpubInformationVisible(),title=tr(paid?'购买与解锁':'订阅与付费');
  const [linkFailed,setLinkFailed]=useState(false);
  async function history(){setLinkFailed(false);try{await Linking.openURL('https://reportaproblem.apple.com/');}catch{setLinkFailed(true);}}
  return (
    <SettingsPage
      title={title}
      backLabel={tr("本机设置")}
      accessibilityLabel={title}
      testID="account-subscribe-scroll"
      onBack={() => dismissToSettingsRoot(router)}
    >
      <SettingsDetailLead icon="subscribe" title={title}>
        {paid?<>
          <SettingsFact>{tr('电子册可以免费全屏预览；解锁后可保存与分享 EPUB。购买前会显示 Apple 提供的价格，并可恢复已有购买。')}</SettingsFact>
          <SettingsFact>{tr('这是一次性解锁，不是订阅。已有购买请先恢复，无需再次付款。')}</SettingsFact>
          <AlbumExportUnlock/>
          <ShowcaseNote>{tr('购买与恢复由Apple完成，可能需要验证Apple账号；Lampy不会读取你的Apple密码。')}</ShowcaseNote>
          <ShowcaseButton testID="purchase-history-open" tone="quiet" label={tr('查看Apple购买记录')} onPress={()=>void history()}/>
          <ShowcaseNote>{tr('订单、付款金额与收据由Apple提供，请使用付款时的Apple账号查看。测试购买不代表正式扣款。')}</ShowcaseNote>
          {linkFailed?<ShowcaseNote live>{tr('暂时无法打开Apple购买记录。可在App Store的账号页面查看购买历史。')}</ShowcaseNote>:null}
        </>:<>
        <SettingsFact testID="account-subscribe-none">{tr("目前没有付费项目。")}</SettingsFact>
        <SettingsFact testID="account-subscribe-store">{tr("当前版本没有可购买的内容、订阅或试用，也没有购买、恢复购买或管理订阅。")}</SettingsFact>
        </>}
      </SettingsDetailLead>
    </SettingsPage>
  );
}
