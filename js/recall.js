// 再生チェック: 理解ログの3日後・7日後に「何も見ずに再生できるか」を聞く。
// 答えること自体が想起練習になる(見ずに思い出した回数で定着が決まる特性のため)
import { el, clear, toast } from './ui.js';
import { dueExplain } from './explain.js';
import { topicById, formatLabel } from './explain_content.js';
import { addRecord, recallData, pullForRecall, isConfigured } from './store.js';

const DAY = 86400000;
const INTERVALS = [3, 7];
const GIVE_UP_DAYS = 21; // これより古いものは出さない(溜まって負担になるのを防ぐ)

const RESULTS = [
  { v: 'できる', label: 'できる', hint: '最初から最後まで' },
  { v: '途中まで', label: '途中まで', hint: '一部は出てこない' },
  { v: 'できない', label: 'できない', hint: 'ほぼ出てこない' },
];

/** 今出すべきチェック一覧。1つの題材につき、期限が来た中で一番新しい間隔だけを出す */
export function dueChecks(now = Date.now()) {
  const { entries, checks } = recallData();
  const out = [];
  for (const e of entries) {
    const t = Date.parse(e.ts);
    if (!Number.isFinite(t)) continue;
    const age = (now - t) / DAY;
    if (age > GIVE_UP_DAYS) continue;
    const dueIntervals = INTERVALS.filter((d) => age >= d);
    if (!dueIntervals.length) continue;
    const d = Math.max(...dueIntervals);
    if (checks.has(e.uid + '|' + d)) continue;
    // 7日が期限切れでも、3日分を未回答なら 7日だけ聞く(古い方を後追いしても想起間隔の意味が薄いため)
    out.push({ uid: e.uid, topic: e.topic, genre: e.genre, ts: e.ts, due_days: d, age: Math.floor(age) });
  }
  return out.sort((a, b) => b.age - a.age);
}

export const dueCount = () => dueChecks().length + dueExplain().length;

export async function recallView(root, onChange, startDelayed) {
  clear(root);
  root.append(el('h2', { text: '再生チェック' }));
  const list = el('div', { class: 'list' });
  const exp = el('div', { class: 'list' });
  root.append(
    el('p', { class: 'lead', text: '題材の名前だけ見て、何も見ずに頭の中で最初から順にたどってみる。そのあとで自己評価を押します。' }),
    list, exp);

  const paintExplain = () => {
    clear(exp);
    const items = dueExplain();
    if (!items.length) return;
    exp.append(el('h2', { text: '説明テストの再テスト' }));
    items.forEach((d) => {
      const t = topicById(d.topic);
      exp.append(el('div', { class: 'card' },
        el('div', { class: 'card-title', text: t ? t.title : d.topic }),
        el('div', { class: 'card-sub', text: `${formatLabel(d.format)}で読んだ ・ ${d.age}日前 ・ ${d.due_days}日後の再テスト(4問)` }),
        el('button', { type: 'button', class: 'btn primary', text: '再テストをはじめる', onclick: () => startDelayed && startDelayed(d) })));
    });
  };
  paintExplain();

  const paint = () => {
    clear(list);
    const items = dueChecks();
    if (!items.length) { list.append(el('div', { class: 'empty', text: '今日の再生チェックはありません' })); return; }
    items.forEach((it) => {
      const card = el('div', { class: 'card' },
        el('div', { class: 'card-title', text: it.topic || '(題材なし)' }),
        el('div', { class: 'card-sub', text: `${it.genre || ''} ・ ${it.age}日前に学習 ・ ${it.due_days}日後チェック` }));
      const row = el('div', { class: 'row3' });
      RESULTS.forEach((r) => row.append(el('button', {
        type: 'button', class: 'opt big', text: r.label,
        onclick: () => {
          addRecord('recall_checks', { target_uid: it.uid, due_days: it.due_days, result: r.v });
          toast('記録した');
          paint();
          if (onChange) onChange();
        },
      })));
      card.append(row);
      list.append(card);
    });
  };
  paint();

  if (isConfigured()) { // 別の端末で入力した分も反映する
    const ok = await pullForRecall();
    if (ok) { paint(); if (onChange) onChange(); }
  }
}
