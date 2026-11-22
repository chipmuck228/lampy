import nodemailer from 'nodemailer';
import {emailCodeConfiguration} from './email-code-smtp';

jest.mock('nodemailer',()=>({__esModule:true,default:{createTransport:jest.fn()}}));
const env={LAMPY_EMAIL_CODE_ENABLED:'1',LAMPY_EMAIL_CODE_SECRET:'s'.repeat(64),LAMPY_SMTP_HOST:'smtp.example.com',LAMPY_SMTP_USER:'sender',LAMPY_SMTP_PASSWORD:'server-only-password',LAMPY_EMAIL_FROM:'lampy@example.com'};
it('defaults closed and refuses incomplete configuration without network activity',()=>{
 expect(emailCodeConfiguration({})).toBeUndefined();expect(()=>emailCodeConfiguration({LAMPY_EMAIL_CODE_ENABLED:'1'})).toThrow();
 expect(()=>emailCodeConfiguration({...env,LAMPY_SMTP_PORT:'25'})).toThrow();
 expect(()=>emailCodeConfiguration({...env,LAMPY_EMAIL_FROM:'a@example.com\r\nBcc:other@example.com'})).toThrow();
});
it.each(['465','587'])('uses authenticated strict TLS on port %s and never enables message logging or external content',async port=>{
 const sendMail=jest.fn(async()=>({accepted:['user@example.com'],rejected:[]}));
 (nodemailer.createTransport as jest.Mock).mockReturnValue({sendMail});
 const config=emailCodeConfiguration({...env,LAMPY_SMTP_PORT:port})!;
 expect(nodemailer.createTransport).toHaveBeenLastCalledWith(expect.objectContaining({secure:port==='465',requireTLS:port==='587',tls:{rejectUnauthorized:true},disableFileAccess:true,disableUrlAccess:true,logger:false,debug:false}));
 await config.sender.send({to:'user@example.com',code:'012345',intent:'login',language:'en'});
 expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({to:'user@example.com',text:expect.stringContaining('012345')}));
});
it('does not return SMTP details or pretend a rejected recipient was delivered',async()=>{
 (nodemailer.createTransport as jest.Mock).mockReturnValue({sendMail:jest.fn(async()=>{throw new Error('SMTP secret and message content');})});
 const config=emailCodeConfiguration(env)!;
 await expect(config.sender.send({to:'user@example.com',code:'123456',intent:'link',language:'zh'})).rejects.toMatchObject({code:'EMAIL_DELIVERY_FAILED',message:'The verification email could not be sent.'});
});
