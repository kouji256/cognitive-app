// 流動性推論テスト(図形パターン): 3×3の図形の規則を見つけて、欠けた1つを4択で選ぶ
// 難易度は、規則で変化する属性(図形・個数・塗り・色)の数: 段階1=1つ → 段階2=2つ → 段階3=3つ
// 練習5問(正誤表示)→ 本番18問(各段階6問、段階の低い方から順に)。時間制限なし・各問に自信度。
import { el } from './ui.js';
import { s } from './svg.js';
import { generatePuzzle } from './gen_matrix.js';
import { AbortError, show, waitButton, askConfidence, askPre, saveResult, summaryTable, mean, fmt } from './testcommon.js';

export const ID = 'matrix_reasoning', VERSION = 1;
const PRACTICE_LEVELS = [1, 1, 2, 2, 3];
const PER_LEVEL = 6;

const ONE = [[45, 45]], TWO = [[28, 45], [62, 45]], THREE = [[45, 24], [27, 62], [63, 62]];
const POS = [ONE, TWO, THREE];

function shapeAt(kind, x, y, cls) {
  const r = 14;
  if (kind === 0) return s('circle', { cx: x, cy: y, r, class: cls });
  if (kind === 1) return s('rect', { x: x - r, y: y - r, width: 2 * r, height: 2 * r, class: cls });
  return s('polygon', { points: `${x},${y - r - 1} ${x + r + 2},${y + r} ${x - r - 2},${y + r}`, class: cls });
}

/** 1マス(属性の値 0〜2)を描く。cell=null なら「?」 */
export function drawCell(cell) {
  const svg = s('svg', { viewBox: '0 0 90 90', class: 'mcell', 'aria-hidden': 'true' });
  if (!cell) { svg.append(s('text', { x: 45, y: 58, class: 'mq', 'text-anchor': 'middle' }, '?')); return svg; }
  const cls = `mx c${cell.color} f${cell.fill}`;
  POS[cell.count].forEach(([x, y]) => svg.append(shapeAt(cell.shape, x, y, cls)));
  return svg;
}

export async function runMatrixTest(ctx) {
  const items = [], meta = { aborted: false, levels: [1, 2, 3], per_level: PER_LEVEL };
  let state = null, counter = 0;

  async function runTrial(level, practice, idx, total) {
    const pz = generatePuzzle(Math.random, level);
    const grid = el('div', { class: 'mgrid' });
    pz.grid.forEach((row, r) => row.forEach((cell, c) => grid.append(el('div', { class: 'mbox' }, drawCell(r === 2 && c === 2 ? null : cell)))));
    const t0 = { v: 0 };
    const chosen = await ctx.until(new Promise((resolve) => {
      const opts = el('div', { class: 'mopts' }, ...pz.options.map((o, i) => el('button', {
        type: 'button', class: 'opt mopt', 'aria-label': `選択肢${i + 1}`, onclick: () => resolve({ i, t: performance.now() }),
      }, drawCell(o))));
      show(ctx, el('div', { class: 'progress', text: `${practice ? '練習' : '本番'} ${idx}/${total}` }), grid,
        el('p', { class: 'lead', text: '欠けている「?」に入るのはどれ?' }), opts);
      t0.v = performance.now();
    }));
    const ok = chosen.i === pz.answerIndex;
    const item = {
      n: practice ? null : ++counter, practice, block_n: idx, level, cond: 'L' + level, varying: pz.varying.join('+'),
      pos: pz.answerIndex, chosen: chosen.i, ok, rt: Math.round(((chosen.t - t0.v) / 1000) * 100) / 100,
    };
    show(ctx, el('div', { class: 'progress', text: `${practice ? '練習' : '本番'} ${idx}/${total}` }));
    if (practice) {
      ctx.root.append(el('div', { class: ok ? 'fb ok' : 'fb ng', text: ok ? '正解' : `不正解 — 正解は ${pz.answerIndex + 1} 番目` }));
      await waitButton(ctx, '次へ');
    } else {
      item.conf = await askConfidence(ctx);
    }
    items.push(item);
  }

  try {
    state = await askPre(ctx, {
      title: '流動性推論(図形パターン)',
      desc: '3×3に並んだ図形には規則があります。右下の欠けた1つに入る図形を、4つから選びます。だんだん難しくなります。練習5問のあと本番18問(約12分)。',
      maxScore: 18, predictLabel: '予想: 本番18問のうち何問正解?',
    });
    show(ctx, el('h2', { text: '練習' }), el('p', { class: 'lead', text: '5問。正誤が表示されます。行と列、それぞれで何が変わっているかを探してください。' }));
    await waitButton(ctx, '練習をはじめる');
    for (let i = 0; i < PRACTICE_LEVELS.length; i++) await runTrial(PRACTICE_LEVELS[i], true, i + 1, PRACTICE_LEVELS.length);

    show(ctx, el('h2', { text: '本番' }), el('p', { class: 'lead', text: '18問。正誤は表示されません。だんだん難しくなります。各問のあと自信度を聞きます。' }));
    await waitButton(ctx, '本番をはじめる');
    const order = [1, 2, 3].flatMap((l) => Array(PER_LEVEL).fill(l));
    for (let i = 0; i < order.length; i++) await runTrial(order[i], false, i + 1, order.length);
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

  const rows = [['段階(変わる属性の数)', '正解', '平均秒(正解)']];
  [1, 2, 3].forEach((l) => {
    const g = scored.filter((x) => x.level === l), ok = g.filter((x) => x.ok);
    rows.push([l, `${ok.length}/${g.length}`, fmt(mean(ok.map((x) => x.rt)), 1)]);
  });
  show(ctx, el('h2', { text: '結果' }),
    el('p', { class: 'big', text: `${score} / ${scored.length} 問正解(予想 ${state.predicted})` }),
    summaryTable(rows),
    el('p', { class: 'hint', text: `眠気${state.sleepy} 疲れ${state.tired} で保存しました。` }));
}
