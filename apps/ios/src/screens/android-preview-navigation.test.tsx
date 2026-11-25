import {render} from '@testing-library/react-native';
import {RootNavBand} from './root-nav-band';
import {Platform} from 'react-native';
jest.mock('../../modules/lampy-album-layout',()=>({albumLayoutNativeAvailable:()=>true,albumNativePageViewAvailable:()=>true}));
it('shows family and personal albums alongside Capture and Revisit in Android parity',async()=>{
 const old=Platform.OS,flag=process.env.EXPO_PUBLIC_ANDROID_FAMILY_ENABLED;Object.defineProperty(Platform,'OS',{value:'android',configurable:true});process.env.EXPO_PUBLIC_ANDROID_FAMILY_ENABLED='1';
 try{const page=await render(<RootNavBand here="recent" onGo={()=>{}} onFamily={()=>{}}/>);expect(page.getByTestId('home-family')).toBeTruthy();expect(page.getByTestId('home-albums')).toBeTruthy();expect(page.getByTestId('home-lookback')).toBeTruthy();}finally{Object.defineProperty(Platform,'OS',{value:old,configurable:true});if(flag===undefined)delete process.env.EXPO_PUBLIC_ANDROID_FAMILY_ENABLED;else process.env.EXPO_PUBLIC_ANDROID_FAMILY_ENABLED=flag;}
});
