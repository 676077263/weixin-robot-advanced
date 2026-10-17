import { db } from '../db';
import { addGold, getKvInt, setKv, type User } from '../session';
import { CARDS, PULL_COST, RARITY_REFUND, RARITY_STARS, RARITY_WEIGHT, SETS, SET_BONUS, type CardDef, type Rarity } from './card-data';

function owned(openid: string): Map<string, number> {
  const rows = db.prepare('SELECT card_key, count FROM cards WHERE openid = ?').all(openid) as Array<{
    card_key: string;
    count: number;
  }>;
  return new Map(rows.map(r => [r.card_key, r.count]));
}

function pickRarity(): Rarity {
  const entries = Object.entries(RARITY_WEIGHT) as Array<[Rarity, number]>;
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [rarity, weight] of entries) {
    if ((roll -= weight) <= 0) return rarity;
  }
  return 'N';
}

function pickCard(): CardDef {
  const rarity = pickRarity();
  const pool = CARDS.filter(c => c.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)];
}

// 发卡（不计费）：返回结果文本。供抽卡与修仙奇遇共用。
function grant(openid: string, card: CardDef): string {
  const existing = db.prepare('SELECT count FROM cards WHERE openid = ? AND card_key = ?').get(openid, card.key) as
    | { count: number }
    | undefined;

  if (existing) {
    const refund = RARITY_REFUND[card.rarity];
    const balance = addGold(openid, refund);
    db.prepare('UPDATE cards SET count = count + 1 WHERE openid = ? AND card_key = ?').run(openid, card.key);
    return `重复卡【${RARITY_STARS[card.rarity]}·${card.name}${card.emoji}】自动折算，金币 +${refund}（当前 ${balance}）`;
  }

  db.prepare('INSERT INTO cards (openid, card_key, count) VALUES (?, ?, 1)').run(openid, card.key);

  let msg = `NEW！集齐图鉴卡【${RARITY_STARS[card.rarity]}·${card.name}${card.emoji}】`;

  // 套系集齐奖励
  const setCards = CARDS.filter(c => c.set === card.set);
  const myOwned = owned(openid);
  if (setCards.every(c => myOwned.has(c.key))) {
    const bonusKey = `cardset:${card.set}`;
    if (getKvInt(openid, bonusKey) === 0) {
      setKv(openid, bonusKey, 1);
      const balance = addGold(openid, SET_BONUS);
      msg += `\n🏅「${card.set}」图鉴集齐！奖励金币 +${SET_BONUS}（当前 ${balance}）`;
    }
  }

  return msg;
}

export function grantRandomCard(openid: string): string {
  return grant(openid, pickCard());
}

export function start(user: User): string {
  return panel(user);
}

function panel(user: User): string {
  const myOwned = owned(user.openid);

  return [
    `🎴 图鉴　　已收集 ${myOwned.size} / ${CARDS.length}`,
    `金币：${user.gold}`,
    ...SETS.map(set => {
      const setCards = CARDS.filter(c => c.set === set);
      const got = setCards.filter(c => myOwned.has(c.key)).length;
      return `${set}：${got}/${setCards.length}`;
    }),
    '────────',
    `1 抽卡（${PULL_COST} 金币）　2 我的卡`,
  ].join('\n');
}

function pull(user: User): string {
  if (user.gold < PULL_COST) return `抽卡需要 ${PULL_COST} 金币（当前 ${user.gold}）。签到、打工、历练都能赚金币。`;

  db.prepare('UPDATE users SET gold = gold - ? WHERE openid = ?').run(PULL_COST, user.openid);
  const card = pickCard();

  return `🎴 金光一闪！\n${grant(user.openid, card)}`;
}

function myCards(openid: string): string {
  const myOwned = owned(openid);

  if (!myOwned.size) return '图鉴空空如也，回复「抽卡」开启第一张卡！';

  const lines: string[] = ['🎴 我的图鉴'];

  for (const set of SETS) {
    const items = CARDS.filter(c => c.set === set)
      .map(c => (myOwned.has(c.key) ? `${c.name}${c.emoji}${myOwned.get(c.key)! > 1 ? `×${myOwned.get(c.key)}` : ''}` : null))
      .filter(Boolean);
    lines.push(`【${set}】${items.length ? items.join('、') : '（空）'}`);
  }

  lines.push(`共 ${myOwned.size} / ${CARDS.length} 种`);
  return lines.join('\n');
}

export function handle(user: User, text: string): string {
  if (text === '1' || text === '抽卡') return pull(user);
  if (text === '2' || text === '我的卡') return myCards(user.openid);

  return panel(user);
}
