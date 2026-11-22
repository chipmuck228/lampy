import EmailCodeScreen from './email-code-screen';
import {emailCodeEntryOpen} from '../infrastructure/account-config';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { currentFamilyInvite } from '../infrastructure/family-invite-link';
import { isFamilyV1ReleaseBuild, isFamilyProductEntryOpen, isControlledEmailAccountsOpen, isFamilyInternalTestBuild } from '../infrastructure/family-config';
import { isPersonalSettingsDiagnosticsOpen } from '../application/personal-settings-visibility';
import { tr } from '../i18n';
import { useState } from 'react';
import FamilyEmailAccountScreen from './family-email-account-screen';
import AccountScreen from './account-screen';
import { SettingsPage } from './settings-chrome';
import { Text } from './life-text';
import { useDeviceLock } from './device-lock-context';

export default function FamilyInviteLoginScreen() {
  const router = useRouter();
  const [codeMode,setCodeMode]=useState(()=>emailCodeEntryOpen());
  const [emailMode,setEmailMode] = useState(()=>isFamilyV1ReleaseBuild() || isControlledEmailAccountsOpen());
  const params = useLocalSearchParams<{returnTo?: string; generation?: string}>();
  const lock = useDeviceLock();
  const target = params.returnTo === '/family' ? '/family' : '/family-invite';
  const internal = isFamilyInternalTestBuild();
  const valid = isFamilyProductEntryOpen() && (isFamilyV1ReleaseBuild() || internal || isPersonalSettingsDiagnosticsOpen()) &&
    !lock?.snapshot.locked && currentFamilyInvite()?.generation === Number(params.generation);
  function back() {
    if (router.canGoBack()) router.back();
    else router.dismissTo(target);
  }
  function authenticated() {
    if (currentFamilyInvite()?.generation !== Number(params.generation)) return;
    back();
  }
  if (!valid) return <SettingsPage title={tr('家庭邀请')} backLabel={tr('返回')}
    accessibilityLabel={tr('家庭邀请')} onBack={back}>
    <Text>{tr('请返回邀请，重新确认后继续。')}</Text>
  </SettingsPage>;
  if(codeMode)return <EmailCodeScreen onDeleted={()=>router.dismissTo('/account')} onAuthenticated={authenticated} onCancel={back} onOtherSignIn={()=>setCodeMode(false)}/>;
  if (emailMode) return <FamilyEmailAccountScreen onEmailCodeRequested={()=>setCodeMode(true)} onAuthenticated={authenticated} onCancel={back} onOtherSignIn={internal ? undefined : () => setEmailMode(false)}/>;
  return <AccountScreen onEmailRequested={() => setEmailMode(true)} variant="diagnostics" onAuthenticated={authenticated} onCancel={back} />;
}
