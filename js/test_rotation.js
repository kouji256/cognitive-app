// 3D心的回転テスト: 立方体をつないだ図形のペアが「同じ形(回しただけ)」か「鏡像」かを答える
// 角度 0/40/80/120/160 × 同じ/鏡像 を、10問ずつのブロックに各1回入れてシャッフル(途中でやめても偏らない)
import { el, button, shuffle } from './ui.js';
import { buildTrial, visibleFaces, project } from './geom.js';
import { AbortError, show, waitButton, askConfidence, askPre, saveResult, summaryTable, mean, fmt, regress } from './testcommon.js';

const ID = 'mental_rotation_3d', VERSION = 1;
const ANGLES = [0, 40, 80, 120, 160];
const PRACTICE = [[40, 'same'], [120, 'mirror'], [80, 'mirror'], [0, 'same'], [160, 'same']];
const LIGHT = (() => { const v = [0.4, 0.7, 0.6]; const l = Math.hypot(...v); return v.map((x) => x / l); })();

function draw(canvas, fig) {
  const dpr = window.devicePixelRatio || 1;
  const css = canvas.clientWidth || 160;
  canvas.width = canvas.height = Math.round(css * dpr);
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, css, css);
  const R = Math.max(...fig.cells.map((c) => Math.hypot(c[0], c[1], c[2])));
  const scale = (css * 0.42) / (R + 0.9);
  g.lineJoin = 'round';
  for (const f of visibleFaces(fig.cells, fig.M)) {
    const pts = f.corners.map((p) => project(p, css / 2, css / 2, scale));
    const lum = Math.max(0, f.normal[0] * LIGHT[0] + f.normal[1] * LIGHT[1] + f.normal[2] * LIGHT[2]);
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fillStyle = `hsl(212 62% ${32 + 40 * lum}%)`;
    g.fill();
    g.strokeStyle = '#06182c';
    g.lineWidth = 1.4;
    g.stroke();
  }
}

export async function runRotationTest(ctx) {
  const items = [];
  const meta = { aborted: false };
  let state = null, counter = 0;
  try {
    state = await askPre(ctx, {
      title: '3D心的回転', maxScore: 20, predictLabel: '予想: 本番20問のうち何問正解?',
      desc: '立体が2つ並びます。右が「左を回しただけ(同じ形)」か「左を鏡に映した形(鏡像)」かを答えます。練習5問のあと本番20問(約6分)。',
    });

    const runTrial = async (angle, type, practice, idx, total) => {
      const trial = buildTrial(Math.random, angle, type);
      const cl = el('canvas', { class: 'fig', 'aria-label': '左の図形' }), cr = el('canvas', { class: 'fig', 'aria-label': '右の図形' });
      const answer = await ctx.until(new Promise((resolve) => {
        show(ctx,
          el('div', { class: 'progress', text: `${practice ? '練習' : '本番'} ${idx}/${total}` }),
          el('div', { class: 'figs' }, cl, cr),
          el('p', { class: 'lead', text: '右は、左を回しただけ? それとも鏡に映した形?' }),
          el('div', { class: 'row2' },
            el('button', { type: 'button', class: 'opt big', text: '同じ形', onclick: () => resolve(['same', performance.now()]) }),
            el('button', { type: 'button', class: 'opt big', text: '鏡像', onclick: () => resolve(['mirror', performance.now()]) })));
        draw(cl, trial.left); draw(cr, trial.right);
        trial.t0 = performance.now();
      }));
      const ok = answer[0] === type;
      const item = {
        n: practice ? null : ++counter, practice, block_n: idx, cond: type, angle,
        axis: trial.axis.map((v) => Math.round(v * 1000) / 1000), answer: answer[0], ok,
        rt: Math.round(((answer[1] - trial.t0) / 1000) * 100) / 100,
      };
      show(ctx, el('div', { class: 'progress', text: `${practice ? '練習' : '本番'} ${idx}/${total}` }));
      if (practice) {
        ctx.root.append(el('div', { class: ok ? 'fb ok' : 'fb ng', text: ok ? '正解' : `不正解 — 正しくは「${type === 'same' ? '同じ形' : '鏡像'}」` }));
        await waitButton(ctx, '次へ');
      } else {
        item.conf = await askConfidence(ctx);
      }
      items.push(item);
    };

    show(ctx, el('h2', { text: '練習' }), el('p', { class: 'lead', text: '5問。正誤が表示されます。頭の中で回して重ねてみてください。' }));
    await waitButton(ctx, '練習をはじめる');
    for (let i = 0; i < PRACTICE.length; i++) await runTrial(PRACTICE[i][0], PRACTICE[i][1], true, i + 1, PRACTICE.length);

    show(ctx, el('h2', { text: '本番' }), el('p', { class: 'lead', text: 'ここからは正誤は表示されません。各問のあと自信度を聞きます。' }));
    await waitButton(ctx, '本番をはじめる');
    const combos = ANGLES.flatMap((a) => ['same', 'mirror'].map((t) => [a, t]));
    const order = shuffle(combos).concat(shuffle(combos));
    for (let i = 0; i < order.length; i++) await runTrial(order[i][0], order[i][1], false, i + 1, order.length);
  } catch (e) {
    if (!(e instanceof AbortError)) throw e;
    meta.aborted = true;
  }

  if (!state) return;
  const scored = items.filter((x) => !x.practice);
  if (!scored.length) return;
  const score = scored.filter((x) => x.ok).length;
  const okTrials = scored.filter((x) => x.ok);
  const fit = regress(okTrials.map((x) => [x.angle, x.rt]));
  meta.slope_s_per_deg = fit ? Math.round(fit.b * 100000) / 100000 : null;
  meta.intercept_s = fit ? Math.round(fit.a * 100) / 100 : null;
  saveResult({ testId: ID, testVersion: VERSION, items, meta, score, state });
  if (meta.aborted) return;

  const rows = [['角度', '正解', '平均秒(正解のみ)']];
  ANGLES.forEach((a) => {
    const s = scored.filter((x) => x.angle === a), o = s.filter((x) => x.ok);
    rows.push([`${a}°`, `${o.length}/${s.length}`, fmt(mean(o.map((x) => x.rt)), 1)]);
  });
  const by = (t) => { const s = scored.filter((x) => x.cond === t); return `${s.filter((x) => x.ok).length}/${s.length}`; };
  show(ctx,
    el('h2', { text: '結果' }),
    el('p', { class: 'big', text: `${score} / ${scored.length} 問正解(予想 ${state.predicted})` }),
    el('p', { class: 'hint', text: `同じ形 ${by('same')} ・ 鏡像 ${by('mirror')}` }),
    summaryTable(rows),
    el('p', { class: 'hint', text: fit ? `角度が1°増えるごとに +${fmt(fit.b * 1000, 1)} ミリ秒(傾き)。傾きが正なら「回して比べている」しるし。` : '傾きは計算できませんでした(正解が少ない)。' }),
    el('p', { class: 'hint', text: `眠気${state.sleepy} 疲れ${state.tired} で保存しました。` }));
}
