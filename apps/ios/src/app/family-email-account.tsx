import { useLocalSearchParams, useRouter } from 'expo-router';
import FamilyEmailAccountScreen from '../screens/family-email-account-screen';
export default function FamilyEmailAccount() {
  const { returnTo } = useLocalSearchParams<{returnTo?: string}>();
  const router = useRouter();
  return <FamilyEmailAccountScreen onAuthenticated={returnTo === 'settings' ? () => router.dismissTo('/account') : undefined} onCancel={returnTo === 'settings' ? () => router.dismissTo('/account') : undefined}/>;
}
