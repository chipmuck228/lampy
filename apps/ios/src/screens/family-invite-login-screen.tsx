import { useLocalSearchParams, useRouter } from 'expo-router';
import { currentFamilyInvite } from '../infrastructure/family-invite-link';
import { isFamilyProductEntryOpen } from '../infrastructure/family-config';
import { isPersonalSettingsDiagnosticsOpen } from '../application/personal-settings-visibility';
import { tr } from '../i18n';
import AccountScreen from './account-screen';
import { SettingsPage } from './settings-chrome';
import { Text } from './life-text';
import { useDeviceLock } from './device-lock-context';

export default function FamilyInviteLoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{returnTo?: string; generation?: string}>();
  const lock = useDeviceLock();
  const target = params.returnTo === '/family' ? '/family' : '/family-invite';
  const valid = isFamilyProductEntryOpen() && isPersonalSettingsDiagnosticsOpen() &&
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
  return <AccountScreen variant="diagnostics" onAuthenticated={authenticated} onCancel={back} />;
}
