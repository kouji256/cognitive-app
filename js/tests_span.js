// ワーキングメモリのテスト: 数字の順唱・逆唱 / 位置の逆順再生
// 共通の進行(練習5問 → 本番12問×条件、長さは前半・後半で各1回ずつ、条件の順番は毎回入れ替え)を1つのエンジンで動かし、
// 数字と位置の違いは「舞台(makeStage)」の差し替えだけにしてある。
import { el, shuffle, button, toast } from './ui.js';
import { getPref, setPref } from './store.js';
import { AbortError, show, waitButton, askConfidence, askPre, saveResult, summaryTable, fmt } from './testcommon.js';

const rand = (n) => Math.floor(Math.random() * n);
const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// ---------- 舞台: 数字 ----------
function digitStage(ctx) {
  const area = el('div', { class: 'stage' });
  const big = el('div', { class: 'bigdigit', 'aria-live': 'polite' });
  area.append(big);
  return {
    el: area,
    makeSeq(len, cond) {
      for (;;) {
        const s = [];
        for (let i = 0; i < len; i++) {
          let d; do { d = rand(10); } while (i > 0 && d === s[i - 1]);
          s.push(d);
        }
        if (cond === 'backward' && eq(s, s.slice().reverse())) continue; // 順と逆が同じ列は避ける
        return s;
      }
    },
    async present(seq) {
      await ctx.sleep(700);
      for (const d of seq) { big.textContent = String(d); await ctx.sleep(900); big.textContent = ''; await ctx.sleep(250); }
    },
    collect(len) {
      return ctx.until(new Promise((resolve) => {
        const t0 = performance.now();
        const typed = [];
        const disp = el('div', { class: 'typed', 'aria-live': 'polite' });
        const paint = () => { disp.textContent = typed.length ? typed.join(' ') : '(ここに表示)'; };
        paint();
        const pad = el('div', { class: 'keypad' });
        const key = (label, fn, cls = 'opt big') => pad.append(el('button', { type: 'button', class: cls, text: label, onclick: fn }));
        for (let d = 1; d <= 9; d++) key(String(d), () => { if (typed.length < len) { typed.push(d); paint(); } });
        key('消す', () => { typed.pop(); paint(); }, 'opt big alt');
        key('0', () => { if (typed.length < len) { typed.push(0); paint(); } });
        key('決定', () => {
          if (typed.length !== len) { toast(`${len}桁入力してください`); return; }
          resolve({ answer: typed.slice(), rt: (performance.now() - t0) / 1000 });
        }, 'opt big go');
        area.append(disp, pad);
      }));
    },
    clearInput() { while (area.children.length > 1) area.removeChild(area.lastChild); },
    fmtSeq: (s) => s.join(' '),
  };
}

// ---------- 舞台: 位置(3x3) ----------
function gridStage(ctx) {
  const area = el('div', { class: 'stage' });
  const grid = el('div', { class: 'grid3' });
  const cells = [];
  for (let i = 0; i < 9; i++) {
    const c = el('button', { type: 'button', class: 'cell', disabled: true, 'aria-label': `マス${i + 1}` });
    cells.push(c); grid.append(c);
  }
  area.append(grid);
  const reset = () => cells.forEach((c) => { c.classList.remove('lit', 'tapped'); c.textContent = ''; c.disabled = true; });
  return {
    el: area,
    makeSeq(len) { return shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, len); },
    async present(seq) {
      reset();
      await ctx.sleep(700);
      for (const i of seq) { cells[i].classList.add('lit'); await ctx.sleep(750); cells[i].classList.remove('lit'); await ctx.sleep(300); }
    },
    collect(len) {
      return ctx.until(new Promise((resolve) => {
        const t0 = performance.now();
        const tapped = [];
        const paint = () => cells.forEach((c, i) => {
          const k = tapped.indexOf(i);
          c.classList.toggle('tapped', k >= 0);
          c.textContent = k >= 0 ? String(k + 1) : '';
        });
        cells.forEach((c, i) => { c.disabled = false; c.onclick = () => { if (tapped.length < len && !tapped.includes(i)) { tapped.push(i); paint(); } }; });
        const bar = el('div', { class: 'row2' },
          button('1つ戻す', () => { tapped.pop(); paint(); }, 'alt'),
          button('決定', () => {
            if (tapped.length !== len) { toast(`${len}個タップしてください`); return; }
            cells.forEach((c) => { c.disabled = true; c.onclick = null; });
            resolve({ answer: tapped.slice(), rt: (performance.now() - t0) / 1000 });
          }, 'go'));
        area.append(bar);
      }));
    },
    clearInput() { while (area.children.length > 1) area.removeChild(area.lastChild); reset(); },
    fmtSeq: (s) => s.map((i) => `${Math.floor(i / 3) + 1}行${(i % 3) + 1}列`).join(' → '),
  };
}

