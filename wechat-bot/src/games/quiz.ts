import { addGold, pick, saveStateData, setState, type User } from '../session';
import { getStateData } from '../session';
import { IDIOMS, QUIZ_QUESTIONS } from './quiz-data';

const ROUND_SIZE = 10;
const LETTERS = ['A', 'B', 'C', 'D'];

type QuizSession = { mode: 'quiz'; queue: number[]; cursor: number; streak: number; earned: number };
type IdiomSession = { mode: 'idiom'; target: string; used: string[]; streak: number; earned: number };
type Session = QuizSession | IdiomSession | { mode: 'menu' } | null;

const MENU = '📚 答题中心\n1 知识问答　2 成语接龙';

export function start(user: User): string {
  setState(user.openid, 'quiz', { mode: 'menu' });
  return MENU;
}

// 「接龙」直达入口：跳过答题中心菜单直接开局
export function startIdiomGame(user: User): string {
  return startIdiom(user.openid);
}

// ===== 知识问答 =====
function startQuiz(openid: string): string {
  const queue: number[] = [];
  while (queue.length < ROUND_SIZE) {
    const idx = Math.floor(Math.random() * QUIZ_QUESTIONS.length);
    if (!queue.includes(idx)) queue.push(idx);
  }

  const session: QuizSession = { mode: 'quiz', queue, cursor: 0, streak: 0, earned: 0 };
  saveStateData(openid, session);

  return showQuestion(openid, session);
}

function showQuestion(openid: string, s: QuizSession): string {
  const q = QUIZ_QUESTIONS[s.queue[s.cursor]];

  saveStateData(openid, s);

  return [
    `📖 第 ${s.cursor + 1}/${ROUND_SIZE} 题（连胜 ${s.streak}）`,
    q.q,
    ...q.options.map((opt, i) => `${LETTERS[i]}. ${opt}`),
  ].join('\n');
}

// ===== 成语接龙 =====
function startIdiom(openid: string): string {
  const target = pick(IDIOMS);
  const s: IdiomSession = { mode: 'idiom', target, used: [target], streak: 0, earned: 0 };
  saveStateData(openid, s);

  return `⛓️ 成语接龙，我来开题：\n【${target}】\n请接一个以「${target[target.length - 1]}」开头的成语\n（提示：接上 +2 金币，回复「跳过」换题）`;
}

function idiomTurn(user: User, s: IdiomSession, text: string): string {
  if (text === '跳过') {
    return '🔁 换题！\n' + startIdiomKeepStreak(user.openid, s);
  }

  const lastChar = s.target[s.target.length - 1];

  if (text.length !== 4 || !/^[\u4e00-\u9fa5]{4}$/.test(text)) {
    return '要一个四字成语哦，再试试。\n（回复「跳过」换题）';
  }

  if (!IDIOMS.includes(text)) {
    return `词库里没有「${text}」，换一个试试。\n（我的词库有限，回复「跳过」换题）`;
  }

  if (s.used.includes(text)) {
    return `「${text}」这一轮已经用过啦，换一个。`;
  }

  if (text[0] !== lastChar) {
    return `要以「${lastChar}」开头哦，再接一个。`;
  }

  // 玩家接上了 → 机器人接
  s.used.push(text);
  s.streak += 1;
  s.earned += 2;
  addGold(user.openid, 2);

  const nextStart = text[text.length - 1];
  const candidates = IDIOMS.filter(i => i[0] === nextStart && !s.used.includes(i));

  if (!candidates.length) {
    saveStateData(user.openid, { mode: 'menu' });
    const bonus = addGold(user.openid, 5);
    return `「${nextStart}」……我接不上了，这局你赢！🎊\n连胜 ${s.streak}，本轮共赚 ${s.earned + 5} 金币。\n\n${MENU}`;
  }

  s.target = pick(candidates);
  s.used.push(s.target);
  saveStateData(user.openid, s);

  return `✅ 「${text}」接得漂亮（连胜 ${s.streak}，金币 +2）！\n我接：【${s.target}】\n请接「${s.target[s.target.length - 1]}」开头的成语`;
}

function startIdiomKeepStreak(openid: string, s: IdiomSession): string {
  const candidates = IDIOMS.filter(i => !s.used.includes(i));
  const target = candidates.length ? pick(candidates) : pick(IDIOMS);
  const fresh: IdiomSession = { mode: 'idiom', target, used: [...s.used, target], streak: 0, earned: s.earned };
  saveStateData(openid, fresh);

  return `【${target}】\n请接一个以「${target[target.length - 1]}」开头的成语`;
}

// ===== 入口 =====
export function handle(user: User, text: string): string {
  const s = getStateData<Session>(user);

  // 无会话或菜单态
  if (!s || s.mode === 'menu') {
    if (text === '1') return startQuiz(user.openid);
    if (text === '2') return startIdiom(user.openid);
    return MENU;
  }

  if (s.mode === 'quiz') {
    const letter = text.toUpperCase();
    const idx = LETTERS.indexOf(letter);

    if (idx < 0) {
      return showQuestion(user.openid, s) + '\n（回复 A/B/C/D 作答）';
    }

    const q = QUIZ_QUESTIONS[s.queue[s.cursor]];
    let head: string;

    if (idx === q.answer) {
      s.streak += 1;
      const gain = 5 + s.streak;
      s.earned += gain;
      addGold(user.openid, gain);
      head = `✅ 答对了！连胜 ${s.streak}，金币 +${gain}`;
    } else {
      s.streak = 0;
      head = `❌ 答错了，正确答案是 ${LETTERS[q.answer]}. ${q.options[q.answer]}`;
    }

    s.cursor += 1;

    if (s.cursor >= ROUND_SIZE) {
      saveStateData(user.openid, { mode: 'menu' });
      return `${head}\n🏁 本轮结束：共赚 ${s.earned} 金币。\n\n${MENU}`;
    }

    return head + '\n\n' + showQuestion(user.openid, s);
  }

  // idiom
  return idiomTurn(user, s, text);
}
