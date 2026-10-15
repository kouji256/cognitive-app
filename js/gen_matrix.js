// 流動性推論テスト(3×3の図形パターン)の出題部品。画面に依存しない。
// 各マスは4つの属性(図形・個数・塗り・色)を持ち、各属性の値(0〜2)が「規則」で決まる。
//   const   : 全マス同じ
//   rowwise : 行ごとに決まる(同じ行は同じ値)
//   colwise : 列ごとに決まる(同じ列は同じ値)
//   latin   : どの行・どの列にも0,1,2が1回ずつ出る
// 難易度 = 規則で変化する属性の数(1〜3)。解答の一意性は solver(別の方法で解く)で検証する。
export const ATTRS = ['shape', 'count', 'fill', 'color'];
const RULES = ['rowwise', 'colwise', 'latin'];

const pick = (rng, n) => Math.floor(rng() * n);
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = pick(rng, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function makeRule(rng, kind) {
  if (kind === 'const') return { kind, v: pick(rng, 3) };
  if (kind === 'latin') return { kind, a: 1 + pick(rng, 2), b: 1 + pick(rng, 2), k: pick(rng, 3) };
  return { kind, perm: shuffle([0, 1, 2], rng) };
}
function valueOf(rule, r, c) {
  if (rule.kind === 'const') return rule.v;
  if (rule.kind === 'rowwise') return rule.perm[r];
  if (rule.kind === 'colwise') return rule.perm[c];
  return (rule.a * r + rule.b * c + rule.k) % 3;
}

/** 隠れた1マスを、見えている8マスだけから推論する(生成とは別の方法)。曖昧・矛盾なら null */
export function inferMissing(grid) {
  const out = {};
  for (const attr of ATTRS) {
    const g = (r, c) => grid[r][c][attr];
    const preds = new Set();
    const vis = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (!(r === 2 && c === 2)) vis.push(g(r, c));
    if (vis.every((v) => v === vis[0])) preds.add(vis[0]); // const
    const rowEq = [0, 1].every((r) => g(r, 0) === g(r, 1) && g(r, 1) === g(r, 2)) && g(2, 0) === g(2, 1);
    if (rowEq) preds.add(g(2, 0)); // rowwise
    const colEq = [0, 1].every((c) => g(0, c) === g(1, c) && g(1, c) === g(2, c)) && g(0, 2) === g(1, 2);
    if (colEq) preds.add(g(0, 2)); // colwise
    const distinct3 = (x, y, z) => x !== y && y !== z && x !== z;
    const latinOk = [0, 1].every((r) => distinct3(g(r, 0), g(r, 1), g(r, 2))) && [0, 1].every((c) => distinct3(g(0, c), g(1, c), g(2, c)))
      && g(2, 0) !== g(2, 1) && g(0, 2) !== g(1, 2);
    if (latinOk) {
      const fromRow = 3 - g(2, 0) - g(2, 1), fromCol = 3 - g(0, 2) - g(1, 2); // 0+1+2=3
      if (fromRow === fromCol) preds.add(fromRow);
    }
    if (preds.size !== 1) return null;
    out[attr] = [...preds][0];
  }
  return out;
}

const cellKey = (c) => ATTRS.map((a) => c[a]).join('');

/** 1問を作る。level=規則で変化する属性の数(1〜3)。戻り値の answerIndex は options 内の正解の位置 */
export function generatePuzzle(rng, level) {
  if (![1, 2, 3].includes(level)) throw new Error('level must be 1..3');
  for (let attempt = 0; attempt < 500; attempt++) {
    const varying = shuffle([0, 1, 2, 3], rng).slice(0, level).map((i) => ATTRS[i]);
    const rules = {};
    ATTRS.forEach((a) => { rules[a] = varying.includes(a) ? makeRule(rng, RULES[pick(rng, 3)]) : makeRule(rng, 'const'); });
    const grid = [0, 1, 2].map((r) => [0, 1, 2].map((c) => Object.fromEntries(ATTRS.map((a) => [a, valueOf(rules[a], r, c)]))));
    const inferred = inferMissing(grid);
    const answer = grid[2][2];
    if (!inferred || ATTRS.some((a) => inferred[a] !== answer[a])) continue; // 規則が曖昧な問題は捨てる
    // 変化するはずの属性が、実際に変化しているか(退化を避ける)
    if (varying.some((a) => new Set(grid.flat().map((c) => c[a])).size < 2)) continue;

    // 誤答: 正解と1属性だけ違うもの。変化する属性を優先
    const cands = [];
    for (const a of ATTRS) for (let v = 0; v < 3; v++) if (v !== answer[a]) cands.push({ a, v, w: (varying.includes(a) ? 0 : 1) + rng() * 0.5 });
    cands.sort((x, y) => x.w - y.w);
    const distract = [];
    const seen = new Set([cellKey(answer)]);
    for (const c of cands) {
      const cell = { ...answer, [c.a]: c.v };
      if (!seen.has(cellKey(cell))) { seen.add(cellKey(cell)); distract.push(cell); }
      if (distract.length === 3) break;
    }
    const options = shuffle([answer, ...distract], rng);
    return { level, varying, rules, grid, options, answerIndex: options.findIndex((o) => cellKey(o) === cellKey(answer)) };
  }
  throw new Error('puzzle generation failed');
}

/** 選択肢が正解か(推論結果と一致するか)。テストと採点の検証用 */
export function isCorrectOption(puzzle, idx) {
  const inferred = inferMissing(puzzle.grid);
  return ATTRS.every((a) => inferred[a] === puzzle.options[idx][a]);
}
