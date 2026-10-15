// 説明理解テスト
//   1回 = 題材3つ。同じ内容を「式・図・文章」のどれかで読み(各形式を1題ずつ、割り当てはランダム)、
//   説明を見ずに4問に答える。3日後・7日後に同じ4問をもう一度出し、覚えているかを測る。
//   正解は表示しない(再テストの結果が、答えを見たせいで良くなるのを防ぐため)。
import { el, shuffle, button, field, scale5, toast } from './ui.js';
import { getPref, setPref } from './store.js';
import { TOPICS, FORMATS, formatLabel, renderVersion, topicById } from './explain_content.js';
import { AbortError, show, waitButton, askConfidence, askPre, saveResult, summaryTable, fmt } from './testcommon.js';

export const EXPLAIN_ID = 'explain_compare', DELAYED_ID = 'explain_delayed', VERSION = 1;
const DAY = 86400000, INTERVALS = [3, 7], GIVE_UP_DAYS = 21;

// ---------- 再テストの予定(この端末に保存) ----------
const pending = () => getPref('explain_pending', []);
export function dueExplain(now = Date.now()) {
  const out = [];
  for (const p of pending()) {
    const age = (now - Date.parse(p.ts)) / DAY;
    if (!Number.isFinite(age) || age > GIVE_UP_DAYS) continue;
    const due = INTERVALS.filter((d) => age >= d && !(p.done || []).includes(d));
    if (!due.length) continue;
    out.push({ key: p.key, uid: p.uid, topic: p.topic, format: p.format, ts: p.ts, due_days: Math.max(...due), age: Math.floor(age) });
  }
  return out.sort((a, b) => b.age - a.age);
}
function markDone(key, days) {
  const list = pending();
  const p = list.find((x) => x.key === key); // key = テスト記録のuid + 題材(1回のテストに題材が3つあるため)
  if (p) { p.done = [...(p.done || []), days]; setPref('explain_pending', list); }
}

// ---------- 4問のクイズ(説明は見せない) ----------
async function quiz(ctx, topic, label, counterRef, items, extra) {
  const results = [];
  for (let qi = 0; qi < topic.questions.length; qi++) {
    const q = topic.questions[qi];
    const opts = shuffle(q.options.map((t, i) => ({ t, i })));
    const t0 = { v: 0 };
    const picked = await ctx.until(new Promise((resolve) => {
      show(ctx,
        el('div', { class: 'progress', text: `${label} ・ 問 ${qi + 1}/${topic.questions.length}` }),
        el('p', { class: 'qtext', text: q.q }),
        el('div', { class: 'opts' }, ...opts.map((o) => el('button', { type: 'button', class: 'opt choice-btn', text: o.t, onclick: () => resolve({ i: o.i, rt: (performance.now() - t0.v) / 1000 }) }))));
      t0.v = performance.now();
    }));
    show(ctx, el('div', { class: 'progress', text: `${label} ・ 問 ${qi + 1}/${topic.questions.length}` }));
    const conf = await askConfidence(ctx);
    const item = Object.assign({
      n: ++counterRef.n, topic: topic.id, qi, kind: q.kind, chosen: picked.i, ok: picked.i === q.answer,
      rt: Math.round(picked.rt * 100) / 100, conf,
    }, extra);
    items.push(item);
    results.push(item);
  }
  return results;
}

