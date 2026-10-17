import { db } from './db';

export type User = {
  openid: string;
  gold: number;
  state: string;
  state_data: string;
  signin_date: string;
  signin_streak: number;
};

export function ensureUser(openid: string): User {
  const now = Date.now();
  db.prepare('INSERT OR IGNORE INTO users (openid, created_at, last_active) VALUES (?, ?, ?)').run(openid, now, now);
  return db.prepare('SELECT * FROM users WHERE openid = ?').get(openid) as unknown as User;
}

export function setState(openid: string, state: string, data?: unknown): void {
  db.prepare('UPDATE users SET state = ?, state_data = ? WHERE openid = ?').run(
    state,
    data === undefined ? '' : JSON.stringify(data),
    openid,
  );
}

export function getStateData<T>(user: User): T | null {
  if (!user.state_data) return null;
  try {
    return JSON.parse(user.state_data) as T;
  } catch {
    return null;
  }
}

export function saveStateData(openid: string, data: unknown): void {
  db.prepare('UPDATE users SET state_data = ? WHERE openid = ?').run(JSON.stringify(data), openid);
}

export function getKv(openid: string, key: string): string | null {
  const row = db.prepare('SELECT value FROM kv WHERE openid = ? AND key = ?').get(openid, key) as
    | { value: string }
    | undefined;
  return row ? row.value : null;
}

export function getKvInt(openid: string, key: string, fallback = 0): number {
  const v = getKv(openid, key);
  return v === null ? fallback : Number(v) || 0;
}

export function setKv(openid: string, key: string, value: string | number): void {
  db.prepare('INSERT OR REPLACE INTO kv (openid, key, value) VALUES (?, ?, ?)').run(openid, key, String(value));
}

// 操作提示只展示一次：首次交互后永久标记
export function hintsShown(openid: string): boolean {
  return getKvInt(openid, 'hint_shown') === 1;
}

export function markHintsShown(openid: string): void {
  setKv(openid, 'hint_shown', 1);
}

// 冷却：返回剩余秒数；0 表示已放行并重新计时
export function cooldown(openid: string, action: string, ms: number): number {
  const last = getKvInt(openid, `cd:${action}`);
  const remain = last + ms - Date.now();
  if (remain > 0) return Math.ceil(remain / 1000);
  setKv(openid, `cd:${action}`, Date.now());
  return 0;
}

// 金币唯一入口，返回最新余额
export function addGold(openid: string, delta: number): number {
  db.prepare('UPDATE users SET gold = MAX(0, gold + ?) WHERE openid = ?').run(delta, openid);
  const row = db.prepare('SELECT gold FROM users WHERE openid = ?').get(openid) as { gold: number };
  return row.gold;
}

export function touch(openid: string): void {
  db.prepare('UPDATE users SET last_active = ? WHERE openid = ?').run(Date.now(), openid);
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function fmtDuration(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  if (h > 0) return `${h}小时${m}分`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}
