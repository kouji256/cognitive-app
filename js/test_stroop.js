// 注意・抑制テスト(ストループ): 文字の「色」を答える(文字の意味は無視する)
// 一致(赤を赤で)・不一致(赤を青で)・中立(■■■)を混ぜて出す。不一致で遅くなる・間違える分が「抑制の負担」。
// 練習6問(正誤表示)→ 本番24問×2ブロック(各条件8問)。自信度はブロックごと。
import { el } from './ui.js';
import { makeTrials, makePractice, COLORS, CONDS } from './gen_stroop.js';
import { AbortError, show, waitButton, askConfidence, askPre, saveResult, summaryTable, mean, fmt } from './testcommon.js';

export const ID = 'stroop', VERSION = 1, BLOCKS = 2, PER_COND_PER_BLOCK = 8;
const COND_LABEL = { congruent: '一致', incongruent: '不一致', neutral: '中立' };

export async function runStroopTest(ctx) {
  const items = [], meta = { aborted: false, blocks: [] };
  let state = null, counter = 0;

  const stim = el('div', { class: 'stroop-stim', 'aria-live': 'off' });
  let respond = null;
  const btns = COLORS.map((c) => el('button', {
    type: 'button', class: `stroop-btn ink-${c.key}`, 'aria-label': c.name, disabled: true,
    onclick: () => { if (respond) { const r = respond; respond = null; r({ key: c.key, t: performance.now() }); } },
  }));
  const pad = el('div', { class: 'stroop-pad' }, ...btns);
  const setEnabled = (on) => btns.forEach((b) => { b.disabled = !on; });
  const stage = (label) => show(ctx, el('div', { class: 'progress', text: label }), stim, pad);

  // 1問: 注視点 → 刺激 → 応答。応答までの時間(秒)を返す
  async function oneTrial(t) {
    stim.className = 'stroop-stim';
    stim.textContent = '+';
    setEnabled(false);
    await ctx.sleep(500);
    stim.textContent = t.word;
    stim.className = `stroop-stim ink-${t.ink}`;
    const t0 = performance.now();
    setEnabled(true);
    const r = await ctx.until(new Promise((res) => { respond = res; }));
    setEnabled(false);
    stim.textContent = '';
    return { resp: r.key, rt: Math.round(((r.t - t0) / 1000) * 1000) / 1000 };
  }

  try {
    state = await askPre(ctx, {
      title: '注意・抑制(ストループ)',
      desc: '文字が表示されます。文字の意味ではなく、「文字の色」と同じ色のボタンを押します(例: 赤い文字で「青」と出たら、赤いボタン)。練習6問のあと、24問×2ブロック(約4分)。',
      maxScore: 48, predictLabel: '予想: 本番48問のうち何問正解?',
    });

    show(ctx, el('h2', { text: '練習' }), el('p', { class: 'lead', text: '6問。正誤が表示されます。文字の意味は無視して、色だけを答えてください。' }));
    await waitButton(ctx, '練習をはじめる');
    const practice = makePractice(Math.random);
    for (let i = 0; i < practice.length; i++) {
      stage(`練習 ${i + 1}/${practice.length}`);
      const t = practice[i];
      const r = await oneTrial(t);
      const ok = r.resp === t.ink;
      items.push({ n: null, practice: true, block: 0, cond: t.cond, word: t.word, ink: t.ink, resp: r.resp, ok, rt: r.rt });
      show(ctx, el('div', { class: ok ? 'fb ok' : 'fb ng', text: ok ? '正解' : `不正解 — 正しくは「${COLORS.find((c) => c.key === t.ink).name}」の色` }));
      await waitButton(ctx, '次へ');
    }

    for (let b = 1; b <= BLOCKS; b++) {
      show(ctx, el('h2', { text: `ブロック ${b}/${BLOCKS}` }), el('p', { class: 'lead', text: '24問。正誤は表示されません。速く、でも間違えないように。' }));
      await waitButton(ctx, 'スタート');
      const trials = makeTrials(Math.random, PER_COND_PER_BLOCK); // ブロックごとに各条件8問・色も均等
      stage(`ブロック ${b}/${BLOCKS}`);
      let correct = 0;
      for (let i = 0; i < trials.length; i++) {
        const t = trials[i];
        const r = await oneTrial(t);
        const ok = r.resp === t.ink;
        if (ok) correct++;
        items.push({ n: ++counter, block: b, cond: t.cond, word: t.word, ink: t.ink, resp: r.resp, ok, rt: r.rt });
        await ctx.sleep(250);
      }
      show(ctx, el('h2', { text: `ブロック ${b} 終了` }));
      const conf = await askConfidence(ctx, 'このブロックの正確さに自信は?');
      meta.blocks.push({ block: b, correct, conf });
    }
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

  const stat = (c) => {
    const g = scored.filter((x) => x.cond === c), ok = g.filter((x) => x.ok);
    return { acc: `${ok.length}/${g.length}`, rt: mean(ok.map((x) => x.rt)) };
  };
  const st = Object.fromEntries(CONDS.map((c) => [c, stat(c)]));
  const rows = [['条件', '正解', '平均秒(正解)']].concat(CONDS.map((c) => [COND_LABEL[c], st[c].acc, fmt(st[c].rt, 3)]));
  const diff = st.incongruent.rt - st.congruent.rt;
  show(ctx, el('h2', { text: '結果' }),
    el('p', { class: 'big', text: `${score} / ${scored.length} 問正解(予想 ${state.predicted})` }),
    summaryTable(rows),
    el('p', { class: 'hint', text: Number.isFinite(diff) ? `不一致は一致より ${fmt(diff * 1000, 0)} ミリ秒遅い(干渉効果)。` : '干渉効果は計算できませんでした。' }),
    el('p', { class: 'hint', text: `眠気${state.sleepy} 疲れ${state.tired} で保存しました。` }));
}
