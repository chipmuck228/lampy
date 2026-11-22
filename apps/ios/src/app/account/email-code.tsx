import {useLocalSearchParams,useRouter} from 'expo-router';
import EmailCodeScreen from '../../screens/email-code-screen';
import {isFamilyProductEntryOpen} from '../../infrastructure/family-config';
export default function EmailCodeRoute(){
  const router=useRouter();const params=useLocalSearchParams<{returnTo?:string}>();
  const target=params.returnTo==='family'&&isFamilyProductEntryOpen()?'/family':'/account';
  return <EmailCodeScreen onDeleted={()=>router.dismissTo('/account')} onCancel={()=>router.canGoBack()?router.back():router.dismissTo('/account')} onAuthenticated={()=>router.dismissTo(target)}/>;
}
