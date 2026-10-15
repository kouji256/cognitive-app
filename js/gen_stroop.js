// 注意・抑制テスト(ストループ)の出題部品。画面に依存しない。
// 色の名前の文字を、文字の色(インク)で答える。
//   一致  : 「赤」を赤で   不一致: 「赤」を青で   中立: 「■■■」を赤で
// 3条件は同数、インクの色は各条件内で均等。直前と同じ刺激・同じ条件の4連続は出さない。
export const COLORS = [
  { key: 'r', name: '赤' },
  { key: 'b', name: '青' },
  { key: 'g', name: '緑' },
  { key: 'y', name: '黄' },
];
export const NEUTRAL = '■■■';
export const CONDS = ['congruent', 'incongruent', 'neutral'];

const pick = (rng, n) => Math.floor(rng() * n);
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = pick(rng, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const nameOf = (key) => COLORS.find((c) => c.key === key).name;

/** perCond: 各条件の問題数(4の倍数)。条件×インクが均等になる。順序は制約つきシャッフル */
export function makeTrials(rng, perCond) {
  if (perCond % 4 !== 0 || perCond <= 0) throw new Error('perCond must be a positive multiple of 4');
  const per = perCond / 4; // 条件内で各インク色が出る回数
  const trials = [];
  const keys = COLORS.map((c) => c.key);
  keys.forEach((ink, k) => {
    for (let i = 0; i < per; i++) {
      trials.push({ cond: 'congruent', word: nameOf(ink), ink });
      trials.push({ cond: 'neutral', word: NEUTRAL, ink });
      // 不一致の文字: インクの色から「1つ・2つ・3つ先」の色の名前を順に使う(全インクで同じ周期)。
      // どのインクも同じ並びなので、どの文字も不一致条件で同じ回数出る。組の回数の差は最大1
      const offset = 1 + (i % 3);
      trials.push({ cond: 'incongruent', word: nameOf(keys[(k + offset) % 4]), ink });
    }
  });
  for (let attempt = 0; attempt < 2000; attempt++) {
    const order = shuffle(trials, rng);
    let ok = true;
    for (let i = 1; i < order.length && ok; i++) {
      if (order[i].word === order[i - 1].word && order[i].ink === order[i - 1].ink) ok = false;
      if (i >= 3 && order[i].cond === order[i - 1].cond && order[i].cond === order[i - 2].cond && order[i].cond === order[i - 3].cond) ok = false;
    }
    if (ok) return order;
  }
  throw new Error('trial ordering failed');
}

/** 練習用: 各条件2問(計6問) */
export function makePractice(rng) {
  const base = makeTrials(rng, 4); // 各条件4問から、条件ごとに2問ずつ取る
  const out = [];
  for (const c of CONDS) out.push(...base.filter((t) => t.cond === c).slice(0, 2));
  return shuffle(out, rng);
}
