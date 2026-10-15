// 処理速度テスト(記号照合)の出題部品。画面に依存しない。
// 記号 = 図形(4種) × 内側の印(3種) × 印の位置(4方向)。「違う」ペアは必ず1か所だけ違う。
export const FEATURES = { s: 4, m: 3, p: 4 }; // s=図形 m=印 p=印の位置

const pick = (rng, n) => Math.floor(rng() * n);

export function randomGlyph(rng) {
  return { s: pick(rng, FEATURES.s), m: pick(rng, FEATURES.m), p: pick(rng, FEATURES.p) };
}
export const sameGlyph = (a, b) => a.s === b.s && a.m === b.m && a.p === b.p;

/** same=true なら同じ記号2つ、false なら1か所だけ違う2つ */
export function makePair(rng, same) {
  const a = randomGlyph(rng);
  if (same) return { a, b: { ...a }, same: true, feat: null };
  const keys = Object.keys(FEATURES);
  const feat = keys[pick(rng, keys.length)];
  const b = { ...a };
  do { b[feat] = pick(rng, FEATURES[feat]); } while (b[feat] === a[feat]);
  // 左右の入れ替えもランダムにして、「元の記号が左」という手がかりをなくす
  return rng() < 0.5 ? { a, b, same: false, feat } : { a: b, b: a, same: false, feat };
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = pick(rng, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** 10問ずつ(同じ5・違う5)をシャッフルして渡す。どこで打ち切っても「同じ/違う」がほぼ半々 */
export function nextBatch(rng) {
  return shuffle([true, true, true, true, true, false, false, false, false, false], rng).map((same) => makePair(rng, same));
}
