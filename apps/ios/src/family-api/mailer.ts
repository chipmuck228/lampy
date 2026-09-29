import { connect as tlsConnect } from 'node:tls';

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type Mailer = {
  send(message: MailMessage): Promise<void>;
};

export type MemoryMailer = Mailer & { sent: MailMessage[] };

export function createMemoryMailer(): MemoryMailer {
  const sent: MailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push({ ...message });
    },
  };
}

export type SmtpMailerConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
};

export function parseSmtpMailerConfig(env: {
  LAMPY_EMAIL_SMTP_HOST?: string;
  LAMPY_EMAIL_SMTP_PORT?: string;
  LAMPY_EMAIL_SMTP_USER?: string;
  LAMPY_EMAIL_SMTP_PASS?: string;
  LAMPY_EMAIL_FROM?: string;
}): SmtpMailerConfig | null {
  const host = (env.LAMPY_EMAIL_SMTP_HOST || '').trim();
  const user = (env.LAMPY_EMAIL_SMTP_USER || '').trim();
  const pass = env.LAMPY_EMAIL_SMTP_PASS || '';
  const from = (env.LAMPY_EMAIL_FROM || '').trim();
  const port = Number(env.LAMPY_EMAIL_SMTP_PORT || '465');
  if (!host || !user || !pass || !from || !Number.isFinite(port) || port <= 0) return null;
  return { host, port, user, pass, from };
}

function smtpLine(socket: { write(chunk: string): void }, line: string) {
  socket.write(`${line}\r\n`);
}

function readSmtp(socket: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const onData = (chunk: Buffer) => {
      chunks.push(chunk);
      const text = Buffer.concat(chunks).toString('utf8');
      if (/\r\n$/.test(text)) {
        socket.off('data', onData);
        socket.off('error', onError);
        resolve(text);
      }
    };
    const onError = (error: Error) => {
      socket.off('data', onData);
      reject(error);
    };
    socket.on('data', onData);
    socket.once('error', onError);
  });
}

function encodeMailHeader(value: string) {
  return value.replace(/[\r\n]/g, ' ');
}

export function createSmtpMailer(config: SmtpMailerConfig): Mailer {
  return {
    async send(message) {
      const socket = await new Promise<ReturnType<typeof tlsConnect>>((resolve, reject) => {
        const next = tlsConnect(
          { host: config.host, port: config.port, servername: config.host },
          () => resolve(next),
        );
        next.once('error', reject);
      });
      try {
        await readSmtp(socket);
        smtpLine(socket, `EHLO lampy`);
        await readSmtp(socket);
        smtpLine(socket, 'AUTH LOGIN');
        await readSmtp(socket);
        smtpLine(socket, Buffer.from(config.user).toString('base64'));
        await readSmtp(socket);
        smtpLine(socket, Buffer.from(config.pass).toString('base64'));
        const auth = await readSmtp(socket);
        if (!/^235\b/.test(auth)) {
          throw new Error('SMTP authentication failed.');
        }
        smtpLine(socket, `MAIL FROM:<${config.from}>`);
        await readSmtp(socket);
        smtpLine(socket, `RCPT TO:<${message.to}>`);
        await readSmtp(socket);
        smtpLine(socket, 'DATA');
        await readSmtp(socket);
        smtpLine(socket, `From: ${encodeMailHeader(config.from)}`);
        smtpLine(socket, `To: ${encodeMailHeader(message.to)}`);
        smtpLine(socket, `Subject: ${encodeMailHeader(message.subject)}`);
        smtpLine(socket, 'Content-Type: text/plain; charset=utf-8');
        smtpLine(socket, '');
        smtpLine(socket, message.text.replace(/\r?\n\./g, '\n..'));
        smtpLine(socket, '.');
        const done = await readSmtp(socket);
        if (!/^250\b/.test(done)) {
          throw new Error('SMTP message was rejected.');
        }
        smtpLine(socket, 'QUIT');
      } finally {
        socket.end();
      }
    },
  };
}
