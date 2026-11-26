import {useEffect,useState} from 'react';
import {AccessibilityInfo,Animated,AppState,Easing,Image,StyleSheet,View} from 'react-native';
import {tr} from '../i18n';
import {paperDeep} from './life-page';
const mark=require('../../assets/images/splash-icon.png');

/** Motion is off until the user's preference is known, and stops in the background. */
export function useGentlePhotoMotion(){
 const [reduced,setReduced]=useState(true),[foreground,setForeground]=useState(AppState.currentState==='active');
 useEffect(()=>{
  let active=true,changed=false;
  const preference=AccessibilityInfo.addEventListener('reduceMotionChanged',value=>{changed=true;if(active)setReduced(value);});
  void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(active&&!changed)setReduced(value);}).catch(()=>undefined);
  const lifecycle=AppState.addEventListener('change',value=>setForeground(value==='active'));
  return()=>{active=false;preference.remove();lifecycle.remove();};
 },[]);
 return !reduced&&foreground;
}

/** Existing Lampy artwork, no spin or zoom; a failed photo remains a quiet static mark. */
export function LampyPhotoPlaceholder({loading,animate}:{loading:boolean;animate:boolean}){
 const [opacity]=useState(()=>new Animated.Value(.3)),[edge,setEdge]=useState(80);
 useEffect(()=>{
  opacity.setValue(.3);
  if(!loading||!animate)return;
  const pulse=Animated.loop(Animated.sequence([
   Animated.timing(opacity,{toValue:.58,duration:1600,easing:Easing.inOut(Easing.sin),useNativeDriver:true,isInteraction:false}),
   Animated.timing(opacity,{toValue:.3,duration:1600,easing:Easing.inOut(Easing.sin),useNativeDriver:true,isInteraction:false}),
  ]));
  pulse.start();return()=>{pulse.stop();opacity.stopAnimation();};
 },[loading,animate,opacity]);
 return <View testID={loading?'lampy-photo-loading':'lampy-photo-unavailable'} style={styles.frame}
   accessibilityRole={loading?'progressbar':'image'} accessibilityLabel={tr(loading?'照片正在加载':'照片暂时无法显示')}
   onLayout={event=>{const {width,height}=event.nativeEvent.layout;setEdge(Math.max(60,Math.min(140,Math.min(width,height)*.7)));}}>
   <Animated.View style={{opacity}} testID="lampy-photo-loading-mark" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
     <Image source={mark} style={{width:edge,height:edge}} resizeMode="contain" accessible={false}/>
   </Animated.View>
 </View>;
}
const styles=StyleSheet.create({frame:{...StyleSheet.absoluteFill,backgroundColor:paperDeep,alignItems:'center',justifyContent:'center'}});
