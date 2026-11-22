import nodemailer from 'nodemailer';
import {isPlausibleEmail,normalizeEmail} from './email-normalize';
import {FamilyError} from './errors';
import type {EmailCodeSender} from './email-code-types';

/** Server-only configuration. No production code printing, file content or remote message URLs. */
export function emailCodeConfiguration(env:Partial<NodeJS.ProcessEnv>):{secret:string;sender:EmailCodeSender;dailyLimit:number}|undefined {
  if(env.LAMPY_EMAIL_CODE_ENABLED!=='1')return;
  const secret=env.LAMPY_EMAIL_CODE_SECRET??'';
  const host=(env.LAMPY_SMTP_HOST??'').trim();
  const port=Number(env.LAMPY_SMTP_PORT??'465');
  const from=normalizeEmail(env.LAMPY_EMAIL_FROM??'');
  const user=env.LAMPY_SMTP_USER??'',pass=env.LAMPY_SMTP_PASSWORD??'';
  const dailyLimit=Number(env.LAMPY_EMAIL_CODE_DAILY_LIMIT??'200');
  if(Buffer.byteLength(secret)<32||!host||/[\s/@?#]/.test(host)||![465,587].includes(port)||!user||!pass||!isPlausibleEmail(from)||!Number.isSafeInteger(dailyLimit)||dailyLimit<1||dailyLimit>10000) {
    throw new Error('Email code login requires a 32-byte secret, SMTP host/port (465 or 587), credentials, sender address and a valid daily limit.');
  }
  const transport=nodemailer.createTransport({host,port,secure:port===465,requireTLS:port===587,
    auth:{user,pass},tls:{rejectUnauthorized:true},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,
    disableFileAccess:true,disableUrlAccess:true,logger:false,debug:false});
  return {secret,dailyLimit,sender:{async send({to,code,intent,language}) {
    const action=language==='zh'?(intent==='delete'?'删除账号':intent==='login'?'登录':intent==='reauth'?'验证身份':'关联邮箱'):
      intent==='delete'?'delete your account':intent==='login'?'sign in':intent==='reauth'?'verify your identity':'link your email';
    const text=language==='zh'?`你的 Lampy 验证码是 ${code}，用于${action}，5 分钟内有效。\n请勿将验证码告诉他人。如果不是你本人操作，请忽略此邮件。`:
      `Your Lampy verification code is ${code}. Use it to ${action} within 5 minutes.\nDo not share this code. If you did not request it, ignore this email.`;
    try {
      const info=await transport.sendMail({from:{name:'Lampy',address:from},to,subject:language==='zh'?'Lampy 邮箱验证码':'Your Lampy verification code',text});
      if(!info.accepted?.length||info.rejected?.length)throw new Error('Recipient not accepted');
    } catch {throw new FamilyError('EMAIL_DELIVERY_FAILED','The verification email could not be sent.');}
  }}};
}
