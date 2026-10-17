import { db } from './db';
import { addGold, cooldown, getKvInt, setKv, setState, getStateData, saveStateData, type User } from './session';
import { sendEmailCode, smtpConfigured } from './mail';
import { config } from './config';
import { realmOf } from './games/cultivate';
import { jobOf } from './games/life';

/**
 * 账号系统：邮箱绑定 + 验证码 + 换微信号档案迁移
 *
 * 验证码规则与原插件 generate_verify_code 保持一致：
 *   6 位数字、6 分钟有效、同一用户同时只有一个有效码（重发即作废旧码）
 * 短信通道已预埋（mail.ts sendSmsCode），成本原因暂不接入。
 */

const CODE_TTL = 6 * 60_000; // 6 分钟
const MAX_ATTEMPTS = 5;
const BIND_REWARD = 50; // 首次绑定奖励
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

type BindSession =
  | { step: 'email' }
  | {
      step: 'code';
      email: string;
      code: string;
      purpose: 'bind' | 'recover';
      oldOpenid: string;
      expiresAt: number;
      attempts: number;
    };

export function boundEmail(openid: string): string | null {
  const row = db.prepare('SELECT email FROM bindings WHERE openid = ?').get(openid) as { email: string } | undefined;
  return row ? row.email : null;
}

export function start(user: User): string {
  const email = boundEmail(user.openid);

  if (email) {
    setState(user.openid, 'home');
    return `📧 当前绑定：${email}\n换新微信号时，用新号回复「绑定」输入此邮箱即可找回全部档案。`;
  }

  setState(user.openid, 'register', { step: 'email' });
  return ['📧 注册 / 绑定邮箱', '直接回复你的邮箱地址（例如 name@qq.com）', '绑定后换微信号可凭邮箱找回全部游戏档案', '回复「退出」取消'].join('\n');
}

// ===== 验证码生成（镜像原插件：6 位数字，重发自动作废旧码）=====
function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function issueCode(user: User, email: string, purpose: 'bind' | 'recover', oldOpenid: string): string {
  const wait = cooldown(user.openid, 'send_code', 60_000);
  if (wait > 0) return `发送太频繁，${wait} 秒后再试。`;

  const code = genCode();
  const session: BindSession = {
    step: 'code',
    email,
    code,
    purpose,
    oldOpenid,
    expiresAt: Date.now() + CODE_TTL,
    attempts: 0,
  };
  saveStateData(user.openid, session);

  // 邮件异步发送：绝不阻塞被动回复的 5 秒红线
  if (smtpConfigured()) {
    void sendEmailCode(email, code).then(result => {
      if (!result.ok) console.error('[mail] 验证码发送失败:', result.error);
    });
  }

  // 测试模式：SMTP 未配置或显式 EMAIL_DEBUG=true 时直接回复验证码
  if (config.emailDebug || !smtpConfigured()) {
    const mode = !smtpConfigured() ? 'SMTP 未配置，临时测试模式' : 'EMAIL_DEBUG 测试模式';
    return `⚠️ ${mode}\n验证码：${code}\n直接回复验证码完成验证（6 分钟内有效）`;
  }

  return `📬 验证码已发送至 ${email}，收到后直接回复验证码即可（6 分钟内有效）。\n若 1 分钟未收到，回复「重发」。`;
}

