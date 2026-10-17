import { db } from './db';

const TTL_MS = 10 * 60 * 1000;
const MAX_MEM_KEYS = 10000;
const mem = new Map<string, number>();

/**
 * 微信在 5 秒内未收到响应会重试同一条消息（最多 3 次）。
 * 原插件靠"永远快速响应"让重试几乎不发生，但没有做 MsgId 去重 ——
 * 对博客无影响，对游戏经济是灾难（超时重试 = 双倍收益）。
 * 这里做幂等去重：先标记后处理（at-most-once），内存 LRU + SQLite 唯一索引双保险。
 */
export function isDuplicate(key: string): boolean {
  if (!key) return false;

  const now = Date.now();

  if (mem.has(key)) return true;

  const info = db.prepare('INSERT OR IGNORE INTO seen_msgs (msg_id, ts) VALUES (?, ?)').run(key, now);
  mem.set(key, now);

  if (mem.size > MAX_MEM_KEYS) {
    for (const [k, t] of mem) {
      if (now - t > TTL_MS) mem.delete(k);
    }
  }

  return Number(info.changes) === 0;
}
