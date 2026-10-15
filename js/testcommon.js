// テスト共通部品: 開始前の状態入力、自信度、中断、結果の保存
//   開始前に 眠気・疲れ・予想スコア を入力 → 本番 → 保存(中断しても、ここまでの分を保存する)
import { el, clear, choice, scale5, field, numField, button, toast, sleep } from './ui.js';
import { addRecord } from './store.js';

export class AbortError extends Error {}

/** テスト1回分の実行状態。中断したとき、待機中の処理をすべて止める */
export function createCtx(root) {
  let aborted = false;
  const waiters = new Set();
  return {
    root,
    get aborted() { return aborted; },
    abort() { aborted = true; waiters.forEach((rej) => rej(new AbortError('aborted'))); waiters.clear(); },
    /** 待機中に中断されたら AbortError で抜ける */
    until(p) {
      if (aborted) return Promise.reject(new AbortError('aborted'));
      return new Promise((resolve, reject) => {
        waiters.add(reject);
        p.then((v) => { waiters.delete(reject); resolve(v); }, (e) => { waiters.delete(reject); reject(e); });
      });
    },
    sleep(ms) { return this.until(sleep(ms)); },
  };
}

/** 画面に要素を出し、ボタン等が解決する Promise を待つ */
export function show(ctx, ...nodes) { clear(ctx.root); ctx.root.append(...nodes); }

/** 「続ける」ボタンを出して待つ */
export function waitButton(ctx, label = '次へ', cls = 'primary') {
  return ctx.until(new Promise((resolve) => {
    ctx.root.append(button(label, () => resolve(), cls));
  }));
}

/** 自信度(高/中/低)を聞く。回答までの待機 */
export async function askConfidence(ctx, prompt = 'いまの答えの自信は?') {
  return ctx.until(new Promise((resolve) => {
    const row = el('div', { class: 'row3' });
    ['高', '中', '低'].forEach((c) => row.append(el('button', { type: 'button', class: 'opt big', text: c, onclick: () => resolve(c) })));
    ctx.root.append(el('div', { class: 'label', text: prompt }), row);
  }));
}

/** 開始前の状態入力。{sleepy, tired, predicted} を返す */
export function askPre(ctx, { title, desc, maxScore, predictLabel }) {
  return ctx.until(new Promise((resolve) => {
    const sleepy = scale5({}), tired = scale5({});
    const pred = numField({ min: 0, max: maxScore, placeholder: `0〜${maxScore}` });
    show(ctx,
      el('h2', { text: title }),
      el('p', { class: 'lead', text: desc }),
      field('いまの眠気', sleepy, '1=冴えている 5=ひどく眠い'),
      field('いまの疲れ', tired, '1=元気 5=ぐったり'),
      field(predictLabel, pred, 'やる前の直感でOK(後で実際と比べます)'),
      button('はじめる', () => {
        const p = pred.get();
        if (!sleepy.get() || !tired.get() || p === null || Number.isNaN(p)) { toast('眠気・疲れ・予想スコアを入力してください'); return; }
        resolve({ sleepy: sleepy.get(), tired: tired.get(), predicted: Math.round(p) });
      }));
  }));
}

/** 結果を保存して、要約を表示する */
export function saveResult({ testId, testVersion, items, meta, score, state }) {
  const rec = addRecord('test_results', {
    test_id: testId, test_version: testVersion,
    items_json: JSON.stringify({ meta, items }),
    score, predicted: state.predicted, sleepy: state.sleepy, tired: state.tired,
  });
  return rec;
}

export function summaryTable(rows) {
  const t = el('table', { class: 'sum' });
  rows.forEach((r) => t.append(el('tr', {}, ...r.map((c, i) => el(i === 0 ? 'th' : 'td', { text: String(c) })))));
  return t;
}

// ---------- 統計の小道具 ----------
export const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
export const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '-');

/** 最小二乗法の直線 y = a + b x。点が2未満、または x が全部同じなら null */
export function regress(pts) {
  if (pts.length < 2) return null;
  const mx = mean(pts.map((p) => p[0])), my = mean(pts.map((p) => p[1]));
  let sxx = 0, sxy = 0;
  pts.forEach(([x, y]) => { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); });
  if (sxx === 0) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}
