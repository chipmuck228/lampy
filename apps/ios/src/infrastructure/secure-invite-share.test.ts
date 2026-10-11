import {readInviteShare,saveInviteShare,removeInviteShare} from './secure-invite-share';
const mockValues=new Map<string,string>();
jest.mock('expo-secure-store',()=>({WHEN_UNLOCKED_THIS_DEVICE_ONLY:'device',getItemAsync:jest.fn(async(k:string)=>mockValues.get(k)??null),setItemAsync:jest.fn(async(k:string,v:string)=>{mockValues.set(k,v);}),deleteItemAsync:jest.fn(async(k:string)=>{mockValues.delete(k);})}));
beforeEach(()=>mockValues.clear());
it('restores large QR chunks only for the owning account/family and deletes them',async()=>{
 const data={link:'synthetic',qr:'x'.repeat(5500)};
 await saveInviteShare('a','f','i',data);
 expect(await readInviteShare('a','f','i')).toEqual(data);
 expect(await readInviteShare('b','f','i')).toBeNull();
 expect(await readInviteShare('a','other','i')).toBeNull();
 expect([...mockValues.values()].every(v=>v.length<=1000)).toBe(true);
 await removeInviteShare('a','f','i');expect(mockValues.size).toBe(0);
});
it('a partial cache is never read as a valid share',async()=>{
 await saveInviteShare('a','f','i',{link:'synthetic',qr:'x'.repeat(2000)});
 const part=[...mockValues.keys()].find(k=>k.endsWith('.1'))!;mockValues.delete(part);
 expect(await readInviteShare('a','f','i')).toBeNull();
});
