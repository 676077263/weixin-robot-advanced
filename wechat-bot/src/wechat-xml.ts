import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ trimValues: false });

// 清洗控制字符（继承自原插件 wpjam_strip_control_characters 的做法）
// 微信消息里偶发控制字符会导致 XML 解析失败 —— 官方示例文件丢消息的常见原因之一
export function stripControlChars(str: string): string {
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

export function parseXmlMessage(raw: string): Record<string, string> {
  const xml = parser.parse(stripControlChars(raw));
  const root = (xml as Record<string, unknown>).xml ?? xml;
  const out: Record<string, string> = {};

  if (root && typeof root === 'object') {
    for (const [key, value] of Object.entries(root as Record<string, unknown>)) {
      if (typeof value === 'string' || typeof value === 'number') {
        out[key] = String(value);
      }
    }
  }

  return out;
}

// CDATA 转义：内容里的 "]]>" 会破坏 XML 结构
export function cdata(text: string): string {
  return '<![CDATA[' + text.replace(/\]\]>/g, ']]]]><![CDATA[>') + ']]>';
}

export function buildTextReply(fromUser: string, toUser: string, content: string): string {
  return (
    '<xml>' +
    `<ToUserName>${cdata(toUser)}</ToUserName>` +
    `<FromUserName>${cdata(fromUser)}</FromUserName>` +
    `<CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>` +
    `<MsgType>${cdata('text')}</MsgType>` +
    `<Content>${cdata(content)}</Content>` +
    '</xml>'
  );
}
