import { db } from './db';
import { addGold, hintsShown, markHintsShown, type User } from './session';

// ===== 站点信息（与 www.glgxt.cn 联动）=====
export const SITE_NAME = '一同学习｜高哩观晓童';
export const SITE_URL = 'www.glgxt.cn';

// ===== 主菜单（紧凑版：只列功能，不带教学提示）=====
export function mainMenu(): string {
  return [
    '🎮 游戏大厅',
    '1 农场　2 修仙　3 宠物',
    '4 答题　5 图鉴　6 人生',
    '签到 · 帮助 · 注册',
  ].join('\n');
}

// 菜单入口：首次进入给完整欢迎页（操作提示只此一次），之后一律紧凑菜单
export function menuFor(openid: string): string {
  if (hintsShown(openid)) return mainMenu();
  markHintsShown(openid);

  return [
    `🌐 欢迎来到「${SITE_NAME}」`,
    `▶ ${SITE_URL}`,
    '',
    '🎮 游戏大厅（金币全站通用）',
    '1 农场　2 修仙　3 宠物',
    '4 答题　5 图鉴　6 人生',
    '更多：接龙 · 注册 · 签到 · 帮助',
    '────────',
    '📌 新手必读（仅此一次）：',
    '· 回复 序号 或 词语 都能操作',
    '· 任意界面回复 0 返回大厅',
    '· 回复「帮助」查看全部指令',
    '· 记得每天「签到」领金币',
  ].join('\n');
}

export function helpText(): string {
  return [
    '🤖 指令总览',
    '【大厅】回复序号或名称进游戏 · 0 返回大厅',
    '【农场】1 白萝卜 2 小麦 3 南瓜 · 4 收获',
    '【修仙】1 打坐 2 突破 3 历练',
    '【宠物】1 喂食 2 玩耍 3 打工 · 取名X',
    '【答题】1 知识问答 2 成语接龙（A/B/C/D 作答）',
    '【图鉴】1 抽卡 2 我的卡',
    '【人生】1 打工 2 升职 3 存款X 4 取款X',
    '【账号】注册 · 绑定 · 找回 · 我的邮箱',
    '【通用】签到 · 菜单 · 帮助（金币全站通用）',
  ].join('\n');
}

// ===== 签到（全游戏通用）=====
export function today(offsetDays = 0): string {
  return new Date(Date.now() + 8 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

export function signin(user: User): string {
  const t = today();

  if (user.signin_date === t) return '今天已经签到过啦，明天再来～';

  const streak = user.signin_date === today(-1) ? user.signin_streak + 1 : 1;
  const reward = 20 + Math.min(streak, 7) * 2;
  const gold = addGold(user.openid, reward);

  db.prepare('UPDATE users SET signin_date = ?, signin_streak = ? WHERE openid = ?').run(t, streak, user.openid);

  return `✅ 签到成功！连续 ${streak} 天，金币 +${reward}（当前 ${gold}）。`;
}
