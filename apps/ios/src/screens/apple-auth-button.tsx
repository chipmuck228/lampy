import * as AppleAuthentication from 'expo-apple-authentication';
import { View } from 'react-native';
import { tr } from '../i18n';
export function AppleAuthButton({disabled,onPress}:{disabled:boolean;onPress:()=>void}) {
  return <View pointerEvents={disabled ? 'none' : 'auto'} accessibilityElementsHidden={disabled} importantForAccessibility={disabled?'no-hide-descendants':'auto'}>
    <AppleAuthentication.AppleAuthenticationButton testID="apple-auth-button" buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE} buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK} cornerRadius={24} style={{height:48,width:'100%'}} accessibilityLabel={tr('使用Apple继续')} onPress={onPress}/>
  </View>;
}