// ===== 档案迁移：把旧 openid 的全部数据搬到新 openid =====
function migrateProfile(toOpenid: string, fromOpenid: string): void {
  if (toOpenid === fromOpenid) return;

  const from = db.prepare('SELECT * FROM users WHERE openid = ?').get(fromOpenid) as
    | { gold: number; signin_date: string; signin_streak: number }
    | undefined;

  db.exec('BEGIN');
  try {
    // 新号的旧进度清空，以邮箱档案为准
    db.prepare('DELETE FROM kv WHERE openid = ?').run(toOpenid);
    db.prepare('DELETE FROM plots WHERE openid = ?').run(toOpenid);
    db.prepare('DELETE FROM pets WHERE openid = ?').run(toOpenid);
    db.prepare('DELETE FROM cultivators WHERE openid = ?').run(toOpenid);
    db.prepare('DELETE FROM lives WHERE openid = ?').run(toOpenid);
    db.prepare('DELETE FROM cards WHERE openid = ? AND card_key IN (SELECT card_key FROM cards WHERE openid = ?)').run(
      toOpenid,
      fromOpenid,
    );

    // 整体搬运
    for (const table of ['kv', 'plots', 'pets', 'cultivators', 'lives']) {
      db.prepare(`UPDATE ${table} SET openid = ? WHERE openid = ?`).run(toOpenid, fromOpenid);
    }
    db.prepare('UPDATE cards SET openid = ? WHERE openid = ?').run(toOpenid, fromOpenid);

    if (from) {
      db.prepare(
        "UPDATE users SET gold = ?, signin_date = ?, signin_streak = ?, state = 'home', state_data = '' WHERE openid = ?",
      ).run(from.gold, from.signin_date, from.signin_streak, toOpenid);
      db.prepare('DELETE FROM users WHERE openid = ?').run(fromOpenid);
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function profileSummary(openid: string): string {
  const u = db.prepare('SELECT gold FROM users WHERE openid = ?').get(openid) as { gold: number } | undefined;
  const pet = db.prepare('SELECT name, level FROM pets WHERE openid = ?').get(openid) as
    | { name: string; level: number }
    | undefined;
  const cards = db.prepare('SELECT COUNT(*) AS n FROM cards WHERE openid = ?').get(openid) as { n: number };

  const lines = [`金币：${u?.gold ?? 0}`, `修仙：${realmOf(openid)}`, `职业：${jobOf(openid)}`, `图鉴：${cards.n} 张`];

  if (pet) lines.push(`宠物：${pet.name} Lv.${pet.level}`);

  return lines.join('\n');
}

function verifyCode(user: User, s: Extract<BindSession, { step: 'code' }>, input: string): string {
  if (Date.now() > s.expiresAt) {
    return '⌛ 验证码已过期，回复「重发」获取新验证码。';
  }

  if (input !== s.code) {
    s.attempts += 1;
    if (s.attempts >= MAX_ATTEMPTS) {
      setState(user.openid, 'register', { step: 'email' });
      return `验证码错误次数过多，请重新回复邮箱。`;
    }
    saveStateData(user.openid, s);
    return `验证码不对，再试试（还剩 ${MAX_ATTEMPTS - s.attempts} 次机会）。`;
  }

  // 验证通过
  if (s.purpose === 'bind') {
    db.prepare('INSERT OR REPLACE INTO bindings (email, openid, bound_at) VALUES (?, ?, ?)').run(
      s.email,
      user.openid,
      Date.now(),
    );
    setState(user.openid, 'home');

    let rewardMsg = '';
    if (getKvInt(user.openid, 'bind_reward') === 0) {
      setKv(user.openid, 'bind_reward', 1);
      const balance = addGold(user.openid, BIND_REWARD);
      rewardMsg = `\n🎁 首次绑定奖励金币 +${BIND_REWARD}（当前 ${balance}）`;
    }

    return `✅ 邮箱绑定成功：${s.email}${rewardMsg}\n以后换微信号，用新号回复「绑定」即可找回档案。`;
  }

  // 找回：迁移档案 + 绑定改指向
  db.prepare('INSERT OR REPLACE INTO bindings (email, openid, bound_at) VALUES (?, ?, ?)').run(
    s.email,
    user.openid,
    Date.now(),
  );
  migrateProfile(user.openid, s.oldOpenid);
  setState(user.openid, 'home');

  return [
    '🎉 找回成功，档案已迁移到本微信号！',
    '',
    profileSummary(user.openid),
    '',
    '回复「菜单」继续游戏。',
  ].join('\n');
}

export function handle(user: User, text: string): string {
  const s = getStateData<BindSession>(user);

  if (!s) return start(user);

  if (s.step === 'email') {
    const email = text.trim();

    if (!EMAIL_RE.test(email)) {
      return '邮箱格式不对，示例：name@qq.com\n（回复「退出」取消）';
    }

    const bound = db.prepare('SELECT openid FROM bindings WHERE email = ?').get(email) as { openid: string } | undefined;

    if (bound && bound.openid === user.openid) {
      setState(user.openid, 'home');
      return `这个邮箱已经绑在当前微信号上了：${email}`;
    }

    // 已被其他微信号绑定 → 走找回；未绑定 → 走注册
    const purpose: 'bind' | 'recover' = bound ? 'recover' : 'bind';
    return issueCode(user, email, purpose, bound ? bound.openid : '');
  }

  // step === 'code'
  if (text === '重发') {
    return issueCode(user, s.email, s.purpose, s.oldOpenid);
  }

  return verifyCode(user, s, text.trim());
}
