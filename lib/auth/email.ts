import nodemailer from "nodemailer";

/*
 * Account emails (verification, password reset, "someone tried to register with your email").
 * Sent through an SMTP server configured in AUTH_SMTP_URL; no provider is built in or paid for.
 * Links are never logged. Server-side only.
 */

export type EmailMessage = { to: string; subject: string; text: string };

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

const SIGNATURE = "\n\nProperty Intelligence (დემო პლატფორმა)";

export function verificationEmail(to: string, url: string): EmailMessage {
  return {
    to,
    subject: "დაადასტურეთ ელფოსტა",
    text:
      `ანგარიშის გასააქტიურებლად დაადასტურეთ ელფოსტა ამ ბმულით:\n${url}\n\n` +
      "ბმული მოქმედებს 1 საათის განმავლობაში. თუ ანგარიში თქვენ არ შეგიქმნიათ, უბრალოდ " +
      "უგულებელყავით ეს წერილი." +
      SIGNATURE,
  };
}

export function passwordResetEmail(to: string, url: string): EmailMessage {
  return {
    to,
    subject: "პაროლის აღდგენა",
    text:
      `ახალი პაროლის დასაყენებლად გახსენით ეს ბმული:\n${url}\n\n` +
      "ბმული მოქმედებს 1 საათის განმავლობაში და ერთხელ გამოიყენება. თუ პაროლის აღდგენა " +
      "თქვენ არ მოგითხოვიათ, უგულებელყავით ეს წერილი; პაროლი არ შეიცვლება." +
      SIGNATURE,
  };
}

/** Sent instead of an error when someone registers with an existing email (no enumeration). */
export function existingAccountEmail(to: string, loginUrl: string): EmailMessage {
  return {
    to,
    subject: "ამ ელფოსტით ანგარიში უკვე არსებობს",
    text:
      "ვიღაცამ სცადა ამ ელფოსტით ახალი ანგარიშის შექმნა, მაგრამ ანგარიში უკვე არსებობს.\n" +
      `შესასვლელად: ${loginUrl}\nპაროლი თუ დაგავიწყდათ, გამოიყენეთ „პაროლის აღდგენა“.` +
      SIGNATURE,
  };
}

/** SMTP sender (nodemailer). The URL may contain credentials; it is never logged. */
export function createSmtpSender(smtpUrl: string, from: string): EmailSender {
  const transport = nodemailer.createTransport(smtpUrl);
  return {
    async send({ to, subject, text }) {
      await transport.sendMail({ from, to, subject, text });
    },
  };
}
