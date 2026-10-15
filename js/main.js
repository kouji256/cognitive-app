// 画面の切り替え(下のタブ)と、設定画面
import { el, clear, button, field, textInput, toast } from './ui.js';
import { understandingForm, workForm, noteForm } from './forms.js';
import { recallView, dueCount } from './recall.js';
import { SPAN_TESTS, spanTitle, runSpanTest } from './tests_span.js';
import { runRotationTest } from './test_rotation.js';
import { runExplainCompare, runExplainDelayed } from './explain.js';
import { createCtx } from './testcommon.js';
import { getConfig, setConfig, isConfigured, flush, pendingCount, getStatus, onChange, testConnection, isValidUrl } from './store.js';

const view = document.getElementById('view');
const tabs = [...document.querySelectorAll('#tabs button')];
let activeCtx = null; // 実行中のテスト(タブを移ったら中断する)

function stopTest() { if (activeCtx) { activeCtx.abort(); activeCtx = null; } }

function updateBadges() {
  const n = dueCount();
  const b = document.getElementById('badge-recall');
  b.textContent = n ? String(n) : '';
  b.hidden = !n;
  const s = document.getElementById('sync');
  const p = pendingCount(), st = getStatus();
  s.textContent = p ? `未送信 ${p}件${st.msg ? ' ・ ' + st.msg : ''}` : (isConfigured() ? '送信済み' : '送信先 未設定');
  s.className = 'sync ' + (p || !isConfigured() ? 'warn' : 'okk');
}

// ---------- 画面 ----------
function home() {
  clear(view);
  const sub = el('div', { class: 'sub' });
  const menu = el('div', { class: 'menu' });
  const items = [
    ['理解ログ', '学んだ直後に(約30秒)', () => { clear(sub); understandingForm(sub, updateBadges); }],
    ['作業ログ', '作業を終えたら', () => { clear(sub); workForm(sub); }],
    ['気づきメモ', '思いついたら一言', () => { clear(sub); noteForm(sub); }],
  ];
  items.forEach(([t, d, fn]) => menu.append(el('button', { type: 'button', class: 'menu-item', onclick: () => { fn(); sub.scrollIntoView({ behavior: 'smooth' }); } },
    el('span', { class: 'mi-t', text: t }), el('span', { class: 'mi-d', text: d }))));
  view.append(el('h2', { text: '記録' }), menu, sub);
  clear(sub); understandingForm(sub, updateBadges);
}

function recall() { clear(view); recallView(view, updateBadges, (d) => runInView((c) => runExplainDelayed(c, d), recall)); }

/** テストを画面に出して実行する。終わったら back に戻れる */
function runInView(fn, back) {
  stopTest();
    clear(view);
    const root = el('div', { class: 'testroot' });
    const bar = el('div', { class: 'testbar' }, button('中断して戻る', () => { stopTest(); back(); }, 'alt small'));
    view.append(bar, root);
    const ctx = createCtx(root);
    activeCtx = ctx;
    fn(ctx).then(() => {
      if (activeCtx === ctx) {
        bar.firstChild.textContent = '戻る';
        bar.firstChild.onclick = () => { stopTest(); back(); };
      }
      updateBadges();
    }).catch((e) => {
      root.append(el('div', { class: 'fb ng', text: 'エラーが起きました: ' + (e && e.message ? e.message : e) }));
    });
}

function tests() {
  clear(view);
  const menu = el('div', { class: 'menu' });
  const start = (fn) => runInView(fn, tests);
  const rows = [
    ['説明を読んで理解するテスト', '約15分 ・ 式・図・文章で読み、見ずに答える(3日後・7日後に再テスト)', () => start(runExplainCompare)],
    ...SPAN_TESTS.map((id) => [spanTitle(id), id === 'digit_span' ? '約8分 ・ 順唱と逆唱' : '約5分 ・ 位置を逆順に', () => start((c) => runSpanTest(c, id))]),
    ['3D心的回転', '約6分 ・ 立体が同じ形か鏡像か', () => start(runRotationTest)],
  ];
  rows.forEach(([t, d, fn]) => menu.append(el('button', { type: 'button', class: 'menu-item', onclick: fn },
    el('span', { class: 'mi-t', text: t }), el('span', { class: 'mi-d', text: d }))));
  view.append(el('h2', { text: 'テスト' }),
    el('p', { class: 'lead', text: '元気なとき・眠いときの両方で測ると差が分かります。開始前に眠気・疲れを入力します。静かな場所で、画面を見られる状態で。' }),
    menu);
}

function settings() {
  clear(view);
  const cfg = getConfig();
  const url = textInput({ maxlength: 300, placeholder: 'https://script.google.com/macros/s/.../exec' });
  url.el.value = cfg.url;
  const tok = el('input', { type: 'password', maxlength: 200, autocomplete: 'off', placeholder: '合言葉', value: cfg.token });
  const msg = el('div', { class: 'hint' });
  const save = () => {
    try { setConfig(url.get(), tok.value); msg.textContent = '保存しました'; flush(); updateBadges(); }
    catch (e) { msg.textContent = e.message; }
  };
  const test = async () => {
    save();
    if (!isConfigured()) { msg.textContent = 'URLと合言葉を入れてください'; return; }
    if (!isValidUrl(url.get())) return;
    msg.textContent = '接続中…';
    const r = await testConnection();
    msg.textContent = r.msg;
  };
  view.append(el('h2', { text: '設定' }),
    el('p', { class: 'lead', text: 'この端末ごとに、一度だけ入力します。合言葉はこの端末の中だけに保存され、Google の送信先URL以外には送られません。' }),
    field('送信先URL(Apps Script のウェブアプリURL)', url),
    field('合言葉', tok),
    el('div', { class: 'row2' }, button('保存', save), button('保存して接続テスト', test, 'alt')),
    msg,
    el('hr'),
    el('div', { class: 'hint', text: `未送信の記録: ${pendingCount()}件` }),
    button('今すぐ送信', async () => { await flush(); updateBadges(); settings(); }, 'alt'));
}

const SCREENS = { home, recall, tests, settings };
function go(name) {
  stopTest();
  tabs.forEach((t) => { const on = t.dataset.go === name; t.classList.toggle('on', on); t.setAttribute('aria-current', on ? 'page' : 'false'); });
  SCREENS[name]();
  window.scrollTo(0, 0);
}
tabs.forEach((t) => t.addEventListener('click', () => go(t.dataset.go)));

onChange(updateBadges);
window.addEventListener('online', () => flush());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { flush(); updateBadges(); } });

go(isConfigured() ? 'home' : 'settings');
if (!isConfigured()) toast('最初に送信先を設定してください');
flush();
updateBadges();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* オフライン対応なしでも動く */ });
}
