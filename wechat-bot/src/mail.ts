import nodemailer, { type Transporter } from 'nodemailer';
import { config } from './config';

export type SendResult = { ok: true } | { ok: false; error: string };

let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter === undefined) {
    transporter =
      config.smtpHost && config.smtpUser && config.smtpPass
        ? nodemailer.createTransport({
            host: config.smtpHost,
            port: config.smtpPort,
            secure: config.smtpPort === 465,
            auth: { user: config.smtpUser, pass: config.smtpPass },
          })
        : null;
  }

  return transporter;
}

export function smtpConfigured(): boolean {
  return getTransporter() !== null;
}

export async function sendEmailCode(to: string, code: string): Promise<SendResult> {
  const t = getTransporter();

  if (!t) return { ok: false, error: 'SMTP 未配置' };

  try {
    await t.sendMail({
      from: config.smtpFrom || config.smtpUser,
      to,
      subject: `【文字游戏大厅】验证码 ${code}`,
      text: `你的验证码是 ${code}，6 分钟内有效。若非本人操作请忽略本邮件。`,
      html: `<p>你的验证码是 <b style="font-size:22px;letter-spacing:4px">${code}</b></p><p>6 分钟内有效。若非本人操作请忽略本邮件。</p>`,
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ===== 短信通道预埋（按需接入阿里云/腾讯云 SMS 后替换实现即可）=====
export async function sendSmsCode(to: string, code: string): Promise<SendResult> {
  void to;
  void code;
  return { ok: false, error: '短信通道未接入' };
}