// ---------- テスト定義 ----------
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const CONFIGS = {
  digit_span: {
    id: 'digit_span', version: 1, title: '数字の記憶(順唱・逆唱)', stage: digitStage,
    desc: '数字が1つずつ出ます。順唱は出た順に、逆唱は逆の順に入力します。練習5問のあと本番12問ずつ(約8分)。',
    conds: [
      { key: 'forward', label: '順唱', instr: '出た数字を、出た順に入力します。', lengths: range(3, 8), practice: [3, 3, 4, 3, 4], expected: (s) => s },
      { key: 'backward', label: '逆唱', instr: '出た数字を、逆の順(最後に出たものから)入力します。', lengths: range(2, 7), practice: [2, 2, 3, 2, 3], expected: (s) => s.slice().reverse() },
    ],
  },
  spatial_span_back: {
    id: 'spatial_span_back', version: 1, title: '位置の記憶(逆順)', stage: gridStage,
    desc: '3×3のマスが1つずつ光ります。光った位置を、逆の順(最後に光ったものから)タップします。練習5問のあと本番12問(約5分)。',
    conds: [
      { key: 'backward', label: '逆順', instr: '光ったマスを、逆の順(最後に光ったものから)タップします。', lengths: range(2, 7), practice: [2, 2, 3, 2, 3], expected: (s) => s.slice().reverse() },
    ],
  },
};
export const SPAN_TESTS = Object.keys(CONFIGS);
export const spanTitle = (id) => CONFIGS[id].title;

export async function runSpanTest(ctx, testId) {
  const cfg = CONFIGS[testId];
  const maxScore = cfg.conds.length * 12;
  const items = [];
  const meta = { order: [], aborted: false };
  let state = null;
  let counter = 0; // 本番の通し番号(練習効果を見るため)
  try {
    state = await askPre(ctx, { title: cfg.title, desc: cfg.desc, maxScore, predictLabel: `予想: 本番${maxScore}問のうち何問正解?` });

    // 条件の順番: 前回と逆から始める(2条件のとき)。最初の回はランダム
    let conds = cfg.conds.slice();
    if (conds.length > 1) {
      const last = getPref('order_' + testId, null);
      const firstKey = last === null ? conds[rand(2)].key : (last === conds[0].key ? conds[1].key : conds[0].key);
      if (conds[0].key !== firstKey) conds.reverse();
      setPref('order_' + testId, firstKey);
    }
    meta.order = conds.map((c) => c.key);

    const stage = cfg.stage(ctx);
    for (const cond of conds) {
      show(ctx, el('h2', { text: cond.label }), el('p', { class: 'lead', text: cond.instr }), el('p', { class: 'hint', text: 'まず練習5問。正誤が表示されます。' }));
      await waitButton(ctx, '練習をはじめる');

      const runTrial = async (len, practice, idx, total) => {
        show(ctx, el('div', { class: 'progress', text: `${cond.label} ・ ${practice ? '練習' : '本番'} ${idx}/${total}` }), stage.el);
        stage.clearInput();
        const seq = stage.makeSeq(len, cond.key);
        await stage.present(seq);
        const { answer, rt } = await stage.collect(len);
        stage.clearInput();
        const want = cond.expected(seq);
        const ok = eq(answer, want);
        const item = { n: practice ? null : ++counter, practice, block_n: idx, cond: cond.key, len, seq, answer, ok, rt: Math.round(rt * 100) / 100 };
        if (practice) {
          ctx.root.append(el('div', { class: ok ? 'fb ok' : 'fb ng', text: ok ? '正解' : '不正解 — 正しくは ' + stage.fmtSeq(want) }));
          await waitButton(ctx, '次へ');
        } else {
          item.conf = await askConfidence(ctx);
        }
        items.push(item);
      };

      for (let i = 0; i < cond.practice.length; i++) await runTrial(cond.practice[i], true, i + 1, cond.practice.length);

      show(ctx, el('h2', { text: `${cond.label} 本番` }), el('p', { class: 'lead', text: 'ここからは正誤は表示されません。各問のあと自信度を聞きます。' }));
      await waitButton(ctx, '本番をはじめる');
      const order = shuffle(cond.lengths).concat(shuffle(cond.lengths)); // 前半・後半に各長さを1回ずつ
      for (let i = 0; i < order.length; i++) await runTrial(order[i], false, i + 1, order.length);
    }
  } catch (e) {
    if (!(e instanceof AbortError)) throw e;
    meta.aborted = true;
  }

  if (!state) return; // 開始前の中断: 記録なし
  const scored = items.filter((x) => !x.practice);
  if (!scored.length) return;
  const score = scored.filter((x) => x.ok).length;
  saveResult({ testId: cfg.id, testVersion: cfg.version, items, meta, score, state });
  if (meta.aborted) return; // 画面は既に切り替わっている

  const rows = [['条件', '正解', '最長スパン']];
  cfg.conds.forEach((c) => {
    const s = scored.filter((x) => x.cond === c.key);
    const okLens = s.filter((x) => x.ok).map((x) => x.len);
    rows.push([c.label, `${s.filter((x) => x.ok).length}/${s.length}`, okLens.length ? Math.max(...okLens) : '-']);
  });
  const rts = scored.filter((x) => x.ok).map((x) => x.rt);
  show(ctx,
    el('h2', { text: '結果' }),
    el('p', { class: 'big', text: `${score} / ${maxScore} 問正解(予想 ${state.predicted})` }),
    summaryTable(rows),
    el('p', { class: 'hint', text: `正解した問題の入力時間 平均 ${fmt(rts.reduce((a, b) => a + b, 0) / (rts.length || 1), 1)} 秒 ・ 眠気${state.sleepy} 疲れ${state.tired} で保存しました。` }));
}
