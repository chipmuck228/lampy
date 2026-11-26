import {saveInviteImage,inviteImageSaveSupported} from './save-invite-image';
import * as Media from 'expo-media-library';
import * as FS from 'expo-file-system/legacy';
jest.mock('expo-media-library',()=>({requestPermissionsAsync:jest.fn(),Asset:{create:jest.fn()}}));
jest.mock('expo-file-system/legacy',()=>({cacheDirectory:'file:///cache/',EncodingType:{Base64:'base64'},writeAsStringAsync:jest.fn(),deleteAsync:jest.fn()}));
const qr='data:image/png;base64,iVBORw0KGgo=';
beforeEach(()=>{jest.clearAllMocks();jest.mocked(Media.requestPermissionsAsync).mockResolvedValue({granted:true} as Awaited<ReturnType<typeof Media.requestPermissionsAsync>>);jest.mocked(Media.Asset.create).mockResolvedValue({id:'saved'} as Media.Asset);});
it('requests only addition permission and cleans the temporary PNG after saving',async()=>{
 expect(await saveInviteImage(qr,async()=>true)).toBe(true);expect(Media.requestPermissionsAsync).toHaveBeenCalledWith(true,[]);
 expect(Media.Asset.create).toHaveBeenCalledTimes(1);const path=jest.mocked(Media.Asset.create).mock.calls[0][0];expect(FS.deleteAsync).toHaveBeenCalledWith(path,{idempotent:true});expect(path).not.toContain('iVBOR');
});
it('does not write an image when permission is denied',async()=>{
 jest.mocked(Media.requestPermissionsAsync).mockResolvedValue({granted:false} as Awaited<ReturnType<typeof Media.requestPermissionsAsync>>);
 await expect(saveInviteImage(qr,async()=>true)).rejects.toMatchObject({code:'INVITE_IMAGE_PERMISSION'});expect(FS.writeAsStringAsync).not.toHaveBeenCalled();expect(Media.Asset.create).not.toHaveBeenCalled();
});
it('does not save after account or focus changes while permission is pending',async()=>{
 let current=true;jest.mocked(Media.requestPermissionsAsync).mockImplementation(async()=>{current=false;return {granted:true} as Awaited<ReturnType<typeof Media.requestPermissionsAsync>>;});
 expect(await saveInviteImage(qr,async()=>current)).toBe(false);expect(Media.Asset.create).not.toHaveBeenCalled();
});
it('cleans a temporary image even when the native save fails',async()=>{
 jest.mocked(Media.Asset.create).mockRejectedValueOnce(Error('disk full'));await expect(saveInviteImage(qr,async()=>true)).rejects.toThrow('disk full');expect(FS.deleteAsync).toHaveBeenCalledTimes(1);
});
it('rejects remote URLs and oversize data before requesting permission',async()=>{
 await expect(saveInviteImage('https://example.com/image.png',async()=>true)).rejects.toMatchObject({code:'INVITE_IMAGE_INVALID'});
 await expect(saveInviteImage('data:image/png;base64,'+'A'.repeat(200001),async()=>true)).rejects.toMatchObject({code:'INVITE_IMAGE_INVALID'});expect(Media.requestPermissionsAsync).not.toHaveBeenCalled();
});

it('uses scoped photo additions on modern Android and offers link sharing on older devices',()=>{expect(inviteImageSaveSupported('android',30)).toBe(true);expect(inviteImageSaveSupported('android',29)).toBe(false);expect(inviteImageSaveSupported('ios','19')).toBe(true);});
