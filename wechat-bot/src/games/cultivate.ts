import { db } from '../db';
import { addGold, cooldown, fmtDuration, type User } from '../session';
import { grantRandomCard } from './cards';

const REALMS = ['练气期', '筑基期', '金丹期', '元婴期', '化神期', '渡劫期', '大乘期', '仙人'];

// index = 当前境界，值为突破到下一境界所需修为
const BREAK_NEED = [200, 500, 1200, 3000, 8000, 20000, 50000];

const MEDITATE_CAP_MIN = 480; // 离线修炼封顶 8 小时
const EXP_PER_MIN_PER_REALM = 1;

type Cultivator = {
  openid: string;
  realm: number;
  exp: number;
  meditated_at: number;
  adventures: number;
};

function ensure(openid: string): Cultivator {
  const now = Date.now();
  db.prepare('INSERT OR IGNORE INTO cultivators (openid, meditated_at) VALUES (?, ?)').run(openid, now);
  return db.prepare('SELECT * FROM cultivators WHERE openid = ?').get(openid) as unknown as Cultivator;
}

export function start(user: User): string {
  const c = ensure(user.openid);
  return panel(user, c);
}

function panel(user: User, c: Cultivator): string {
  const need = c.realm >= 7 ? '—' : BREAK_NEED[c.realm];

  return [
    `🧙 修仙　　${REALMS[c.realm]}`,
    `修为：${c.exp} / ${need}`,
    `金币：${user.gold}`,
    '────────',
    '1 打坐　2 突破　3 历练',
  ].join('\n');
}

// 打坐：结算离线收益（时间即状态）
function meditate(user: User): string {
  const c = ensure(user.openid);
  const minutes = Math.min((Date.now() - c.meditated_at) / 60_000, MEDITATE_CAP_MIN);

  if (minutes < 1) {
    return `🧘 刚开始打坐，心神未定。稍后再来结算修为。\n（离线也会持续修炼，上限 ${MEDITATE_CAP_MIN / 60} 小时）`;
  }

  const gain = Math.floor(minutes) * EXP_PER_MIN_PER_REALM * (c.realm + 1);
  db.prepare('UPDATE cultivators SET exp = exp + ?, meditated_at = ? WHERE openid = ?').run(gain, Date.now(), user.openid);

  const need = c.realm >= 7 ? '—' : BREAK_NEED[c.realm];
  return `🧘 打坐修炼 ${Math.floor(minutes)} 分钟，修为 +${gain}（当前 ${c.exp + gain} / ${need}）。${c.realm < 7 && c.exp + gain >= BREAK_NEED[c.realm] ? '\n✨ 修为圆满，可以「突破」了！' : ''}`;
}

function breakthrough(user: User): string {
  const c = ensure(user.openid);

  if (c.realm >= 7) return '🌟 你已位列仙班，高处不胜寒。';

  const need = BREAK_NEED[c.realm];
  if (c.exp < need) return `修为不足，还差 ${need - c.exp}。回复「打坐」继续修炼。`;

  const successRate = 0.85 - c.realm * 0.06;

  if (Math.random() < successRate) {
    const reward = (c.realm + 1) * 50;
    const gold = addGold(user.openid, reward);
    db.prepare('UPDATE cultivators SET realm = realm + 1, exp = exp - ? WHERE openid = ?').run(need, user.openid);
    return `⚡ 突破成功！晋升【${REALMS[c.realm + 1]}】，金币 +${reward}（当前 ${gold}）。`;
  }

  const lost = Math.floor(c.exp * 0.4);
  db.prepare('UPDATE cultivators SET exp = exp - ? WHERE openid = ?').run(lost, user.openid);
  return `💢 突破失败，走火入魔，修为 -${lost}。休整后再战（成功率 ${(successRate * 100).toFixed(0)}%）。`;
}

function adventure(user: User): string {
  const wait = cooldown(user.openid, 'adventure', 60_000);
  if (wait > 0) return `历练刚回来不久，休息 ${wait} 秒。`;

  const c = ensure(user.openid);
  db.prepare('UPDATE cultivators SET adventures = adventures + 1 WHERE openid = ?').run(user.openid);

  const roll = Math.random();

  if (roll < 0.55) {
    const gold = 10 + c.realm * 8 + Math.floor(Math.random() * (c.realm * 4 + 5));
    const balance = addGold(user.openid, gold);
    return `⚔️ 历练归来，斩妖除魔！金币 +${gold}（当前 ${balance}）。`;
  }

  if (roll < 0.8) {
    const exp = 20 + c.realm * 10 + Math.floor(Math.random() * 10);
    db.prepare('UPDATE cultivators SET exp = exp + ? WHERE openid = ?').run(exp, user.openid);
    return `🏞机缘巧合，领悟天地至理！修为 +${exp}。`;
  }

  if (roll < 0.92) {
    return `✨ 深山奇遇！${grantRandomCard(user.openid)}`;
  }

  const lost = 5 + Math.floor(Math.random() * 11);
  const balance = addGold(user.openid, -lost);
  return `🐍 遭遇偷袭，仓皇而逃，掉落金币 ${lost}（当前 ${balance}）。`;
}

export function handle(user: User, text: string): string {
  if (text === '1' || text === '打坐') return meditate(user);
  if (text === '2' || text === '突破') return breakthrough(user);
  if (text === '3' || text === '历练') return adventure(user);

  const c = ensure(user.openid);
  return panel(user, c);
}

// 供排行榜/未来功能查询使用
export function realmOf(openid: string): string {
  return REALMS[ensure(openid).realm];
}
