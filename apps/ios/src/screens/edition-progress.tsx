import {StyleSheet,View} from 'react-native';
import {tr} from '../i18n';
import {Text} from './life-text';
import {hairline,ink,sage} from './life-page';
/** Completion comes from the writer/reader, never a timer. */
export function EditionProgress({fraction,dark=false}:{fraction:number;dark?:boolean}){
 const percent=Math.max(0,Math.min(100,Math.round(fraction*100)));
 return <View style={styles.root} testID="album-export-progress">
  {!dark?<Text style={styles.title} accessibilityLiveRegion="polite">{tr('正在制作这一册…')}</Text>:null}
  <View style={[styles.track,dark&&styles.darkTrack]} accessible accessibilityRole="progressbar" accessibilityLabel={tr('制作进度')} accessibilityValue={{min:0,max:100,now:percent}}><View style={[styles.fill,{width:`${percent}%`},dark&&styles.darkFill]}/></View>
 </View>;
}
const styles=StyleSheet.create({root:{gap:12,paddingTop:4},title:{fontFamily:'Baskerville',fontSize:20,lineHeight:28,color:ink,textAlign:'center'},track:{height:3,borderRadius:1.5,backgroundColor:hairline,overflow:'hidden'},fill:{height:3,backgroundColor:sage},darkTrack:{backgroundColor:'#3A4943'},darkFill:{backgroundColor:'#C4D3CD'}});
