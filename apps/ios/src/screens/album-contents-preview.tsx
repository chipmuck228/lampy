import {Pressable,StyleSheet,View} from 'react-native';
import {Image} from 'expo-image';
import {tr} from '../i18n';
import {ALBUM_MISSING_SOURCE,formatAlbumAudioDuration,type AlbumEntryView} from '../application/life-album';
import {LifeIcon} from './life-icons';
import {ink,inkSoft,paperDeep,sage} from './life-page';
import {Text,type} from './life-text';

/** Only adjacent equal dates merge: a user's manual order is never sorted away. */
export function albumContentsGroups(entries:AlbumEntryView[]){
 const groups:{date:string|null;entries:{entry:AlbumEntryView;index:number}[]}[]=[];
 entries.forEach((entry,index)=>{
  const date=entry.source==='ready'?entry.dateLabel:null;
  let group=groups.at(-1);
  if(!group||group.date!==date){group={date,entries:[]};groups.push(group);}
  group.entries.push({entry,index});
 });
 return groups;
}
export function AlbumContentsPreview({entries,onOpen}:{entries:AlbumEntryView[];onOpen:(entry:AlbumEntryView)=>void}){
 const tiles=albumContentsGroups(entries).flatMap(group=>group.entries.map((item,i)=>({...item,date:i===0?group.date:null})));
 return <View style={styles.contents} testID="life-album-contents">
   <View style={styles.tiles} testID="life-album-content-tiles">{tiles.map(({entry,index,date},position)=>{
    const ready=entry.source==='ready',hasPhoto=ready&&entry.photoCount>0;
    const duration=formatAlbumAudioDuration(entry.audioDurationMs);
    const label=ready?[entry.noteExcerpt,entry.dateLabel,entry.photoCount?tr('有{0}张照片',[entry.photoCount]):null,entry.hasAudio?(duration||tr('有声音')):null,entry.unknownCount?tr('还有一种现在打不开的媒介。'):null].filter(Boolean).join(' · '):ALBUM_MISSING_SOURCE;
    return <Pressable key={entry.momentId} accessibilityRole="button" accessibilityLabel={label||tr('第{0}条',[index+1])} testID={`life-album-entry-open-${entry.momentId}`} onPress={()=>onOpen(entry)} style={[styles.tile,position%2===1&&styles.offset]}>
     <View testID={`life-album-entry-${entry.momentId}`} style={styles.tileBody}>
      {date?<Text accessibilityRole="header" style={styles.date} testID={`life-album-entry-date-${entry.momentId}`}>{date}</Text>:null}
      {hasPhoto?<View style={styles.photoMount}>
       {entry.photoCount>1?<View pointerEvents="none" style={styles.stack} testID={`life-album-entry-stack-${entry.momentId}`}/>:null}
       {entry.thumbnailUri?<Image source={{uri:entry.thumbnailUri}} style={[styles.photo,position%3===1&&styles.portrait]} contentFit="cover" accessibilityIgnoresInvertColors testID={`life-album-entry-thumb-${entry.momentId}`}/>:<View style={[styles.photo,styles.placeholder]}><LifeIcon name="photo" size={25}/><Text style={styles.meta}>{tr('有照片')}</Text></View>}
      </View>:null}
      {ready?<View style={[styles.copy,!hasPhoto&&styles.words]}>
       {!hasPhoto&&entry.noteExcerpt?<Text accessible={false} importantForAccessibility="no" style={styles.quote}>“</Text>:null}
       {entry.noteExcerpt?<Text testID={`life-album-entry-note-${entry.momentId}`} numberOfLines={hasPhoto?2:4} style={styles.excerpt}>{entry.noteExcerpt}</Text>:null}
       {entry.hasAudio?<View style={styles.sound} testID={`life-album-entry-audio-${entry.momentId}`}><LifeIcon name="waveform" size={20}/><Text style={styles.meta}>{duration||tr('有声音')}</Text></View>:null}
       {entry.unknownCount>0?<Text style={styles.meta} numberOfLines={2} testID={`life-album-entry-unknown-${entry.momentId}`}>{tr('还有一种现在打不开的媒介。')}</Text>:null}
       {!hasPhoto&&!entry.noteExcerpt&&!entry.hasAudio&&!entry.unknownCount?<Text style={styles.meta}>{tr('第{0}条',[index+1])}</Text>:null}
      </View>:<View style={styles.words}><Text style={styles.meta}>{ALBUM_MISSING_SOURCE}</Text></View>}
     </View>
    </Pressable>;
   })}</View>
 </View>;
}
const styles=StyleSheet.create({
 contents:{gap:28,paddingTop:16,paddingBottom:20},
 date:{...type.meta,color:inkSoft,fontSize:13,lineHeight:20,letterSpacing:.3},
 tiles:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'flex-start',rowGap:22},
 tile:{width:'47%',minHeight:48},
 offset:{paddingTop:24},
 tileBody:{gap:10},
 photoMount:{paddingRight:4,paddingBottom:4},
 stack:{position:'absolute',left:4,right:0,top:4,bottom:0,backgroundColor:'#D7DED1',transform:[{rotate:'2deg'}]},
 photo:{width:'100%',aspectRatio:1.05,backgroundColor:paperDeep},
 portrait:{aspectRatio:.8},
 placeholder:{alignItems:'center',justifyContent:'center',gap:8},
 copy:{gap:8},
 words:{minHeight:130,paddingTop:10,paddingBottom:16},
 quote:{fontFamily:'Baskerville',fontSize:44,lineHeight:34,color:sage},
 excerpt:{fontSize:16,lineHeight:26,color:ink},
 meta:{...type.meta,color:inkSoft,fontSize:13,lineHeight:20,flexShrink:1},
 sound:{flexDirection:'row',alignItems:'center',gap:6,minHeight:32},
});
