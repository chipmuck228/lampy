import {StyleSheet} from 'react-native';
import {paper,ink,inkSoft,sage} from './life-page';
import {type} from './life-text';

export const albumExportPageStyles=StyleSheet.create({body:{gap:16},section:{gap:10,paddingTop:20},cover:{height:210,backgroundColor:'#E2E8DE',overflow:'hidden'},binding:{position:'absolute',left:0,top:0,bottom:0,width:7,backgroundColor:sage},title:{fontFamily:'Baskerville',fontSize:32,lineHeight:44,color:ink},heading:{...type.action,color:ink},meta:{...type.meta,color:inkSoft},row:{gap:6,paddingVertical:14},paper:{backgroundColor:paper}});
