import {createFamilyApiClient} from '../infrastructure/family-http-client';
import {familyReadDiagnostic} from './family-read-diagnostic';
it('emits only fixed troubleshooting fields, never arbitrary error contents or IDs',()=>{
 const log=jest.spyOn(console,'info').mockImplementation(()=>{});
 try {
  familyReadDiagnostic('READ_FAILED','MEDIA_CONTENT',Date.now(),{code:'FORBIDDEN',httpStatus:403,message:'private text',token:'secret',shareId:'shr_private'},3);
  const row=JSON.parse(log.mock.calls[0][1]);expect(row).toMatchObject({revision:'photo-read-4',mediaTransport:'EXPO_NATIVE',event:'READ_FAILED',stage:'MEDIA_CONTENT',code:'FORBIDDEN',httpStatus:403,mediaNumber:3});
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|secret/);
  familyReadDiagnostic('READ_FAILED','DETAIL',Date.now(),{code:'private code',httpStatus:'private status'});
  expect(JSON.parse(log.mock.calls[1][1])).toMatchObject({code:'OTHER'});
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|secret/);
 } finally {log.mockRestore();}
});
it('keeps the actual HTTP status for read troubleshooting without changing the denial code',async()=>{
 const client=createFamilyApiClient({request:async()=>({status:403,body:{error:{code:'FORBIDDEN',message:'Not available'}}})});
 await expect(client.getShare('private-session','private-family','private-share')).rejects.toMatchObject({code:'FORBIDDEN',httpStatus:403});
});
