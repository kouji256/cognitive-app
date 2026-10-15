// 画面部品。ユーザー入力はすべて textContent / value で扱い、innerHTML は使わない(注入防止)

export function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach((c) => { if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
  return e;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/**
 * 選択ボタン列。選んだものは塗りつぶし+✓で明確に表示する(薄い色だと選んだか分からないため)
 * opts: [{v, label}] / multi: 複数選択 / 戻り値 .get() / .set(v) / .el
 */
export function choice({ options, multi = false, value = null, onChange, cls = '' }) {
  let sel = multi ? new Set(value || []) : value;
  const wrap = el('div', { class: 'choice ' + cls, role: multi ? 'group' : 'radiogroup' });
  const btns = options.map((o) => {
    const b = el('button', { type: 'button', class: 'opt', text: o.label, 'data-v': String(o.v) });
    b.addEventListener('click', () => {
      if (multi) { sel.has(o.v) ? sel.delete(o.v) : sel.add(o.v); }
      else { sel = sel === o.v ? null : o.v; } // もう一度押すと選択解除
      paint();
      if (onChange) onChange(api.get());
    });
    wrap.append(b);
    return [o, b];
  });
  function paint() {
    btns.forEach(([o, b]) => {
      const on = multi ? sel.has(o.v) : sel === o.v;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  const api = {
    el: wrap,
    get: () => (multi ? [...sel] : sel),
    set: (v) => { sel = multi ? new Set(v || []) : v; paint(); },
  };
  paint();
  return api;
}

export const scale5 = (opts) => choice({ options: [1, 2, 3, 4, 5].map((n) => ({ v: n, label: String(n) })), cls: 'scale', ...opts });

/** ラベル+部品+補足の1行 */
export function field(label, control, hint) {
  return el('div', { class: 'field' },
    el('div', { class: 'label', text: label }),
    control.el || control,
    hint ? el('div', { class: 'hint', text: hint }) : null);
}

/** 数値入力。よく使う値のクイックボタン付き。get() は 数値 か null */
export function numField({ quick = [], min, max, step = 1, placeholder = '' }) {
  const input = el('input', { type: 'number', inputmode: step < 1 ? 'decimal' : 'numeric', min, max, step, placeholder, class: 'num' });
  const wrap = el('div', { class: 'numfield' });
  const q = quick.map((v) => {
    const b = el('button', { type: 'button', class: 'opt small', text: String(v) });
    b.addEventListener('click', () => { input.value = String(v); sync(); });
    return b;
  });
  const sync = () => q.forEach((b) => b.classList.toggle('on', b.textContent === input.value));
  input.addEventListener('input', sync);
  wrap.append(...q, input);
  return {
    el: wrap,
    get: () => {
      if (input.value === '') return null;
      const n = Number(input.value);
      if (!Number.isFinite(n) || (min !== undefined && n < min) || (max !== undefined && n > max)) return NaN;
      return n;
    },
    reset: () => { input.value = ''; sync(); },
  };
}

export function textInput({ rows = 0, maxlength = 200, placeholder = '' }) {
  const e = rows ? el('textarea', { rows, maxlength, placeholder }) : el('input', { type: 'text', maxlength, placeholder, autocomplete: 'off' });
  return { el: e, get: () => e.value.trim(), reset: () => { e.value = ''; } };
}

export function button(text, onclick, cls = 'primary') {
  return el('button', { type: 'button', class: 'btn ' + cls, text, onclick });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const shuffle = (arr, rng = Math.random) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
