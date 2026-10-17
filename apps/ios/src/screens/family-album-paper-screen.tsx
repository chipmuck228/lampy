import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ALBUM_PAGE_WIDTH_PT, ALBUM_PAGE_HEIGHT_PT, ALBUM_SERIF_FONT, ALBUM_UI_FONT, ALBUM_PREVIEW_LOADING, ALBUM_PREVIEW_ZOOM_OUT, type AlbumLayout } from '../application/album-layout';
import { ALBUM_READING_STYLES, type AlbumReadingStyle } from '../application/album-reading';
import { familyPaperScope, familyPdfEnabled } from '../application/family-album-paper';
import { diagnoseAlbumFonts, requireAlbumNativePageView } from '../../modules/lampy-album-layout';
import { layoutAlbumPrint } from '../infrastructure/album-print-files';
import { familyPaperStyle, setFamilyPaperStyle } from '../infrastructure/family-paper-style';
import { albumPreviewSpokenText } from '../application/album-preview-speech';
import { firstSearchParam } from './lookback-origin';
import { AlbumBlockView } from './life-album-preview-screen';
import { useFamilyPaper } from './use-family-paper';
import { useRecentClipPlayback } from './use-recent-clip-playback';
import { SettingsPage } from './settings-chrome';
import { Text, type } from './life-text';
import { sage, inkSoft } from './life-page';
import { tr } from '../i18n';
const NativePage=requireAlbumNativePageView() as import('react').ComponentType<{pageJson:string;mediaJson:string;playingJson:string;style:object}>|null;
export default function FamilyAlbumPaperScreen(){
  const params=useLocalSearchParams<{familyId?:string;albumId?:string}>();const familyId=firstSearchParam(params.familyId)??'',albumId=firstSearchParam(params.albumId)??'';
  const router=useRouter(),reading=useFamilyPaper(familyId,albumId,true),clips=useRecentClipPlayback();
  const pause=useRef(clips.pause);useEffect(()=>{pause.current=clips.pause;},[clips.pause]);
  const [choice,setChoice]=useState<{scope:string;style:AlbumReadingStyle}|null>(null);
  const [layout,setLayout]=useState<{input:object;style:AlbumReadingStyle;result:AlbumLayout}|null>(null);
  const [failure,setFailure]=useState<{input:object;style:AlbumReadingStyle}|null>(null);
  const [page,setPage]=useState(0),[zoom,setZoom]=useState(false);
  const {width,height}=useWindowDimensions();
  const scope=reading.view?familyPaperScope(reading.view):'';
  const style=choice?.scope===scope?choice.style:familyPaperStyle(scope);
  const {prepared,capture}=reading;
  const failed=!!prepared&&failure?.input===prepared.input&&failure.style===style;
  useEffect(()=>{
    let cancelled=false;const valid=capture();
    if(prepared)void(async()=>{
      try{
        const fonts=diagnoseAlbumFonts(ALBUM_SERIF_FONT,ALBUM_UI_FONT);if(!fonts)throw Error('native rebuild required');
        const result=await layoutAlbumPrint(prepared.input,style,fonts);
        if(!cancelled&&valid()){setLayout({input:prepared.input,style,result});setPage(0);}
      }catch{if(!cancelled)setFailure({input:prepared.input,style});}
    })();
    return()=>{cancelled=true;void pause.current();};
  },[prepared,capture,style]);
  useEffect(()=>{void pause.current();},[page]);
  const shown=reading.view&&prepared?.input===layout?.input&&layout?.style===style?layout.result:null,current=shown?.pages[page];
  const scale=Math.max(120,Math.min(width-48,(height-280)*ALBUM_PAGE_WIDTH_PT/ALBUM_PAGE_HEIGHT_PT))/ALBUM_PAGE_WIDTH_PT*(zoom?1.7:1);
  const playing=current?.blocks.flatMap(b=>b.kind==='audio'&&clips.card(b.assetId).status==='playing'?[b.assetId]:[])??[];
  const hit={minHeight:48,justifyContent:'center' as const};
  return <SettingsPage title={tr('看纸页')} accessibilityLabel={tr('看纸页')} backLabel={tr('这一册')} onBack={()=>router.back()} pageTestID="family-album-paper">
    {!reading.blocked&&!reading.error&&!reading.view?<Text>{ALBUM_PREVIEW_LOADING}</Text>:null}
    {reading.error||failed?<><Text>{tr('家庭内容或资格已变化，请重新核对。')}</Text><Pressable accessibilityRole="button" style={hit} onPress={reading.retry}><Text>{tr('再试一次')}</Text></Pressable></>:null}
    {!reading.blocked&&!reading.error&&reading.view?<>
      <View style={{flexDirection:'row',gap:24}}>{(['plain','handmade'] as const).map(next=><Pressable key={next} accessibilityRole="button" accessibilityState={{selected:next===style}} style={hit} onPress={()=>{void pause.current();setFamilyPaperStyle(scope,next);setChoice({scope,style:next});}}><Text style={{...type.action,color:sage}}>{tr(next==='plain'?'素纸':'手作')}</Text></Pressable>)}</View>
      {!current&&!failed?<Text style={{...type.meta,color:inkSoft}}>{ALBUM_PREVIEW_LOADING}</Text>:null}
      {current?<>
        <Pressable accessibilityRole="button" style={hit} onPress={()=>setZoom(v=>!v)}><Text>{zoom?ALBUM_PREVIEW_ZOOM_OUT:tr('放大阅读')}</Text></Pressable>
        <ScrollView horizontal={zoom} style={{paddingTop:16}} contentContainerStyle={{minWidth:ALBUM_PAGE_WIDTH_PT*scale,minHeight:ALBUM_PAGE_HEIGHT_PT*scale}}>
          <View testID="family-paper-page" accessible accessibilityLabel={current.blocks.map(albumPreviewSpokenText).filter(Boolean).join('\n')} style={{width:ALBUM_PAGE_WIDTH_PT*scale,height:ALBUM_PAGE_HEIGHT_PT*scale,backgroundColor:ALBUM_READING_STYLES[style].paper}}>
            <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{width:ALBUM_PAGE_WIDTH_PT,height:ALBUM_PAGE_HEIGHT_PT,transform:[{scale}],transformOrigin:'top left'}}>
              {NativePage?<NativePage pageJson={JSON.stringify(current)} mediaJson={JSON.stringify(reading.prepared?.media??{})} playingJson={JSON.stringify(playing)} style={{width:ALBUM_PAGE_WIDTH_PT,height:ALBUM_PAGE_HEIGHT_PT}}/>:current.blocks.map((block,index)=><AlbumBlockView key={index} block={block} readingStyle={style} media={reading.prepared?.media??{}} playing={block.kind==='audio'&&playing.includes(block.assetId)}/>)}
            </View>
          </View>
        </ScrollView>
        <View style={{flexDirection:'row',gap:24}}><Pressable accessibilityRole="button" disabled={page===0} style={hit} onPress={()=>setPage(p=>p-1)}><Text>{tr('上一页')}</Text></Pressable><Pressable accessibilityRole="button" disabled={page===shown!.pages.length-1} style={hit} onPress={()=>setPage(p=>p+1)}><Text>{tr('下一页')}</Text></Pressable></View>
        {current.blocks.filter(b=>b.kind==='audio').map(b=>b.kind==='audio'?<Pressable key={b.assetId} accessibilityRole="button" style={hit} onPress={()=>{if(!reading.valid())return;const uri=reading.prepared?.media[b.assetId];if(uri)void (playing.includes(b.assetId)?clips.pause():clips.play(b.assetId,uri));}}><Text>{playing.includes(b.assetId)?tr('暂停'):b.text}</Text></Pressable>:null)}
      </>:null}
      {reading.view.access.canManage&&familyPdfEnabled()?<Pressable accessibilityRole="button" style={hit} onPress={()=>{void pause.current();router.push({pathname:'/family-album-print',params:{familyId,albumId}});}}><Text style={{...type.action,color:sage}}>{tr('导出这一册')}</Text></Pressable>:null}
    </>:null}
  </SettingsPage>;
}
