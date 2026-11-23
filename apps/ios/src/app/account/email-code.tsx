import {useLocalSearchParams,useRouter} from 'expo-router';
import {tr} from '../../i18n';
import EmailCodeScreen from '../../screens/email-code-screen';
import {isFamilyProductEntryOpen} from '../../infrastructure/family-config';
export default function EmailCodeRoute(){
  const router=useRouter();const params=useLocalSearchParams<{returnTo?:string}>();
  const target=params.returnTo==='family'&&isFamilyProductEntryOpen()?'/family':'/account';
  return <EmailCodeScreen backLabel={tr(target==='/account'?'本机设置':'返回')} onDeleted={()=>router.dismissTo('/account')} onCancel={()=>router.canGoBack()?router.back():router.dismissTo('/account')} onAuthenticated={()=>router.dismissTo(target)}/>;
}
