import { db } from '../db';
import { addGold, cooldown, type User } from '../session';

const JOBS = ['实习生', '职员', '主管', '经理', '总监', '董事长'];

const WORK_COOLDOWN = 180_000; // 3 分钟
const RATE_PER_DAY = 0.01; // 存款年化…不，日化 1%，30 天封顶
const INTEREST_CAP_DAYS = 30;

type Life = { openid: string; level: number; works: number; deposit: number; interest_at: number };

function ensure(openid: string): Life {
  db.prepare('INSERT OR IGNORE INTO lives (openid, interest_at) VALUES (?, ?)').run(openid, Date.now());
  return db.prepare('SELECT * FROM lives WHERE openid = ?').get(openid) as unknown as Life;
}

// 结算利息（时间即状态）
function settleInterest(openid: string): { days: number; interest: number } | null {
  const life = ensure(openid);

  if (life.deposit <= 0) return null;

  const days = Math.floor((Date.now() - life.interest_at) / 86_400_000);
  if (days <= 0) return null;

  const interest = Math.floor(life.deposit * RATE_PER_DAY * Math.min(days, INTEREST_CAP_DAYS));
  if (interest <= 0) {
    db.prepare('UPDATE lives SET interest_at = ? WHERE openid = ?').run(Date.now(), openid);
    return null;
  }

  addGold(openid, interest);
  db.prepare('UPDATE lives SET interest_at = ? WHERE openid = ?').run(Date.now(), openid);

  return { days, interest };
}

export function start(user: User): string {
  return panel(user);
}

function panel(user: User): string {
  const life = ensure(user.openid);
  const settled = settleInterest(user.openid);
  const fresh = ensure(user.openid);
  const balance = user.gold + (settled?.interest ?? 0);

  return [
    `💼 人生模拟　　职业：${JOBS[fresh.level]}`,
    `现金：${balance}　　存款：${fresh.deposit}`,
    `打工次数：${fresh.works}`,
    ...(settled ? [`💰 存款利息结算（${settled.days} 天）：+${settled.interest}`] : []),
    '────────',
    '1 打工　2 升职　3 存款X　4 取款X',
  ].join('\n');
}

function work(user: User): string {
  const life = ensure(user.openid);

  const wait = cooldown(user.openid, 'life_work', WORK_COOLDOWN);
  if (wait > 0) return `今天摸鱼被老板抓包了，${wait} 秒后再来打工。`;

  const earned = 10 + life.level * 6 + Math.floor(Math.random() * 7);
  const balance = addGold(user.openid, earned);
  db.prepare('UPDATE lives SET works = works + 1 WHERE openid = ?').run(user.openid);

  const flavor = pickFlavor();
  return `${flavor}工资到账 +${earned}（当前 ${balance}）。`;
}

function pickFlavor(): string {
  const events = [
    '📦 你搬了一天的砖，',
    '📊 你做完了一份 PPT，',
    '☕ 你帮同事带了咖啡，',
    '🔧 你修好了打印机，',
    '📝 你加了个小班，',
  ];
  return events[Math.floor(Math.random() * events.length)];
}

function promote(user: User): string {
  const life = ensure(user.openid);

  if (life.level >= JOBS.length - 1) return '👑 你已经是董事长了，接下来交给年轻人吧。';

  const needWorks = (life.level + 1) * 4;
  if (life.works < needWorks) return `工龄不足：还需打工 ${needWorks - life.works} 次才能竞争${JOBS[life.level + 1]}。`;

  const fee = (life.level + 1) * 100;
  if (user.gold < fee) return `打点关系需要 ${fee} 金币（当前 ${user.gold}）。`;

  db.prepare('UPDATE users SET gold = gold - ? WHERE openid = ?').run(fee, user.openid);

  if (Math.random() < 0.75) {
    db.prepare('UPDATE lives SET level = level + 1, works = 0 WHERE openid = ?').run(user.openid);
    return `🎉 恭喜升职！你现在是大人物的【${JOBS[life.level + 1]}】（花费 ${fee} 金币打点）。`;
  }

  return `💔 升职失败，${fee} 金币的见面礼打了水漂。回炉「打工」攒资历吧。`;
}

function deposit(user: User, amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '示例：存款500';
  if (user.gold < amount) return `现金不足（当前 ${user.gold}）。`;

  db.prepare('UPDATE users SET gold = gold - ? WHERE openid = ?').run(amount, user.openid);
  db.prepare('UPDATE lives SET deposit = deposit + ? WHERE openid = ?').run(amount, user.openid);

  const fresh = ensure(user.openid);
  return `🏦 存入 ${amount} 金币（余额 ${user.gold - amount}，存款 ${fresh.deposit}）。日息 1%，躺着生钱。`;
}

function withdraw(user: User, amount: number): string {
  const life = ensure(user.openid);

  if (!Number.isFinite(amount) || amount <= 0) return '示例：取款500';
  if (life.deposit < amount) return `存款不足（当前存款 ${life.deposit}）。`;

  settleInterest(user.openid);
  db.prepare('UPDATE lives SET deposit = deposit - ? WHERE openid = ?').run(amount, user.openid);
  const balance = addGold(user.openid, amount);

  return `💸 取出 ${amount} 金币（现金 ${balance}，存款 ${ensure(user.openid).deposit}）。`;
}

// 供档案摘要查询
export function jobOf(openid: string): string {
  return JOBS[ensure(openid).level];
}

export function handle(user: User, text: string): string {
  if (text === '1' || text === '打工') return work(user);
  if (text === '2' || text === '升职') return promote(user);

  let m = text.match(/^存款\s*(\d+)$/);
  if (m) return deposit(user, Number(m[1]));

  m = text.match(/^取款\s*(\d+)$/);
  if (m) return withdraw(user, Number(m[1]));

  if (text === '3' || text === '存款') return '示例：存款500';
  if (text === '4' || text === '取款') return '示例：取款200';

  return panel(user);
}
