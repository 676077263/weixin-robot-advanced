import Fastify from 'fastify';
import { config } from './config';
import { parseXmlMessage, buildTextReply } from './wechat-xml';
import { WechatCrypto, checkSignature, wrapEncryptedReply } from './wechat-crypto';
import { handleMessage } from './router';
import { SITE_NAME, SITE_URL } from './lobby';
import { isDuplicate } from './dedup';
import { db } from './db';

const app = Fastify({ logger: false });

// 请求留痕：排查预览代理/微信验证用
app.addHook('onRequest', async (req) => {
  console.log(`[access] ${req.method} ${req.url} from ${req.ip}`);
});

// 微信推送的 body 是 XML：直接拿原始字符串自己解析
app.addContentTypeParser(
  ['text/xml', 'application/xml', 'text/plain'],
  { parseAs: 'string' },
  (_req, body, done) => done(null as Error | null, body as string),
);

let cachedCrypto: WechatCrypto | null | undefined;
function getCrypto(): WechatCrypto | null {
  if (cachedCrypto === undefined) {
    cachedCrypto = config.encodingAESKey && config.appId ? new WechatCrypto(config.appId, config.encodingAESKey) : null;
  }
  return cachedCrypto;
}

// 回调路径：与公众号后台配置保持一致 https://glgxt.cn/weixin/reply/
// 同时注册带/不带尾斜杠两种路径
const CALLBACK_PATHS = ['/weixin/reply', '/weixin/reply/'];

// ===== URL 验证（GET）=====
// 验签通过才回显 echostr —— 修复原插件 reply.php 顶部未验签直接回显的问题
for (const path of CALLBACK_PATHS) {
  app.get(path, async (req, reply) => {
    const q = req.query as Record<string, string>;
    const aes = q.encrypt_type === 'aes';

    const ok = aes
      ? checkSignature(config.token, { timestamp: q.timestamp, nonce: q.nonce, signature: q.msg_signature, encrypt: q.echostr })
      : checkSignature(config.token, { timestamp: q.timestamp, nonce: q.nonce, signature: q.signature });

    reply.type('text/plain; charset=utf-8');

    // 浏览器直接访问（无微信参数）→ 显示存活状态
    if (!q.signature && !q.msg_signature) {
      return `${SITE_NAME} · 机器人服务运行中 ✓\n${SITE_URL}`;
    }

    if (!ok) return ' ';

    if (!q.echostr) return 'ok';

    if (aes) {
      const crypto = getCrypto();
      return crypto ? crypto.decrypt(q.echostr) : ' ';
    }

    return q.echostr;
  });
}

// ===== 消息推送（POST）=====
for (const path of CALLBACK_PATHS) {
  app.post(path, async (req, reply) => {
  const q = req.query as Record<string, string>;
  const raw = String(req.body || '');
  const crypto = getCrypto();
  const aes = q.encrypt_type === 'aes' && !!crypto;

  reply.type('text/xml; charset=utf-8');
  let out = ' ';

  try {
    let xml = raw;

    // 兼容/安全模式：先验 msg_signature，再解密出明文 XML
    if (aes && crypto) {
      const outer = parseXmlMessage(raw);

      const sigOk = checkSignature(config.token, {
        timestamp: q.timestamp,
        nonce: q.nonce,
        signature: q.msg_signature,
        encrypt: outer.Encrypt,
      });
      if (!sigOk) return ' ';

      xml = crypto.decrypt(outer.Encrypt);
    }

    const msg = parseXmlMessage(xml);

    // 幂等去重：事件消息没有 MsgId，用 openid+时间戳+类型组合
    const dupKey = msg.MsgId || `${msg.FromUserName}:${msg.CreateTime}:${msg.MsgType}:${msg.Event || ''}`;
    if (isDuplicate(dupKey)) return ' ';

    const text = await handleMessage(msg);

    // 消息留痕（继承原插件：可追溯、可统计）
    try {
      db.prepare(
        'INSERT INTO messages (msg_id, openid, msg_type, content, reply, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(dupKey, msg.FromUserName || '', msg.MsgType || '', msg.Content || '', text, Date.now());
    } catch {
      // 留痕失败不影响回复主链路
    }

    out = buildTextReply(msg.ToUserName || config.appId || 'bot', msg.FromUserName || '', text);

    if (aes && crypto) {
      out = wrapEncryptedReply(config.token, crypto.encrypt(out), q.timestamp, q.nonce);
    }
  } catch (err) {
    // 全局兜底：任何异常都回复空格，绝不空响应 —— 原插件"不丢消息"的可靠性核心
    console.error('[wechat] 处理失败:', err);
    out = ' ';
  }

  return out;
  });
}

app.listen({ port: config.port, host: '0.0.0.0' }).then(() => {
  console.log(`微信机器人已启动: http://0.0.0.0:${config.port}/weixin/reply/`);
});
