// 3D心的回転テスト用の幾何ロジック(画面に依存しない部品。node でもテストできる)
//
// 部品の役割:
//   generateShape  … 立方体を連結した図形(整数座標)をランダムに作る。鏡像と重ならない図形だけ採用
//   isChiral       … 「鏡像が、どんな回転でも元と重ならない」ことの判定(これが偽だと鏡像問題が成立しない)
//   buildTrial     … 1問分(左図形・右図形・回転軸・角度・正解)を作る
//   faces / project … 描画用: 図形を回転して、見える面を奥から順に並べる

export const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

// ---------- 乱数(テストで固定できるよう差し替え可能) ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// ---------- 行列(3x3、配列の配列) ----------
export const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
export function matMul(A, B) {
  return A.map((row) => [0, 1, 2].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));
}
export function matVec(M, v) {
  return [M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
          M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
          M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]];
}
export function det3(M) {
  return M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1])
       - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0])
       + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
}
/** 単位ベクトル axis まわりに deg 度回す回転行列(ロドリゲスの公式) */
export function axisAngleMatrix(axis, deg) {
  const len = Math.hypot(axis[0], axis[1], axis[2]);
  if (!(len > 1e-9)) throw new Error('axis must be non-zero');
  const [x, y, z] = [axis[0] / len, axis[1] / len, axis[2] / len];
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t), k = 1 - c;
  return [[c + x * x * k, x * y * k - z * s, x * z * k + y * s],
          [y * x * k + z * s, c + y * y * k, y * z * k - x * s],
          [z * x * k - y * s, z * y * k + x * s, c + z * z * k]];
}

// ---------- 立方体群の24回転(整数行列) ----------
export const ROT24 = (() => {
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  const out = [];
  for (const p of perms) {
    for (let s = 0; s < 8; s++) {
      const sg = [s & 1 ? -1 : 1, s & 2 ? -1 : 1, s & 4 ? -1 : 1];
      const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (let i = 0; i < 3; i++) M[i][p[i]] = sg[i];
      if (det3(M) === 1) out.push(M);
    }
  }
  return out;
})();

// ---------- 図形(セルの配列 [[x,y,z],...]) ----------
const key = (c) => c[0] + ',' + c[1] + ',' + c[2];

/** 回転しても平行移動しても同じになる「正規形」の文字列。同じ形かどうかの比較に使う */
export function canonical(cells) {
  let best = null;
  for (const R of ROT24) {
    const rc = cells.map((c) => matVec(R, c));
    const mn = [0, 1, 2].map((i) => Math.min(...rc.map((c) => c[i])));
    const s = rc.map((c) => key([c[0] - mn[0], c[1] - mn[1], c[2] - mn[2]])).sort().join(';');
    if (best === null || s < best) best = s;
  }
  return best;
}
export const mirrorCells = (cells) => cells.map((c) => [-c[0], c[1], c[2]]);
export const isChiral = (cells) => canonical(cells) !== canonical(mirrorCells(cells));

export function isConnected(cells) {
  const set = new Set(cells.map(key));
  const seen = new Set([key(cells[0])]);
  const stack = [cells[0]];
  while (stack.length) {
    const c = stack.pop();
    for (const d of DIRS) {
      const n = [c[0] + d[0], c[1] + d[1], c[2] + d[2]];
      const k = key(n);
      if (set.has(k) && !seen.has(k)) { seen.add(k); stack.push(n); }
    }
  }
  return seen.size === set.size;
}

/**
 * 腕(長さ2〜3の直線)を直角に曲げながらつないだ図形を作る(Shepard-Metzler型)。
 * 条件: n個・自己交差なし・3軸すべてに広がる・鏡像と重ならない(キラル)
 */
export function generateShape(rng, n = 9) {
  for (let attempt = 0; attempt < 2000; attempt++) {
    const cells = [[0, 0, 0]];
    const used = new Set([key(cells[0])]);
    let dir = pick(rng, DIRS);
    let ok = true;
    while (cells.length < n && ok) {
      const L = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < L && cells.length < n; i++) {
        const last = cells[cells.length - 1];
        const c = [last[0] + dir[0], last[1] + dir[1], last[2] + dir[2]];
        if (used.has(key(c))) { ok = false; break; }
        used.add(key(c)); cells.push(c);
      }
      const perp = DIRS.filter((d) => d[0] * dir[0] + d[1] * dir[1] + d[2] * dir[2] === 0);
      dir = pick(rng, perp);
    }
    if (!ok || cells.length !== n) continue;
    const spans = [0, 1, 2].map((i) => Math.max(...cells.map((c) => c[i])) - Math.min(...cells.map((c) => c[i])));
    if (spans.some((s) => s < 2)) continue;
    if (!isChiral(cells)) continue;
    return cells;
  }
  throw new Error('shape generation failed');
}