// ---------- 本番: 題材3つ ----------
export async function runExplainCompare(ctx) {
  const items = [], meta = { aborted: false, topics: [] };
  const counter = { n: 0 };
  let state = null, saved = null;
  const complete = []; // 4問まで終えた題材
  try {
    state = await askPre(ctx, {
      title: '説明を読んで理解するテスト',
      desc: '題材を3つ、それぞれ式・図・文章のどれかで説明します。読んだあと、説明を見ずに4問に答えます(計12問、約15分)。3日後と7日後に同じ問題をもう一度出します。',
      maxScore: 12, predictLabel: '予想: 12問のうち何問正解?',
    });
    const used = getPref('explain_used', []);
    const fresh = TOPICS.filter((t) => !used.includes(t.id));
    if (fresh.length < 3) {
      show(ctx, el('h2', { text: '題材を使い切りました' }),
        el('p', { class: 'lead', text: `未使用の題材が${fresh.length}個しかありません(1回に3つ必要)。同じ題材をもう一度読むと、初見のデータではなくなるため、ここで止めます。新しい題材を追加してもらってください。` }));
      state = null;
      return;
    }
    const chosen = shuffle(fresh).slice(0, 3);
    const fmts = shuffle(FORMATS.map((f) => f.key)); // 各形式を1題ずつ(割り当てはランダム)
    for (let pos = 0; pos < 3; pos++) {
      const topic = chosen[pos], format = fmts[pos];
      // 読む前に既知度を聞く(知っていた題材は、形式の比較から外して分析するため)
      const known = await ctx.until(new Promise((resolve) => {
        const sc = scale5({});
        show(ctx, el('div', { class: 'progress', text: `題材 ${pos + 1}/3` }), el('h2', { text: topic.title }), el('p', { class: 'goal', text: 'ゴール: ' + topic.goal }),
          field('この題材を、読む前にどれくらい知っていた?', sc, '1=初めて聞く 3=聞いたことはある 5=人に教えられる'),
          el('p', { class: 'hint', text: `この題材は「${formatLabel(format)}」で説明されます。読み終えたら、説明は見えなくなります。` }),
          button('説明を読む', () => { if (!sc.get()) { toast('1〜5を選んでください'); return; } resolve(sc.get()); }));
      }));
      const t0 = performance.now();
      const readEnd = await ctx.until(new Promise((resolve) => {
        show(ctx, el('div', { class: 'progress', text: `${topic.title} ・ 説明(${formatLabel(format)})` }), renderVersion(topic, format),
          button('読み終えた', () => resolve(performance.now()), 'primary'));
      }));
      used.push(topic.id); setPref('explain_used', used); // 読んだ時点で「使用済み」(中断しても初見ではなくなる)
      const readSec = Math.round(((readEnd - t0) / 1000) * 10) / 10;

      const felt = await ctx.until(new Promise((resolve) => {
        const sc = scale5({});
        show(ctx, el('h2', { text: '理解できた感じは?' }), field('いまの「分かった」感', sc, '1=ほぼ分からない 5=人に説明できる'),
          button('次へ(問題)', () => { if (!sc.get()) { toast('1〜5を選んでください'); return; } resolve(sc.get()); }));
      }));
      const tmeta = { topic: topic.id, format, pos: pos + 1, known, read_sec: readSec, felt };
      meta.topics.push(tmeta);

      const res = await quiz(ctx, topic, `${topic.title}(${formatLabel(format)})`, counter, items, { cond: format, pos: pos + 1 });
      tmeta.correct = res.filter((r) => r.ok).length;
      complete.push({ topic: topic.id, format });
    }
  } catch (e) {
    if (!(e instanceof AbortError)) throw e;
    meta.aborted = true;
  }
  if (!state || !items.length) return;
  const score = items.filter((x) => x.ok).length;
  saved = saveResult({ testId: EXPLAIN_ID, testVersion: VERSION, items, meta, score, state });
  if (complete.length) { // 4問まで終えた題材だけ、3日後・7日後の再テストを予約する
    const list = pending();
    complete.forEach((c) => list.push({ key: saved.uid + '|' + c.topic, uid: saved.uid, topic: c.topic, format: c.format, ts: saved.ts, done: [] }));
    setPref('explain_pending', list);
  }
  if (meta.aborted) return;

  const rows = [['形式', '題材', '既知度', '読んだ秒', '分かった感', '正解']];
  meta.topics.forEach((t) => rows.push([formatLabel(t.format), topicById(t.topic).title, t.known, fmt(t.read_sec, 0), t.felt, `${t.correct}/4`]));
  show(ctx, el('h2', { text: '結果' }),
    el('p', { class: 'big', text: `${score} / 12 問正解(予想 ${state.predicted})` }),
    summaryTable(rows),
    el('p', { class: 'hint', text: '正解の内容は表示しません(3日後・7日後の再テストを、答えを見ていない状態で測るため)。再テストは「再生」タブに出ます。' }),
    el('p', { class: 'hint', text: `眠気${state.sleepy} 疲れ${state.tired} で保存しました。` }));
}

// ---------- 再テスト(3日後・7日後) ----------
export async function runExplainDelayed(ctx, due) {
  const topic = topicById(due.topic);
  if (!topic) return;
  const items = [], counter = { n: 0 }, meta = { aborted: false, target_uid: due.uid, topic: due.topic, format: due.format, due_days: due.due_days, age_days: due.age };
  let state = null;
  try {
    state = await askPre(ctx, {
      title: `再テスト: ${topic.title}`,
      desc: `${due.age}日前に「${formatLabel(due.format)}」で読んだ題材です。説明は出ません。覚えている範囲で答えてください(4問)。`,
      maxScore: 4, predictLabel: '予想: 4問のうち何問正解?',
    });
    await quiz(ctx, topic, `再テスト ${topic.title}`, counter, items, { cond: due.format });
  } catch (e) {
    if (!(e instanceof AbortError)) throw e;
    meta.aborted = true;
  }
  if (!state || !items.length) return;
  const score = items.filter((x) => x.ok).length;
  saveResult({ testId: DELAYED_ID, testVersion: VERSION, items, meta, score, state });
  if (meta.aborted) return;
  markDone(due.key, due.due_days); // 全問終えたときだけ「済み」にする
  show(ctx, el('h2', { text: '再テスト完了' }), el('p', { class: 'big', text: `${score} / 4 問正解(予想 ${state.predicted})` }),
    el('p', { class: 'hint', text: '記録しました。' }));
}
