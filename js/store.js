// 保存と送信の部品
//   - 設定(送信先URL・合言葉)と、未送信の記録(outbox)を端末の localStorage に持つ
//   - 記録はまず端末に入れ、あとで送る。通信が切れても失われず、再送しても二重登録されない(uidで判定)
//   - 合言葉を送る先は Google Apps Script の URL だけに制限する(別のURLに誤って送らないため)

const P = 'cp1.';
const mem = {}; // localStorage が使えない環境(プライベートモード等)の代替

function load(k, fallback) {
  try {
    const s = localStorage.getItem(P + k);
    return s === null ? fallback : JSON.parse(s);
  } catch (e) {
    return k in mem ? mem[k] : fallback;
  }
}
function save(k, v) {
  mem[k] = v;
  try { localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) { /* メモリ側だけに残る */ }
}

export const SHEETS = ['understanding_log', 'work_log', 'notes', 'test_results', 'recall_checks'];

const URL_RE = [
  /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/,
  /^https:\/\/script\.google\.com\/a\/(macros\/)?[^/\s]+\/(macros\/)?s\/[\w-]+\/exec$/,
];
export const isValidUrl = (u) => URL_RE.some((re) => re.test(u));

export const getConfig = () => load('cfg', { url: '', token: '' });
export function setConfig(url, token) {
  url = String(url).trim(); token = String(token).trim();
  if (url && !isValidUrl(url)) throw new Error('URLは https://script.google.com/.../exec の形式にしてください');
  save('cfg', { url, token });
}
export const isConfigured = () => { const c = getConfig(); return !!(c.url && c.token); };

