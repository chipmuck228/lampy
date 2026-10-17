import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import FamilyAlbumReadingScreen from './family-album-reading-screen';
import { familyPaperStyle } from '../infrastructure/family-paper-style';
const mockRead=jest.fn(),mockValidate=jest.fn(),mockPush=jest.fn(),mockPause=jest.fn(async()=>{}),mockPlay=jest.fn(async()=>{}),mockPersonal=jest.fn(),mockPersonalSave=jest.fn();
const mockBook={albumId:'book',familyId:'f',name:'Family book',opening:'Opening',createdAt:'2026-10-01',updatedAt:'2026-10-17',revision:1,validation:'v',cover:null,
 access:{userId:'a',canManage:false,rulesAcknowledged:true},items:[{shareId:'s',status:'active',share:{shareId:'s',familyId:'f',sourceRevision:1,authorNickname:'Dad',snapshot:{note:'Family note\n🙂',emotion:'',occurredAtPrecision:'unknown',media:[{objectId:'voice',mimeType:'audio/mp4'}]}}}]};
jest.mock('expo-router',()=>{const React=jest.requireActual('react');return {useLocalSearchParams:()=>({familyId:'f',albumId:'book'}),useRouter:()=>({back:jest.fn(),push:mockPush}),useFocusEffect:(fn:()=>void|(()=>void))=>React.useEffect(fn,[fn])};});
jest.mock('./device-lock-context',()=>({useDeviceLock:()=>null}));
jest.mock('./use-recent-clip-playback',()=>({useRecentClipPlayback:()=>({pause:mockPause,card:()=>({status:'idle'}),play:mockPlay})}));
jest.mock('../application/container',()=>({getUseCases:()=>mockPersonal()}));
jest.mock('../infrastructure/album-reading-store',()=>({readAlbumReadingState:()=>mockPersonal(),saveAlbumReadingState:(...args:unknown[])=>mockPersonalSave(...args)}));
jest.mock('../infrastructure/family-album-paper',()=>({familyPaperReader:async()=>({albums:{read:mockRead,validate:mockValidate},readMedia:async()=>({userId:'a',share:mockBook.items[0].share,media:[{objectId:'voice',mimeType:'audio/mp4',uri:'file://family/voice.m4a'}]}),imageSize:jest.fn()})}));
beforeEach(()=>{jest.clearAllMocks();process.env.EXPO_PUBLIC_FAMILY_ENTRY_OPEN='1';process.env.EXPO_PUBLIC_FAMILY_ALBUM_EVAL='1';Object.defineProperty(AppState,'currentState',{value:'active',writable:true,configurable:true});mockRead.mockResolvedValue(mockBook);mockValidate.mockResolvedValue({valid:true});});
afterEach(()=>{delete process.env.EXPO_PUBLIC_FAMILY_ENTRY_OPEN;delete process.env.EXPO_PUBLIC_FAMILY_ALBUM_EVAL;});
function wrap(){return <SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:844},insets:{top:47,left:0,right:0,bottom:34}}}><FamilyAlbumReadingScreen/></SafeAreaProvider>;}
it('uses the personal continuous reading page, free style choices and family paper navigation without personal storage',async()=>{
 const page=await render(wrap());await waitFor(()=>expect(page.getByText('Family note\n🙂')).toBeTruthy());
 expect(page.getByText('连续阅读')).toBeTruthy();expect(page.getByText('Opening')).toBeTruthy();expect(page.getByText('Dad')).toBeTruthy();
 await fireEvent.press(page.getByText('手作'));await waitFor(()=>expect(page.getByRole('button',{name:'手作'})).toBeSelected());
 expect(familyPaperStyle('family:["a","f","book"]')).toBe('handmade');
 await fireEvent.press(page.getByText('看纸页'));
 expect(mockPush).toHaveBeenLastCalledWith({pathname:'/family-album-paper',params:{familyId:'f',albumId:'book'}});
 expect(mockPause).toHaveBeenCalled();expect(mockPersonal).not.toHaveBeenCalled();expect(mockPersonalSave).not.toHaveBeenCalled();
});
it('plays family sound using the same reading controls',async()=>{
 const page=await render(wrap());await waitFor(()=>expect(page.getByText('播放声音')).toBeTruthy());
 await fireEvent.press(page.getByText('播放声音'));
 expect(mockPlay).toHaveBeenCalledWith('["a","f","s","voice"]','file://family/voice.m4a');
});
