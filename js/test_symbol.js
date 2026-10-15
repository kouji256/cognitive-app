// 処理速度テスト(記号照合): 2つの記号が「同じ」か「違う」かを、60秒でできるだけ多く判定する(×3ブロック)
// 練習6問(正誤表示つき・時間制限なし)のあと本番。自信度はブロックごと。
// 0.15秒未満の応答は、前の問題の押し残しとみなして無視する(同じ問題をそのまま続ける)。
import { el } from './ui.js';
import { s } from './svg.js';
import { nextBatch, makePair } from './gen_symbol.js';
import { AbortError, show, waitButton, askConfidence, askPre, saveResult, summaryTable, mean, fmt } from './testcommon.js';

export const ID = 'symbol_match', VERSION = 1, BLOCKS = 3, SECONDS = 60, MIN_RT = 0.15;

export function drawGlyph(g) {
  const shape = [
    s('circle', { cx: 40, cy: 40, r: 28, class: 'gl-line' }),
    s('rect', { x: 13, y: 13, width: 54, height: 54, class: 'gl-line' }),
    s('polygon', { points: '40,10 70,66 10,66', class: 'gl-line' }),
    s('polygon', { points: '40,8 72,40 40,72 8,40', class: 'gl-line' }),
  ][g.s];
  const [x, y] = [[40, 30], [52, 42], [40, 54], [28, 42]][g.p];
  const mark = [
    s('circle', { cx: x, cy: y, r: 4, class: 'gl-fill' }),
    s('rect', { x: x - 5, y: y - 2, width: 10, height: 4, class: 'gl-fill' }),
    s('circle', { cx: x, cy: y, r: 4, class: 'gl-line thin' }),
  ][g.m];
  return s('svg', { viewBox: '0 0 80 80', class: 'glyph', 'aria-hidden': 'true' }, shape, mark);
}

export async function runSymbolTest(ctx) {
  const items = [], meta = { aborted: false, blocks: [], seconds: SECONDS };
  let state = null, counter = 0;
  const area = el('div', { class: 'pairarea' });
  let respond = null; // 現在の問題の応答を受ける関数
  const answer = (same) => { if (respond) { const r = respond; respond = null; r({ same, t: performance.now() }); } };
  const btnSame = el('button', { type: 'button', class: 'opt big', text: '同じ', onclick: () => answer(true) });
  const btnDiff = el('button', { type: 'button', class: 'opt big', text: '違う', onclick: () => answer(false) });
  const keys = (e) => {
    if (e.repeat) return;
    if (e.key === 'f' || e.key === 'F' || e.key === 'ArrowLeft') answer(true);
    else if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowRight') answer(false);
  };
  const paint = (pair) => { area.textContent = ''; area.append(drawGlyph(pair.a), drawGlyph(pair.b)); };
  const stage = (label) => show(ctx, el('div', { class: 'progress', text: label }), area, el('div', { class: 'row2' }, btnSame, btnDiff),
    el('p', { class: 'hint', text: 'パソコン: F=同じ  J=違う' }));

  try {
    state = await askPre(ctx, {
      title: '処理速度(記号照合)',
      desc: '2つの記号が「同じ」か「違う」かを、できるだけ速く正確に答えます。違う場合は、1か所だけ違います。練習6問のあと、60秒×3ブロック(約5分)。',
      maxScore: 300, predictLabel: '予想: 3ブロック合計で何問正解?',
    });
    document.addEventListener('keydown', keys);

    // ---- 練習(時間制限なし・正誤表示) ----
    show(ctx, el('h2', { text: '練習' }), el('p', { class: 'lead', text: '6問。正誤が表示されます。速さより、まず間違えないことを。' }));
    await waitButton(ctx, '練習をはじめる');
    const pr = [true, false, false, true, false, true].map((same) => makePair(Math.random, same));
    for (let i = 0; i < pr.length; i++) {
      stage(`練習 ${i + 1}/${pr.length}`); paint(pr[i]);
      const r = await ctx.until(new Promise((res) => { respond = res; }));
      const ok = r.same === pr[i].same;
      items.push({ n: null, practice: true, block: 0, cond: pr[i].same ? 'same' : 'diff', ok });
      show(ctx, el('div', { class: ok ? 'fb ok' : 'fb ng', text: ok ? '正解' : `不正解 — 正しくは「${pr[i].same ? '同じ' : '違う'}」` }));
      await waitButton(ctx, '次へ');
    }

    // ---- 本番 ----
    let queue = [];
    for (let b = 1; b <= BLOCKS; b++) {
      show(ctx, el('h2', { text: `ブロック ${b}/${BLOCKS}` }), el('p', { class: 'lead', text: `${SECONDS}秒間、できるだけ速く正確に。ボタンを押すとすぐ次の問題が出ます。` }));
      await waitButton(ctx, 'スタート');
      stage(`ブロック ${b}/${BLOCKS}`);
      let timeUp = false;
      const timer = setTimeout(() => { timeUp = true; if (respond) { const r = respond; respond = null; r(null); } }, SECONDS * 1000);
      let correct = 0, errors = 0;
      try {
        while (!timeUp) {
          if (!queue.length) queue = nextBatch(Math.random);
          const pair = queue.shift();
          paint(pair);
          const t0 = performance.now();
          let r;
          for (;;) {
            r = await ctx.until(new Promise((res) => { respond = res; }));
            if (r === null || (r.t - t0) / 1000 >= MIN_RT) break; // 速すぎる応答は無視して、同じ問題を続ける
          }
          if (r === null) break; // 時間切れ(答える前の問題は数えない)
          const ok = r.same === pair.same;
          ok ? correct++ : errors++;
          items.push({ n: ++counter, block: b, cond: pair.same ? 'same' : 'diff', feat: pair.feat, ok, rt: Math.round(((r.t - t0) / 1000) * 1000) / 1000 });
          area.textContent = '';
          await ctx.sleep(100);
        }
      } finally { clearTimeout(timer); respond = null; }
      show(ctx, el('h2', { text: `ブロック ${b} 終了` }));
      const conf = await askConfidence(ctx, 'このブロックの正確さに自信は?');
      meta.blocks.push({ block: b, correct, errors, conf });
    }
  } catch (e) {
    if (!(e instanceof AbortError)) throw e;
    meta.aborted = true;
  } finally {
    document.removeEventListener('keydown', keys);
  }

  if (!state) return;
  const scored = items.filter((x) => !x.practice);
  if (!scored.length) return;
  const score = scored.filter((x) => x.ok).length;
  saveResult({ testId: ID, testVersion: VERSION, items, meta, score, state });
  if (meta.aborted) return;

  const rows = [['ブロック', '正解', '誤答', '平均秒(正解)']];
  meta.blocks.forEach((b) => {
    const ok = scored.filter((x) => x.block === b.block && x.ok);
    rows.push([b.block, b.correct, b.errors, fmt(mean(ok.map((x) => x.rt)), 2)]);
  });
  show(ctx, el('h2', { text: '結果' }),
    el('p', { class: 'big', text: `${score} 問正解 / 誤答 ${scored.length - score}(予想 ${state.predicted})` }),
    summaryTable(rows),
    el('p', { class: 'hint', text: `眠気${state.sleepy} 疲れ${state.tired} で保存しました。ブロックごとの伸びは、慣れの目安です。` }));
}
