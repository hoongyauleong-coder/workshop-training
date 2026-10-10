import 'server-only';
import nodemailer from 'nodemailer';
import type { Mailer } from './engine';

/** Sends through Gmail SMTP with a Google Workspace App Password. */
export function gmailMailer(): Mailer {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '');
  if (!user || !pass) throw new Error('Missing GMAIL_USER or GMAIL_APP_PASSWORD');
  const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } });
  return {
    async send(m) {
      await transport.sendMail({
        from: { name: m.fromName, address: user },
        to: m.to,
        cc: m.cc,
        replyTo: m.replyTo,
        subject: m.subject,
        html: m.html,
        text: m.text
      });
    }
  };
}
