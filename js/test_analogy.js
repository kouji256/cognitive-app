// 言語の類推テスト: A : B = C : ? の4択。段階1→2→3の順に難しくなる(各8問、計24問)
// 練習5問(正誤表示)→ 本番24問。各問に自信度。出した問題は覚えておき、次回は未出題の問題を優先する。
import { el, shuffle } from './ui.js';
import { getPref, setPref } from './store.js';
import { PRACTICE, pickItems } from './analogy_bank.js';
import { AbortError, show, waitButton, askConfidence, askPre, saveResult, summaryTable, mean, fmt } from './testcommon.js';

export const ID = 'verbal_analogy', VERSION = 1;

export async function runAnalogyTest(ctx) {
  const items = [], meta = { aborted: false };
  let state = null, counter = 0;

  async function runTrial(q, practice, idx, total) {
    const opts = shuffle(q.options.map((t, i) => ({ t, i })));
    const t0 = { v: 0 };
    const picked = await ctx.until(new Promise((resolve) => {
      show(ctx, el('div', { class: 'progress', text: `${practice ? '練習' : '本番'} ${idx}/${total}` }),
        el('p', { class: 'analogy' }, `${q.a} : ${q.b} = ${q.c} : ？`),
        el('div', { class: 'opts' }, ...opts.map((o) => el('button', { type: 'button', class: 'opt choice-btn', text: o.t, onclick: () => resolve({ i: o.i, t: performance.now() }) }))));
      t0.v = performance.now();
    }));
    const ok = picked.i === q.answer;
    const item = { n: practice ? null : ++counter, practice, block_n: idx, level: q.level, cond: 'L' + q.level, id: q.id, chosen: picked.i, ok, rt: Math.round(((picked.t - t0.v) / 1000) * 100) / 100 };
    show(ctx, el('div', { class: 'progress', text: `${practice ? '練習' : '本番'} ${idx}/${total}` }));
    if (practice) {
      ctx.root.append(el('div', { class: ok ? 'fb ok' : 'fb ng', text: ok ? '正解' : `不正解 — 正しくは「${q.options[q.answer]}」` }));
      await waitButton(ctx, '次へ');
    } else {
      item.conf = await askConfidence(ctx);
      setPref('analogy_seen', [...new Set([...getPref('analogy_seen', []), q.id])]); // 答えた問題は次回後回しにする
    }
    items.push(item);
  }

  try {
    state = await askPre(ctx, {
      title: '言語の類推',
      desc: '「A : B = C : ？」の形で、AとBの関係を見抜き、同じ関係になるものを4つから選びます。だんだん難しくなります。練習5問のあと本番24問(約8分)。',
      maxScore: 24, predictLabel: '予想: 本番24問のうち何問正解?',
    });
    show(ctx, el('h2', { text: '練習' }), el('p', { class: 'lead', text: '5問。正誤が表示されます。AとBの関係を、まず言葉で言い表してから選ぶと間違えにくくなります。' }));
    await waitButton(ctx, '練習をはじめる');
    for (let i = 0; i < PRACTICE.length; i++) await runTrial(PRACTICE[i], true, i + 1, PRACTICE.length);

    const quiz = pickItems(Math.random, getPref('analogy_seen', []));
    show(ctx, el('h2', { text: '本番' }), el('p', { class: 'lead', text: `${quiz.length}問。正誤は表示されません。だんだん難しくなります。各問のあと自信度を聞きます。` }));
    await waitButton(ctx, '本番をはじめる');
    for (let i = 0; i < quiz.length; i++) await runTrial(quiz[i], false, i + 1, quiz.length);
  } catch (e) {
    if (!(e instanceof AbortError)) throw e;
    meta.aborted = true;
  }

  if (!state) return;
  const scored = items.filter((x) => !x.practice);
  if (!scored.length) return;
  const score = scored.filter((x) => x.ok).length;
  saveResult({ testId: ID, testVersion: VERSION, items, meta, score, state });
  if (meta.aborted) return;

  const rows = [['段階', '正解', '平均秒(正解)']];
  [1, 2, 3].forEach((l) => {
    const g = scored.filter((x) => x.level === l), ok = g.filter((x) => x.ok);
    rows.push([l, `${ok.length}/${g.length}`, fmt(mean(ok.map((x) => x.rt)), 1)]);
  });
  show(ctx, el('h2', { text: '結果' }),
    el('p', { class: 'big', text: `${score} / ${scored.length} 問正解(予想 ${state.predicted})` }),
    summaryTable(rows),
    el('p', { class: 'hint', text: `眠気${state.sleepy} 疲れ${state.tired} で保存しました。` }));
}
