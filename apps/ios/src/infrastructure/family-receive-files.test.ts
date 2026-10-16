import {createExpoFamilyReceiveFiles} from './family-receive-files';
const mockInfo=jest.fn();const mockRead=jest.fn();
jest.mock('expo-file-system/legacy',()=>({documentDirectory:'file:///docs/',getInfoAsync:(...args:unknown[])=>mockInfo(...args),readAsStringAsync:()=>mockRead()}));
beforeEach(()=>jest.clearAllMocks());
it('checks the native file fingerprint without reading/base64-decoding the photo into JS',async()=>{
 mockInfo.mockResolvedValue({exists:true,isDirectory:false,size:5000000,md5:'native-digest'});
 const files=createExpoFamilyReceiveFiles();
 await expect(files.stamp!('account/family/share/photo')).resolves.toBe('5000000:native-digest');
 expect(mockInfo).toHaveBeenCalledWith('file:///docs/family-cache/account/family/share/photo',{md5:true});
 expect(mockRead).not.toHaveBeenCalled();
});
it.each([{exists:false},{exists:true,isDirectory:true},{exists:true,isDirectory:false,size:10}])('does not reuse a missing or unverifiable file: %j',async info=>{
 mockInfo.mockResolvedValue(info);
 await expect(createExpoFamilyReceiveFiles().stamp!('photo')).resolves.toBeNull();
});
