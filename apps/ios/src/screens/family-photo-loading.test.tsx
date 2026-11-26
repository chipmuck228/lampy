import {act,cleanup,fireEvent,render,waitFor} from '@testing-library/react-native';
import {AccessibilityInfo,AppState} from 'react-native';
import {FamilyAlbumCoverPreview,FAMILY_PHOTO_READY_TIMEOUT_MS} from './family-album-editor';
import {invalidateFamilySafety} from '../application/family-safety-events';
const mockRead=jest.fn();let mockBlur:(()=>void)|undefined;
jest.mock('../application/container',()=>({getFamilyUseCases:async()=>({history:{read:mockRead}})}));
jest.mock('../application/foreground-audio',()=>({pauseForegroundAudio:jest.fn()}));
jest.mock('expo-router',()=>{const {useEffect}=jest.requireActual('react');return {useFocusEffect:(fn:()=>void|(()=>void))=>useEffect(()=>{const stop=fn();mockBlur=typeof stop==='function'?stop:undefined;return stop;},[fn])};});
jest.mock('expo-image',()=>{const {View}=jest.requireActual('react-native');return {Image:(props:object)=><View {...props} testID="family-photo-image"/>};});
beforeEach(()=>{mockRead.mockReset();mockBlur=undefined;Object.defineProperty(AppState,'currentState',{configurable:true,value:'active'});jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);});
afterEach(async()=>{await cleanup();jest.restoreAllMocks();jest.useRealTimers();});
it('keeps the Lampy mark until the actual image displays, with private cache disabled',async()=>{
 mockRead.mockResolvedValue({media:[{objectId:'p',uri:'file:///private/photo'}]});const page=await render(<FamilyAlbumCoverPreview familyId="f" cover={{shareId:'s',objectId:'p'}} fill/>);
 await waitFor(()=>expect(page.getByTestId('family-photo-image')).toBeTruthy());expect(page.getByTestId('lampy-photo-loading')).toBeTruthy();expect(page.getByTestId('family-photo-image').props.cachePolicy).toBe('none');
 await fireEvent(page.getByTestId('family-photo-image'),'load');expect(page.queryByTestId('lampy-photo-loading')).toBeNull();expect(page.getByTestId('family-photo-image')).toBeTruthy();
});
it('ends loading for failed reads and decoding instead of pulsing forever',async()=>{
 mockRead.mockRejectedValueOnce(Error('offline'));const first=await render(<FamilyAlbumCoverPreview familyId="f" cover={{shareId:'s',objectId:'p'}} fill/>);await waitFor(()=>expect(first.getByTestId('lampy-photo-unavailable')).toBeTruthy());expect(first.queryByTestId('family-photo-image')).toBeNull();await first.unmount();
 mockRead.mockResolvedValue({media:[{objectId:'p',uri:'file:///private/photo'}]});const page=await render(<FamilyAlbumCoverPreview familyId="f" cover={{shareId:'s',objectId:'p'}} fill/>);await waitFor(()=>expect(page.getByTestId('family-photo-image')).toBeTruthy());await fireEvent(page.getByTestId('family-photo-image'),'error');expect(page.getByTestId('lampy-photo-unavailable')).toBeTruthy();expect(page.queryByTestId('family-photo-image')).toBeNull();
});
it('bounds pending work and does not reintroduce a late result after timeout',async()=>{
 jest.useFakeTimers();let finish!:(v:unknown)=>void;mockRead.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const page=await render(<FamilyAlbumCoverPreview familyId="f" cover={{shareId:'s',objectId:'p'}} fill/>);await waitFor(()=>expect(mockRead).toHaveBeenCalled());
 await act(async()=>{jest.advanceTimersByTime(FAMILY_PHOTO_READY_TIMEOUT_MS);});expect(page.getByTestId('lampy-photo-unavailable')).toBeTruthy();
 await act(async()=>{finish({media:[{objectId:'p',uri:'file:///late'}]});});expect(page.queryByTestId('family-photo-image')).toBeNull();
});
it('clears a loaded image on blur and ignores a read from a previous source',async()=>{
 let finish!:(v:unknown)=>void;mockRead.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const page=await render(<FamilyAlbumCoverPreview familyId="f" cover={{shareId:'s',objectId:'p'}} fill/>);await waitFor(()=>expect(mockRead).toHaveBeenCalled());
 mockRead.mockResolvedValue({media:[{objectId:'new',uri:'file:///new'}]});await page.rerender(<FamilyAlbumCoverPreview familyId="f" cover={{shareId:'s',objectId:'new'}} fill/>);await waitFor(()=>expect(page.getByTestId('family-photo-image').props.source.uri).toBe('file:///new'));
 await act(async()=>{finish({media:[{objectId:'p',uri:'file:///old'}]});});expect(page.getByTestId('family-photo-image').props.source.uri).toBe('file:///new');
 await act(async()=>{mockBlur?.();});expect(page.queryByTestId('family-photo-image')).toBeNull();
});
it('removes an already displayed image immediately after a family safety invalidation',async()=>{
 mockRead.mockResolvedValueOnce({media:[{objectId:'p',uri:'file:///private'}]}).mockImplementation(()=>new Promise(()=>{}));
 const page=await render(<FamilyAlbumCoverPreview familyId="f" cover={{shareId:'s',objectId:'p'}} tile={{name:'Book',width:120,height:160}}/>);await waitFor(()=>expect(page.getByTestId('family-photo-image')).toBeTruthy());await fireEvent(page.getByTestId('family-photo-image'),'display');
 await act(async()=>{invalidateFamilySafety();});expect(page.queryByTestId('family-photo-image')).toBeNull();expect(page.getByTestId('lampy-photo-loading')).toBeTruthy();
});
