import crypto from 'node:crypto';

function sha1Of(parts: string[]): string {
  return crypto.createHash('sha1').update([...parts].sort().join('')).digest('hex');
}

// 验签：encrypt 存在时参与排序（兼容/安全模式的 msg_signature）
export function checkSignature(
  token: string,
  parts: { timestamp: string; nonce: string; signature: string; encrypt?: string },
): boolean {
  if (!token || !parts.signature) return false;

  const list = [token, parts.timestamp, parts.nonce];
  if (parts.encrypt) list.push(parts.encrypt);

  return sha1Of(list) === parts.signature;
}

export class WechatCrypto {
  private key: Buffer;
  private iv: Buffer;

  constructor(public readonly appId: string, encodingAESKey: string) {
    this.key = Buffer.from(encodingAESKey + '=', 'base64');
    if (this.key.length !== 32) {
      throw new Error('EncodingAESKey 非法');
    }
    this.iv = this.key.subarray(0, 16);
  }

  // 微信加解密协议：随机16字节 + 4字节消息长度(网络字节序) + 消息体 + appid
  decrypt(encryptedBase64: string): string {
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.key, this.iv);
    decipher.setAutoPadding(false);

    let buf = Buffer.concat([
      decipher.update(Buffer.from(encryptedBase64, 'base64')),
      decipher.final(),
    ]);

    // PKCS7-32 手动去填充
    const pad = buf[buf.length - 1];
    if (pad < 1 || pad > 32) {
      throw new Error('解密失败：非法填充');
    }
    buf = buf.subarray(0, buf.length - pad);

    const msgLen = buf.readUInt32BE(16);
    const msg = buf.subarray(20, 20 + msgLen).toString('utf8');
    const fromAppId = buf.subarray(20 + msgLen).toString('utf8');

    if (fromAppId && fromAppId !== this.appId) {
      throw new Error('解密失败：AppID 不匹配');
    }

    return msg;
  }

  encrypt(plainXml: string): string {
    const random = crypto.randomBytes(16);
    const msg = Buffer.from(plainXml, 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(msg.length, 0);
    const appId = Buffer.from(this.appId, 'utf8');

    let raw = Buffer.concat([random, len, msg, appId]);
    const k = 32 - (raw.length % 32); // PKCS7-32 填充
    raw = Buffer.concat([raw, Buffer.alloc(k, k)]);

    const cipher = crypto.createCipheriv('aes-256-cbc', this.key, this.iv);
    cipher.setAutoPadding(false);

    return Buffer.concat([cipher.update(raw), cipher.final()]).toString('base64');
  }
}

// 加密回复外层结构。
// timestamp/nonce 显式取自请求参数 —— 修复原插件 encrypt() 中未定义变量的 bug
export function wrapEncryptedReply(token: string, encrypted: string, timestamp: string, nonce: string): string {
  const signature = sha1Of([token, timestamp, nonce, encrypted]);

  return (
    '<xml>' +
    `<Encrypt><![CDATA[${encrypted}]]></Encrypt>` +
    `<MsgSignature><![CDATA[${signature}]]></MsgSignature>` +
    `<TimeStamp>${timestamp}</TimeStamp>` +
    `<Nonce><![CDATA[${nonce}]]></Nonce>` +
    '</xml>'
  );
}