export function uid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/** 端末のローカル時刻をオフセット付きISO形式で返す(例 2026-10-14T17:30:05+09:00) */
export function nowIso(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sg = off >= 0 ? '+' : '-';
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sg}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`;
}

export function deviceName() {
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad/i.test(ua)) return 'ios';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Mac/i.test(ua)) return 'mac';
  return 'other';
}

// ---------- outbox(未送信) と キャッシュ ----------
const getOutbox = () => load('outbox', []);
export const pendingCount = () => getOutbox().length;

/** 記録を1件追加する。端末に保存して、送信を試みる */
export function addRecord(sheet, record) {
  if (!SHEETS.includes(sheet)) throw new Error('unknown sheet ' + sheet);
  const rec = Object.assign({ ts: nowIso(), device: deviceName(), uid: uid() }, record);
  const box = getOutbox();
  box.push({ sheet, record: rec });
  save('outbox', box);
  if (sheet === 'recall_checks') { // 送信済みになってもシート再取得までは「済み」と分かるよう端末にも残す
    const done = load('done_checks', []);
    done.push(rec.target_uid + '|' + rec.due_days);
    save('done_checks', done.slice(-500));
  }
  if (sheet === 'understanding_log') {
    const mine = load('my_entries', []);
    mine.push({ uid: rec.uid, ts: rec.ts, topic: rec.topic, genre: rec.genre });
    save('my_entries', mine.slice(-200));
  }
  flush();
  return rec;
}

let flushing = false;
let lastStatus = { ok: true, msg: '' };
export const getStatus = () => lastStatus;

async function post(body) {
  const cfg = getConfig();
  if (!isValidUrl(cfg.url)) throw new Error('bad_url');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25000);
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      // text/plain にするとブラウザの事前確認(preflight)が不要になり、Apps Script が受け取れる
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ token: cfg.token }, body)),
      redirect: 'follow',
      credentials: 'omit',
      signal: ctl.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 未送信を順に送る。失敗したらそこで止め、残りは次回に回す */
export async function flush() {
  if (flushing || !isConfigured()) {
    if (!isConfigured()) lastStatus = { ok: false, msg: '送信先が未設定(設定タブ)' };
    notify();
    return;
  }
  flushing = true;
  try {
    for (;;) {
      const box = getOutbox();
      if (!box.length) { lastStatus = { ok: true, msg: '' }; break; }
      let r;
      try {
        r = await post({ action: 'append', sheet: box[0].sheet, record: box[0].record });
      } catch (e) {
        lastStatus = { ok: false, msg: '通信できない(あとで自動再送)' };
        break;
      }
      if (r && r.ok) {
        const cur = getOutbox();
        // 送信中に別の追加があっても壊さないよう、先頭が同じ記録のときだけ取り除く
        if (cur.length && cur[0].record.uid === box[0].record.uid) { cur.shift(); save('outbox', cur); }
      } else if (r && r.error === 'unauthorized') {
        lastStatus = { ok: false, msg: '合言葉が違う(設定タブで確認)' };
        break;
      } else {
        lastStatus = { ok: false, msg: '送信エラー: ' + (r && r.error ? r.error : '不明') };
        break;
      }
    }
  } finally {
    flushing = false;
    notify();
  }
}

// 画面更新の通知
const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
function notify() { listeners.forEach((fn) => { try { fn(); } catch (e) { /* 表示側の失敗で送信を止めない */ } }); }

/** 接続テスト: 合言葉つきで読み取り要求を出し、成否を返す */
export async function testConnection() {
  try {
    const r = await post({ action: 'read', sheet: 'notes' });
    if (r && r.ok) return { ok: true, msg: '接続OK(合言葉も一致)' };
    if (r && r.error === 'unauthorized') return { ok: false, msg: '合言葉が違います' };
    return { ok: false, msg: 'エラー: ' + (r && r.error ? r.error : '不明') + '(setup を実行済みか確認)' };
  } catch (e) {
    return { ok: false, msg: '通信できません(URL・公開設定・回線を確認)' };
  }
}

// ---------- 再生チェック用: 理解ログと再生結果を、端末内+シートから集める ----------
/** シートから理解ログと再生チェックを取り込む(別端末で入力した分も、再生チェックに出すため) */
export async function pullForRecall() {
  if (!isConfigured()) return false;
  try {
    const [u, c] = [await post({ action: 'read', sheet: 'understanding_log' }), await post({ action: 'read', sheet: 'recall_checks' })];
    if (!(u && u.ok && c && c.ok)) return false;
    const ix = (cols, name) => cols.indexOf(name);
    save('cache_entries', u.rows.map((r) => ({
      uid: String(r[ix(u.columns, 'uid')]), ts: String(r[ix(u.columns, 'ts')]),
      topic: String(r[ix(u.columns, 'topic')]), genre: String(r[ix(u.columns, 'genre')]),
    })));
    save('cache_checks', c.rows.map((r) => ({
      target_uid: String(r[ix(c.columns, 'target_uid')]), due_days: Number(r[ix(c.columns, 'due_days')]),
    })));
    return true;
  } catch (e) {
    return false;
  }
}

/** 再生チェックの材料(シート由来 + 未送信分)を返す */
export function recallData() {
  const entries = new Map(); const checks = new Set();
  load('cache_entries', []).forEach((e) => entries.set(e.uid, e));
  load('my_entries', []).forEach((e) => entries.set(e.uid, e));
  load('cache_checks', []).forEach((c) => checks.add(c.target_uid + '|' + c.due_days));
  load('done_checks', []).forEach((k) => checks.add(k));
  getOutbox().forEach(({ sheet, record: r }) => {
    if (sheet === 'understanding_log') entries.set(r.uid, { uid: r.uid, ts: r.ts, topic: r.topic, genre: r.genre });
    if (sheet === 'recall_checks') checks.add(r.target_uid + '|' + r.due_days);
  });
  return { entries: [...entries.values()], checks };
}

// 軽い設定(テスト順の入れ替えなど)
export const getPref = (k, d) => load('pref_' + k, d);
export const setPref = (k, v) => save('pref_' + k, v);
