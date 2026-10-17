import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 3000),
  dbPath: process.env.DB_PATH || 'bot.db',
  // 公众号后台「设置与开发 -> 基本配置」
  token: process.env.WECHAT_TOKEN || '',
  appId: process.env.WECHAT_APPID || '',
  // 明文模式留空；兼容/安全模式必填
  encodingAESKey: process.env.WECHAT_ENCODING_AES_KEY || '',

  // ===== 邮件（注册/找回验证码）=====
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 465),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFrom: process.env.SMTP_FROM || '',
  // true 时验证码直接回复在对话里（仅测试用，上线必须去掉）
  emailDebug: process.env.EMAIL_DEBUG === 'true',
};
