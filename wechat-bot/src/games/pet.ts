import { db } from '../db';
import { addGold, cooldown, pick, type User } from '../session';

const SPECIES = [
  { key: 'cat',    name: '橘猫',   emoji: '🐱', weight: 20 },
  { key: 'dog',    name: '柴犬',   emoji: '🐶', weight: 20 },
  { key: 'rabbit', name: '垂耳兔', emoji: '🐰', weight: 20 },
  { key: 'fox',    name: '小狐狸', emoji: '🦊', weight: 16 },
  { key: 'panda',  name: '熊猫',   emoji: '🐼', weight: 14 },
  { key: 'dragon', name: '神龙',   emoji: '🐲', weight: 10 },
] as const;

type Pet = {
  openid: string;
  name: string;
  species: string;
  level: number;
  exp: number;
  mood: number;
  fed_at: number;
};

function ensure(openid: string): Pet {
  const row = db.prepare('SELECT * FROM pets WHERE openid = ?').get(openid) as unknown as Pet | undefined;

  if (row) return row;

  // 领养：按权重随机
  const total = SPECIES.reduce((sum, s) => sum + s.weight, 0);
  let roll = Math.random() * total;
  const species = SPECIES.find(s => (roll -= s.weight) <= 0) ?? SPECIES[0];

  db.prepare('INSERT INTO pets (openid, name, species, fed_at, created_at) VALUES (?, ?, ?, ?, ?)').run(
    openid,
    species.name,
    species.key,
    Date.now(),
    Date.now(),
  );

  return db.prepare('SELECT * FROM pets WHERE openid = ?').get(openid) as unknown as Pet;
}

function speciesOf(pet: Pet) {
  return SPECIES.find(s => s.key === pet.species) ?? SPECIES[0];
}

// 饱食度：喂食后随时间衰减，约 10 小时空
function hunger(pet: Pet): number {
  return Math.max(0, 100 - Math.floor((Date.now() - pet.fed_at) / 360_000));
}

function hungerFace(h: number): string {
  if (h >= 70) return '😋';
  if (h >= 40) return '😐';
  if (h >= 10) return '😮';
  return '😵';
}

// 升级检查，返回提示文本（可能为空）
function levelUp(openid: string): string {
  const pet = ensure(openid);
  let gained = 0;

  while (pet.exp >= pet.level * 50 && pet.level < 99) {
    pet.exp -= pet.level * 50;
    pet.level += 1;
    gained += 1;
  }

  if (gained > 0) {
    db.prepare('UPDATE pets SET level = ?, exp = ? WHERE openid = ?').run(pet.level, pet.exp, openid);
    return `\n🎉 ${pet.name}升到了 Lv.${pet.level}！`;
  }

  db.prepare('UPDATE pets SET level = ?, exp = ? WHERE openid = ?').run(pet.level, pet.exp, openid);
  return '';
}

export function start(user: User): string {
  const pet = ensure(user.openid);
  return panel(user, pet);
}

function panel(user: User, pet: Pet): string {
  const s = speciesOf(pet);
  const h = hunger(pet);

  return [
    `${s.emoji} ${pet.name}（${s.name}）Lv.${pet.level}`,
    `经验：${pet.exp} / ${pet.level * 50}　　心情：${pet.mood}`,
    `饱食度：${h}% ${hungerFace(h)}`,
    `金币：${user.gold}`,
    '────────',
    '1 喂食　2 玩耍　3 打工　取名X',
  ].join('\n');
}

function feed(user: User): string {
  const pet = ensure(user.openid);
  const cost = 5;

  if (user.gold < cost) return `狗粮都买不起了（${cost} 金币），回复「签到」或让宠物「打工」。`;

  db.prepare('UPDATE users SET gold = gold - ? WHERE openid = ?').run(cost, user.openid);
  db.prepare('UPDATE pets SET fed_at = ?, exp = exp + 10 WHERE openid = ?').run(Date.now(), user.openid);

  const s = speciesOf(pet);
  return `${s.emoji} ${pet.name}吃得津津有味（-5 金币），经验 +10。${levelUp(user.openid)}`;
}

function play(user: User): string {
  const pet = ensure(user.openid);

  if (hunger(pet) < 10) return `${pet.name}饿得没力气玩了，先「喂食」吧。`;

  const wait = cooldown(user.openid, 'pet_play', 60_000);
  if (wait > 0) return `${pet.name}玩累了，休息 ${wait} 秒。`;

  // 玩耍消耗 10 饱食度（1 小时）和心情
  db.prepare('UPDATE pets SET fed_at = fed_at - ?, exp = exp + 5, mood = MIN(100, mood + 10) WHERE openid = ?').run(
    3600_000,
    user.openid,
  );

  const s = speciesOf(pet);
  return `🎾 你和${pet.name}玩了会儿接飞盘，心情大好，经验 +5。${levelUp(user.openid)}`;
}

function work(user: User): string {
  const pet = ensure(user.openid);
  const h = hunger(pet);

  if (h < 30) return `${pet.name}饿着肚子没法打工（饱食度 ${h}%），先「喂食」。`;

  const wait = cooldown(user.openid, 'pet_work', 300_000);
  if (wait > 0) return `${pet.name}刚下工，休息 ${Math.ceil(wait / 60)} 分钟后才能继续打工。`;

  const earned = 8 + pet.level * 2 + Math.floor(Math.random() * 5);
  const balance = addGold(user.openid, earned);

  // 打工消耗 25 饱食度（2.5 小时）
  db.prepare('UPDATE pets SET fed_at = fed_at - ?, exp = exp + 8 WHERE openid = ?').run(2.5 * 3600_000, user.openid);

  const s = speciesOf(pet);
  return `💼 ${pet.name}出门打工赚了 ${earned} 金币（当前 ${balance}），经验 +8。${levelUp(user.openid)}`;
}

function rename(user: User, name: string): string {
  const pet = ensure(user.openid);

  if (!name || name.length > 8) return '名字要 1-8 个字哦。示例：取名二狗';

  db.prepare('UPDATE pets SET name = ? WHERE openid = ?').run(name, user.openid);
  const s = speciesOf(pet);
  return `${s.emoji} 它现在叫「${name}」了！`;
}

export function handle(user: User, text: string): string {
  const pet = ensure(user.openid);

  if (text === '1' || text === '喂食') return feed(user);
  if (text === '2' || text === '玩耍') return play(user);
  if (text === '3' || text === '打工') return work(user);
  if (text.startsWith('取名')) return rename(user, text.slice(2).trim());

  return panel(user, pet);
}
