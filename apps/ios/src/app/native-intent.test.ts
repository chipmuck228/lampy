import { redirectSystemPath } from './+native-intent';
jest.mock('../infrastructure/family-config',()=>({isFamilyProductEntryOpen:()=>false}));
jest.mock('../infrastructure/family-invite-link',()=>({parseFamilyInviteLink:()=>null,rememberFamilyInvite:jest.fn()}));
it('routes only local album files to the ephemeral reader',()=>{
 expect(redirectSystemPath({path:'file:///received/book.lampy',initial:true})).toMatch(/^\/album-file\?token=/);
 expect(redirectSystemPath({path:'file:///received/bad.txt',initial:true})).toBe('/album-file');
 expect(redirectSystemPath({path:'/albums/book',initial:false})).toBe('/albums/book');
});
it('preserves rejection of invalid or closed family invite routes',()=>{
 expect(redirectSystemPath({path:'lampy://family-invite?token=bad',initial:false})).toBe('/family');
});
