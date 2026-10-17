import { db } from '../db';
import { fmtDuration, type User } from '../session';

const PLOT_COUNT = 3;

const CROPS = [
  { key: 'radish',  name: '白萝卜', emoji: '🥕', growMs: 60_000,       reward: 2,  cost: 1 },
  { key: 'wheat',   name: '小麦',   emoji: '🌾', growMs: 5 * 60_000,   reward: 15, cost: 3 },
  { key: 'pumpkin', name: '南瓜',   emoji: '🎃', growMs: 30 * 60_000,  reward: 80, cost: 10 },
] as const;

type Plot = { idx: number; crop: string | null; plantedAt: number | null };

function getPlots(openid: string): Plot[] {
  const rows = db.prepare('SELECT idx, crop, planted_at FROM plots WHERE openid = ? ORDER BY idx').all(openid) as Array<{
    idx: number;
    crop: string;
    planted_at: number;
  }>;

  const plots: Plot[] = Array.from({ length: PLOT_COUNT }, (_, i) => ({ idx: i + 1, crop: null, plantedAt: null }));

  for (const row of rows) {
    const plot = plots[row.idx - 1];
    if (plot) {
      plot.crop = row.crop;
      plot.plantedAt = row.planted_at;
    }
  }

  return plots;
}

export function start(user: User): string {
  return panel(user);
}

function panel(user: User): string {
  const lines: string[] = [`🌱 我的农场　　金币：${user.gold}`, ''];

  for (const plot of getPlots(user.openid)) {
    if (!plot.crop) {
      lines.push(`地块${plot.idx}：空地`);
      continue;
    }

    const crop = CROPS.find(c => c.key === plot.crop)!;
    const elapsed = Date.now() - (plot.plantedAt ?? 0);

    if (elapsed >= crop.growMs) {
      lines.push(`地块${plot.idx}：${crop.emoji}${crop.name} ✅可收获`);
    } else {
      lines.push(`地块${plot.idx}：${crop.emoji}${crop.name} 还需 ${fmtDuration(crop.growMs - elapsed)}`);
    }
  }

  lines.push('────────');
  lines.push('1 白萝卜　2 小麦　3 南瓜　4 收获');
  return lines.join('\n');
}

function plant(user: User, cropNo: number): string {
  const crop = CROPS[cropNo - 1];
  const empty = getPlots(user.openid).find(p => !p.crop);

  if (!empty) return '🙈 没有空地了，先回复「收获」清理成熟的作物。';
  if (user.gold < crop.cost) return `金币不足：${crop.name}种子需要 ${crop.cost} 金币，回复「签到」赚金币。`;

  const now = Date.now();

  db.prepare('UPDATE users SET gold = gold - ? WHERE openid = ?').run(crop.cost, user.openid);
  db.prepare('INSERT OR REPLACE INTO plots (openid, idx, crop, planted_at) VALUES (?, ?, ?, ?)').run(
    user.openid,
    empty.idx,
    crop.key,
    now,
  );

  return `${crop.emoji} 已在地块${empty.idx}种下${crop.name}，${fmtDuration(crop.growMs)}后成熟。`;
}

function harvest(user: User): string {
  let earned = 0;
  const picked: string[] = [];

  for (const plot of getPlots(user.openid)) {
    if (!plot.crop) continue;

    const crop = CROPS.find(c => c.key === plot.crop)!;

    if (Date.now() - (plot.plantedAt ?? 0) >= crop.growMs) {
      earned += crop.reward;
      picked.push(`${crop.emoji}${crop.name}+${crop.reward}`);
      db.prepare('DELETE FROM plots WHERE openid = ? AND idx = ?').run(user.openid, plot.idx);
    }
  }

  if (!picked.length) return '还没有成熟的作物。';

  db.prepare('UPDATE users SET gold = gold + ? WHERE openid = ?').run(earned, user.openid);

  return `🎉 收获 ${picked.join('、')}，金币 +${earned}（当前 ${user.gold + earned}）。`;
}

export function handle(user: User, text: string): string {
  if (/^[1-3]$/.test(text)) return plant(user, Number(text));
  if (text === '4' || text === '收获') return harvest(user);
  if (text === '白萝卜' || text === '萝卜') return plant(user, 1);
  if (text === '小麦') return plant(user, 2);
  if (text === '南瓜') return plant(user, 3);
  return panel(user);
}