/** 重心を原点に移した浮動小数の座標に変える(回転の中心をそろえるため) */
export function centered(cells) {
  const m = [0, 1, 2].map((i) => cells.reduce((a, c) => a + c[i], 0) / cells.length);
  return cells.map((c) => [c[0] - m[0], c[1] - m[1], c[2] - m[2]]);
}

export function randomAxis(rng) {
  for (;;) {
    const v = [rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1];
    const l = Math.hypot(v[0], v[1], v[2]);
    if (l > 0.2 && l <= 1) return [v[0] / l, v[1] / l, v[2] / l]; // 球の内側から採って正規化 → 方向が偏らない
  }
}

// 左右とも同じ「見る向き」を最初にかける(立体に見えるよう少し傾ける)
export const VIEW = matMul(axisAngleMatrix([1, 0, 0], -22), axisAngleMatrix([0, 1, 0], 28));

/**
 * 1問分を作る。
 *   type 'same'   : 右 = 左をaxisまわりにangle度回した図形
 *   type 'mirror' : 右 = 左を鏡に映してから、同じように回した図形(どう回しても左とは重ならない)
 */
export function buildTrial(rng, angle, type) {
  if (type !== 'same' && type !== 'mirror') throw new Error('bad type');
  const base = generateShape(rng);
  const axis = randomAxis(rng);
  const R = axisAngleMatrix(axis, angle);
  const right = type === 'same' ? base : mirrorCells(base);
  return {
    type, angle, axis,
    left: { cells: centered(base), M: VIEW },
    right: { cells: centered(right), M: matMul(VIEW, R) },
    baseCells: base,
  };
}

// ---------- 描画用 ----------
const FACES = [
  { n: [1, 0, 0] }, { n: [-1, 0, 0] }, { n: [0, 1, 0] }, { n: [0, -1, 0] }, { n: [0, 0, 1] }, { n: [0, 0, -1] },
];
/** 面の4頂点(中心c、法線n。立方体の辺長1) */
function faceCorners(c, n) {
  const a = n[0] !== 0 ? [0, 1, 0] : [1, 0, 0];
  const b = n[0] !== 0 ? [0, 0, 1] : (n[1] !== 0 ? [0, 0, 1] : [0, 1, 0]);
  const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  return pts.map(([s, t]) => [0, 1, 2].map((i) => c[i] + 0.5 * n[i] + 0.5 * s * a[i] + 0.5 * t * b[i]));
}

/**
 * 図形を行列Mで回し、カメラから見える面を「奥 → 手前」の順で返す。
 * カメラは z軸の正の側(距離 D)。他の立方体と接している面は描かない。
 */
export function visibleFaces(cells, M, D = 14) {
  // cells は重心補正で小数座標だが、全セルから同じ値を引いただけなので、最小値を引けば整数格子に戻る(隣接判定に使う)
  const set = new Set();
  const mins = [0, 1, 2].map((i) => Math.min(...cells.map((c) => c[i])));
  const lattice = cells.map((c) => [Math.round(c[0] - mins[0]), Math.round(c[1] - mins[1]), Math.round(c[2] - mins[2])]);
  lattice.forEach((c) => set.add(key(c)));
  const out = [];
  cells.forEach((cell, idx) => {
    const lc = lattice[idx];
    for (const f of FACES) {
      const nb = [lc[0] + f.n[0], lc[1] + f.n[1], lc[2] + f.n[2]];
      if (set.has(key(nb))) continue;
      const center = matVec(M, cell);
      const nrm = matVec(M, f.n);
      const fc = [center[0] + 0.5 * nrm[0], center[1] + 0.5 * nrm[1], center[2] + 0.5 * nrm[2]];
      const toCam = [-fc[0], -fc[1], D - fc[2]];
      if (nrm[0] * toCam[0] + nrm[1] * toCam[1] + nrm[2] * toCam[2] <= 0) continue; // 裏向きの面
      const corners = faceCorners(cell, f.n).map((p) => matVec(M, p));
      out.push({ corners, normal: nrm, depth: fc[2] });
    }
  });
  out.sort((p, q) => p.depth - q.depth);
  return out;
}

/** 回転後の3D点を画面座標へ(透視投影)。scale は 1単位が何pxか */
export function project(p, cx, cy, scale, D = 14) {
  const s = D / (D - p[2]);
  return [cx + p[0] * s * scale, cy - p[1] * s * scale];
}
