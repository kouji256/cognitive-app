// 入力フォーム(理解ログ・作業ログ・気づきメモ)。どれも30秒以内で終わるよう、ほぼタップだけにしてある
import { el, field, choice, scale5, numField, textInput, button, toast } from './ui.js';
import { addRecord, pendingCount } from './store.js';

const GENRES = ['物理・数学', 'プログラミング', '読書', '動画・講義', '仕事・手続き', 'その他'];
const PLACES = ['自室', '図書館', '大学', 'カフェ', '職場', 'その他'];
const TAGS = ['気づき', '理解', '記憶', '集中', '判断', '疑問', 'その他'];

function done(msg) {
  const n = pendingCount();
  toast(n ? `${msg}(未送信 ${n}件)` : msg);
}

/** 必須の入力が欠けていたら、どれが足りないか示して false */
function need(list) {
  const miss = list.filter(([, v]) => v === null || v === undefined || v === '' || Number.isNaN(v)).map(([n]) => n);
  if (miss.length) { toast('未入力: ' + miss.join('・')); return false; }
  return true;
}

export function understandingForm(root, onSaved) {
  const genre = choice({ options: GENRES.map((g) => ({ v: g, label: g })) });
  const topic = textInput({ maxlength: 80, placeholder: '例: 逆行列の意味' });
  const weight = scale5({}), und = scale5({}), sleepy = scale5({}), focus = scale5({});
  const helpful = textInput({ rows: 2, maxlength: 300, placeholder: '例: 図を先に見せてもらった' });
  const stuck = textInput({ rows: 2, maxlength: 300, placeholder: '例: 定義の「単位元」が曖昧だった' });

  const reset = () => { genre.set(null); topic.reset(); [weight, und, sleepy, focus].forEach((s) => s.set(null)); helpful.reset(); stuck.reset(); };
  const submit = () => {
    if (!need([['ジャンル', genre.get()], ['題材', topic.get()], ['重さ', weight.get()], ['理解度', und.get()], ['眠気', sleepy.get()], ['集中', focus.get()]])) return;
    addRecord('understanding_log', {
      genre: genre.get(), topic: topic.get(), weight: weight.get(), understanding: und.get(),
      helpful: helpful.get(), stuck: stuck.get(), sleepy: sleepy.get(), focus: focus.get(),
    });
    reset(); done('理解ログを記録した'); if (onSaved) onSaved();
  };
  root.append(
    el('h2', { text: '理解ログ' }),
    el('p', { class: 'lead', text: '何かを学んだ・読んだ直後に。3日後と7日後に「見ずに再生できるか」を聞きます。' }),
    field('ジャンル', genre), field('題材(短く)', topic),
    field('題材の重さ', weight, '1=軽い 5=重い(難しい・長い)'),
    field('理解度', und, '1=ほぼ分からない 5=人に説明できる'),
    field('眠気', sleepy, '1=冴えている 5=ひどく眠い'),
    field('集中', focus, '1=散漫 5=没頭'),
    field('効いた説明(任意)', helpful), field('詰まった点(任意)', stuck),
    button('記録する', submit));
}

export function workForm(root) {
  const task = textInput({ maxlength: 100, placeholder: '例: レポートの構成づくり' });
  const place = choice({ options: PLACES.map((p) => ({ v: p, label: p })) });
  const deadline = choice({ options: [{ v: 'あり', label: '締め切りあり' }, { v: 'なし', label: 'なし' }] });
  const minutes = numField({ quick: [15, 30, 60, 90, 120], min: 1, max: 1440, placeholder: '分' });
  const focus = scale5({}), sleepy = scale5({});
  const interrupts = numField({ quick: [0, 1, 2, 3, 5], min: 0, max: 99, placeholder: '回' });
  const sleepHours = numField({ quick: [4, 5, 6, 7, 8], min: 0, max: 16, step: 0.5, placeholder: '時間' });

  const reset = () => { task.reset(); place.set(null); deadline.set(null); minutes.reset(); focus.set(null); sleepy.set(null); interrupts.reset(); sleepHours.reset(); };
  const submit = () => {
    const m = minutes.get(), it = interrupts.get(), sh = sleepHours.get();
    if (!need([['作業内容', task.get()], ['場所', place.get()], ['締め切り', deadline.get()], ['時間(1〜1440分)', m], ['集中', focus.get()],
      ['中断回数(0〜99)', it], ['眠気', sleepy.get()], ['睡眠時間(0〜16)', sh]])) return;
    addRecord('work_log', {
      task: task.get(), place: place.get(), deadline: deadline.get(), minutes: m, focus: focus.get(),
      interruptions: it, sleepy: sleepy.get(), sleep_hours: sh,
    });
    reset(); done('作業ログを記録した');
  };
  root.append(
    el('h2', { text: '作業ログ' }),
    el('p', { class: 'lead', text: '作業を終えた直後に。いまの時刻が「終了時刻」、そこから作業時間を引いた時刻が開始として分析されます。' }),
    field('作業内容', task), field('場所', place), field('締め切り', deadline),
    field('作業時間(分)', minutes), field('集中', focus, '1=散漫 5=没頭'),
    field('中断された回数', interrupts), field('眠気', sleepy, '1=冴えている 5=ひどく眠い'),
    field('前夜の睡眠時間', sleepHours),
    button('記録する', submit));
}

export function noteForm(root) {
  const body = textInput({ rows: 4, maxlength: 1000, placeholder: '気づいたことを一言で' });
  const tags = choice({ multi: true, options: TAGS.map((t) => ({ v: t, label: t })) });
  const submit = () => {
    if (!need([['本文', body.get()]])) return;
    addRecord('notes', { body: body.get(), tags: tags.get().join(',') });
    body.reset(); tags.set([]); done('メモを記録した');
  };
  root.append(el('h2', { text: '気づきメモ' }), field('本文', body), field('タグ(任意・複数可)', tags), button('記録する', submit));
}
