import {useCallback,useState} from 'react';
import {useFocusEffect} from 'expo-router';
import {getAccountUseCases} from '../application/container';
import {tr} from '../i18n';
import {useDeviceLock} from './device-lock-context';
import {SettingsGroup,SettingsLink} from './settings-rows';

export default function EmailAccountSettings({onPress}:{onPress:()=>void}){
  const [nickname,setNickname]=useState<string|null>(null);
  const locked=!!useDeviceLock()?.snapshot.locked;
  useFocusEffect(useCallback(()=>{
    let active=true;setNickname(null);
    if(!locked)void(async()=>{try{
      const state=await (await getAccountUseCases()).getEmailCodeAccount();
      if(active)setNickname(state.signedIn?state.nickname??null:null);
    }catch{if(active)setNickname(null);}})();
    return()=>{active=false;};
  },[locked]));
  return <SettingsGroup title={tr('账号')}><SettingsLink icon="privacy"
    title={!locked&&nickname?nickname:tr('登录与找回')}
    detail={tr(!locked&&nickname?'登录与找回':'邮箱验证码登录与账号保护')}
    testID="account-open-email-code" onPress={onPress}/></SettingsGroup>;
}
