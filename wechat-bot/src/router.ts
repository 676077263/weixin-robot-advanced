import { ensureUser, setState, touch, type User } from './session';
import { helpText, menuFor, signin } from './lobby';
import * as farm from './games/farm';
import * as cultivate from './games/cultivate';
import * as pet from './games/pet';
import * as quiz from './games/quiz';
import * as cards from './games/cards';
import * as life from './games/life';
import * as register from './register';

/**
 * 游戏大厅路由：
 *   全局指令（签到/菜单/帮助/退出）→ 游戏入口词 → 当前游戏状态机 → 大厅数字导航 → AI 兜底
 * 订阅号无主动推送，每个游戏都是「时间即状态」的懒惰结算模型。
 */

type GameModule = {
  start: (user: User) => string;
  handle: (user: User, text: string) => string;
};

// 大厅菜单顺序（接龙通过答题中心进入，不占编号）
const HOME_NAV: Array<{ digit: string; word: string; mod: GameModule }> = [
  { digit: '1', word: '农场', mod: farm },
  { digit: '2', word: '修仙', mod: cultivate },
  { digit: '3', word: '宠物', mod: pet },
  { digit: '4', word: '答题', mod: quiz },
  { digit: '5', word: '图鉴', mod: cards },
  { digit: '6', word: '人生', mod: life },
];

// 游戏入口词 → 状态 key
const ENTRY_WORDS: Record<string, { state: string; start: (user: User) => string }> = {
  农场: { state: 'farm', start: u => farm.start(u) },
  修仙: { state: 'cultivate', start: u => cultivate.start(u) },
  宠物: { state: 'pet', start: u => pet.start(u) },
  答题: { state: 'quiz', start: u => quiz.start(u) },
  接龙: { state: 'idiom', start: u => quiz.startIdiomGame(u) },
  图鉴: { state: 'cards', start: u => cards.start(u) },
  人生: { state: 'life', start: u => life.start(u) },
  注册: { state: 'home', start: u => register.start(u) },
  绑定: { state: 'home', start: u => register.start(u) },
  绑定邮箱: { state: 'home', start: u => register.start(u) },
  找回: { state: 'home', start: u => register.start(u) },
  我的邮箱: { state: 'home', start: u => register.start(u) },
};

const STATE_HANDLERS: Record<string, GameModule> = {
  farm,
  cultivate,
  pet,
  quiz,
  idiom: quiz, // 接龙与答题共用 quiz 模块（内部按 state_data 区分）
  cards,
  life,
  register,
};

/**
 * AI 聊天接入点：返回 null 表示本轮不使用 AI。
 * 接入 LLM 时守住 5 秒红线：Promise.race 3.5 秒预算 + 超时兜底文案 + 失败熔断。
 */
async function aiReply(openid: string, text: string): Promise<string | null> {
  void openid;
  void text;
  return null;
}

export async function handleMessage(msg: Record<string, string>): Promise<string> {
  const openid = msg.FromUserName || '';
  const msgType = (msg.MsgType || '').toLowerCase();

  // 事件消息
  if (msgType === 'event') {
    if ((msg.Event || '').toLowerCase() === 'subscribe') {
      const fresh = ensureUser(openid);
      touch(openid);
      return menuFor(fresh.openid); // 关注欢迎页（含唯一一次操作提示）
    }
    return ' '; // 其余事件静默确认
  }

  if (msgType !== 'text') {
    return '收到！不过我暂时只认识文字消息～回复「菜单」看看怎么玩。';
  }

  const user = ensureUser(openid);
  touch(openid);
  const text = (msg.Content || '').trim();

  // ===== 全局指令（任意状态可用）=====
  if (text === '签到') return signin(user);

  // 0：任意位置返回大厅
  if (text === '0') {
    setState(openid, 'home');
    return menuFor(openid);
  }

  if (['菜单', '大厅', '游戏', '退出'].includes(text)) {
    setState(openid, 'home');
    return menuFor(openid);
  }

  if (text.toLowerCase() === 'help' || text === '帮助') {
    return helpText();
  }

  // ===== 游戏入口词（任意状态可切换）=====
  const entry = ENTRY_WORDS[text];
  if (entry) {
    setState(openid, entry.state);
    return entry.start(user);
  }

  // ===== 当前游戏状态机 =====
  if (user.state !== 'home' && STATE_HANDLERS[user.state]) {
    return STATE_HANDLERS[user.state].handle(user, text);
  }

  // ===== 大厅：数字导航 =====
  if (user.state === 'home') {
    const nav = HOME_NAV.find(n => n.digit === text);
    if (nav) {
      setState(openid, wordToState(nav.word));
      return nav.mod.start(user);
    }

    // AI 兜底（仅大厅）
    const ai = await aiReply(openid, text);
    if (ai !== null) return ai;

    return `收到：「${text}」\n（AI 聊天接入点，当前未接入模型）\n回复「菜单」进入游戏大厅。`;
  }

  return menuFor(openid);
}

function wordToState(word: string): string {
  return ENTRY_WORDS[word]?.state ?? 'home';
}
