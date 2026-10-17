// 图鉴卡池：4 套系 × 6 张 = 24 张
export type Rarity = 'N' | 'R' | 'SR' | 'SSR';

export type CardDef = {
  key: string;
  name: string;
  emoji: string;
  set: string;
  rarity: Rarity;
};

export const SETS = ['神兽', '灵植', '法器', '仙人'] as const;

export const CARDS: CardDef[] = [
  // 神兽
  { key: 'qilin',   name: '麒麟',   emoji: '🦄', set: '神兽', rarity: 'SSR' },
  { key: 'baize',   name: '白泽',   emoji: '🦁', set: '神兽', rarity: 'SSR' },
  { key: 'fenghuang', name: '凤凰', emoji: '🔥', set: '神兽', rarity: 'SR' },
  { key: 'xuangui', name: '玄龟',   emoji: '🐢', set: '神兽', rarity: 'R' },
  { key: 'linghu',  name: '灵狐',   emoji: '🦊', set: '神兽', rarity: 'R' },
  { key: 'yutu',    name: '玉兔',   emoji: '🐰', set: '神兽', rarity: 'N' },
  // 灵植
  { key: 'renshen', name: '千年人参', emoji: '🌱', set: '灵植', rarity: 'SR' },
  { key: 'xuelian', name: '天山雪莲', emoji: '❄️', set: '灵植', rarity: 'SR' },
  { key: 'lingzhi', name: '灵芝',   emoji: '🍄', set: '灵植', rarity: 'R' },
  { key: 'huolian', name: '火莲',   emoji: '🌷', set: '灵植', rarity: 'R' },
  { key: 'jiucai',  name: '灵韭菜', emoji: '🥬', set: '灵植', rarity: 'N' },
  { key: 'lingdao', name: '灵稻',   emoji: '🌾', set: '灵植', rarity: 'N' },
  // 法器
  { key: 'zhuxian', name: '诛仙剑', emoji: '⚔️', set: '法器', rarity: 'SSR' },
  { key: 'zijinhu', name: '紫金葫', emoji: '🍶', set: '法器', rarity: 'SR' },
  { key: 'bagua',   name: '八卦镜', emoji: '🪞', set: '法器', rarity: 'R' },
  { key: 'fuchen',  name: '拂尘',   emoji: '🪶', set: '法器', rarity: 'R' },
  { key: 'pushan',  name: '蒲扇',   emoji: '🪭', set: '法器', rarity: 'N' },
  { key: 'mujian',  name: '木剑',   emoji: '🗡️', set: '法器', rarity: 'N' },
  // 仙人
  { key: 'taishang', name: '太上老君', emoji: '🧙', set: '仙人', rarity: 'SSR' },
  { key: 'change',   name: '嫦娥',   emoji: '🌙', set: '仙人', rarity: 'SR' },
  { key: 'wukong',   name: '悟空',   emoji: '🐵', set: '仙人', rarity: 'SR' },
  { key: 'zhongkui', name: '钟馗',   emoji: '👹', set: '仙人', rarity: 'R' },
  { key: 'tudigong', name: '土地公', emoji: '🧓', set: '仙人', rarity: 'N' },
  { key: 'shusheng', name: '穷书生', emoji: '📚', set: '仙人', rarity: 'N' },
];

// 稀有度：抽取权重 / 重复卡回收价 / 显示星级
export const RARITY_WEIGHT: Record<Rarity, number> = { N: 50, R: 32, SR: 14, SSR: 4 };
export const RARITY_REFUND: Record<Rarity, number> = { N: 8, R: 20, SR: 60, SSR: 200 };
export const RARITY_STARS: Record<Rarity, string> = { N: '★', R: '★★', SR: '★★★', SSR: '★★★★' };

export const PULL_COST = 100;
export const SET_BONUS = 500;
