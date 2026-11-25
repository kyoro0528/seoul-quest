/* 試験日から逆算プラン (/study-plan)
   選んだ試験日までの残り日数と、級別カリキュラム（全9単元）の進捗から、
   単元ごとの期間と1日あたりの目標を計算する。
   保存するのは選んだ試験日（localStorage の topikExamTarget）だけ。
   このキーは learning-storage.js の同期・バックアップ対象（EXACT_KEYS と
   best_ 接頭辞）のどちらにも当てはまらないため、この端末内だけに残る。
   進捗の読み取りは index.html の curriculumRecords / unitStats と同じ
   元データ・同じ数え方にそろえている。 */
(function () {
  'use strict';

  /* 試験日は /topik-schedule-2027 のPBT表（韓国教育財団の日程）と同じ4回。
     日程が変わったら両方を直すこと。 */
  var EXAMS = [
    { round: '第111回', date: '2027-04-11', area: '全国' },
    { round: '第112回', date: '2027-05-16', area: '東京のみ' },
    { round: '第113回', date: '2027-07-04', area: '全国' },
    { round: '第114回', date: '2027-10-17', area: '全国' }
  ];

  /* index.html の CURRICULUM と同じ単元構成（文法の総復習単元は
     grammarReview として区別する）。 */
  var UNITS = [
    { id: 'u1-1', level: '1級', name: '文の形と基本の助詞', vocab: [1, 200], grammar: ['g01', 'g02', 'g03', 'g04'], listening: null, reading: null },
    { id: 'u1-2', level: '1級', name: '助詞を使いこなす', vocab: [201, 400], grammar: ['g05', 'g06', 'g07', 'g08', 'g09', 'g10'], listening: [1, 4], reading: [1, 7] },
    { id: 'u1-3', level: '1級', name: '活用と時制', vocab: [401, 600], grammar: ['g11', 'g12', 'g13', 'g14'], listening: [5, 8], reading: [8, 14] },
    { id: 'u1-4', level: '1級', name: '希望と依頼・1級仕上げ', vocab: [601, 800], grammar: ['g15', 'g16'], listening: null, reading: null },
    { id: 'u1-5', level: '1級', name: '旅行会話で実践', vocab: null, grammar: null, listening: null, reading: null, travel: true },
    { id: 'u2-1', level: '2級', name: '表現を広げる', vocab: [801, 1100], grammar: ['g17', 'g18', 'g19', 'g20'], listening: [9, 12], reading: [15, 19] },
    { id: 'u2-2', level: '2級', name: '文をつなぐ', vocab: [1101, 1400], grammar: ['g21', 'g22', 'g23', 'g24', 'g25'], listening: [13, 16], reading: [20, 24] },
    { id: 'u2-3', level: '2級', name: '比較と可能・許可', vocab: [1401, 1700], grammar: ['g26', 'g27', 'g28', 'g29', 'g30'], listening: [17, 28], reading: [25, 30] },
    { id: 'u2-4', level: '2級', name: '2級総仕上げ', vocab: [1701, 2000], grammar: null, grammarReview: true, listening: [29, 40], reading: null }
  ];
  var TRAVEL_SCENES = [
    { id: 'airport', name: '空港', total: 5 },
    { id: 'cafe', name: 'カフェ', total: 5 },
    { id: 'hotel', name: 'ホテル', total: 5 }
  ];
  var CATS = [
    ['vocab', '単語', '語'],
    ['grammar', '文法', '項目'],
    ['listening', '聞き取り', '問'],
    ['reading', '読解', '問'],
    ['travel', '旅行会話', '問']
  ];
  /* 1日の新規項目がこの数を超えるペースは、SRS復習の負担も含めると
     継続が難しいとみなして、優先モード（全範囲を前提にしない）に切り替える。 */
  var DAILY_CAP = 60;
  var TARGET_KEY = 'topikExamTarget';

  // ---------- 日付ユーティリティ（index.html の dateKey と同じ sv-SE 形式） ----------
  function parseKey(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0, 0); }
  function keyOf(d) { return d.toLocaleDateString('sv-SE'); }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function daysBetween(fromKey, toKey) { return Math.round((parseKey(toKey) - parseKey(fromKey)) / 86400000); }

  /* r 個を d 日に配分する。合計は必ず r に一致する（端数は先の日へ）。 */
  function distribute(r, d) {
    if (d <= 0) return [];
    if (r <= 0) return new Array(d).fill(0);
    var base = Math.floor(r / d), rem = r - base * d, out = [];
    for (var i = 0; i < d; i++) out.push(base + (i < rem ? 1 : 0));
    return out;
  }

  function mockCadence(daysLeft) {
    if (daysLeft > 30) return { kind: '20分模試', per: '週1回', sessions: Math.floor(daysLeft / 7), finalPhase: false };
    return { kind: '本番モード（100分）', per: '週1回', sessions: Math.max(1, Math.floor(daysLeft / 7)), finalPhase: true };
  }

  /* 残量のある単元へ日数を割り当てる。合計は必ず daysLeft に一致する。 */
  function allocDays(actives, daysLeft) {
    var n = actives.length, out = [], i;
    if (!n || daysLeft <= 0) return out;
    var totalWork = 0;
    for (i = 0; i < n; i++) totalWork += actives[i].work;
    if (daysLeft >= n) {
      var rest = daysLeft - n;
      var quotas = actives.map(function (a) { return totalWork ? rest * a.work / totalWork : rest / n; });
      var floors = quotas.map(function (q) { return Math.floor(q); });
      var used = floors.reduce(function (s, x) { return s + x; }, 0);
      var order = actives.map(function (_, i2) { return i2; }).sort(function (a, b) { return (quotas[b] - floors[b]) - (quotas[a] - floors[a]); });
      for (var k = 0; k < rest - used; k++) floors[order[k % n]]++;
      return actives.map(function (_, i3) { return 1 + floors[i3]; });
    }
    var cum = 0, prev = 0;
    return actives.map(function (a) {
      cum += a.work;
      var b = totalWork ? Math.round(daysLeft * cum / totalWork) : 0;
      var d = b - prev; prev = b; return d;
    });
  }

  /* 純粋計算：input = { today, examDate, units: [{id, level, name, remaining:{...}}], weakestField }
     units はカリキュラム順。返り値の mode は past / done / priority / normal。 */
  function planCompute(input) {
    var daysLeft = daysBetween(input.today, input.examDate);
    if (daysLeft <= 0) return { mode: 'past', daysLeft: daysLeft };
    var totals = { vocab: 0, grammar: 0, listening: 0, reading: 0, travel: 0 };
    var units = input.units.map(function (u) {
      var work = 0, rem = {};
      CATS.forEach(function (c) { rem[c[0]] = Math.max(0, (u.remaining && u.remaining[c[0]]) || 0); totals[c[0]] += rem[c[0]]; work += rem[c[0]]; });
      return { id: u.id, level: u.level, name: u.name, remaining: rem, work: work, grammarReview: !!u.grammarReview };
    });
    var totalWork = totals.vocab + totals.grammar + totals.listening + totals.reading + totals.travel;
    var mock = mockCadence(daysLeft);
    if (totalWork === 0) return { mode: 'done', daysLeft: daysLeft, totals: totals, totalWork: 0, mock: mock, units: units };
    if (totalWork / daysLeft > DAILY_CAP) {
      var focus = null;
      for (var i = 0; i < units.length; i++) if (units[i].work > 0) { focus = units[i]; break; }
      var focusDaily = {};
      CATS.forEach(function (c) { if (focus.remaining[c[0]] > 0) focusDaily[c[0]] = Math.ceil(focus.remaining[c[0]] / daysLeft); });
      return { mode: 'priority', daysLeft: daysLeft, totals: totals, totalWork: totalWork, mock: mock, units: units, focus: focus, focusDaily: focusDaily, weakestField: input.weakestField || null };
    }
    var actives = units.filter(function (u) { return u.work > 0; });
    var alloc = allocDays(actives, daysLeft);
    var today = parseKey(input.today), offset = 0;
    actives.forEach(function (u, i2) {
      var d = alloc[i2];
      u.days = d;
      u.startKey = keyOf(addDays(today, offset));
      u.endKey = keyOf(addDays(today, offset + Math.max(d, 1) - 1));
      offset += d;
      u.daily = {};
      CATS.forEach(function (c) { if (u.remaining[c[0]] > 0 && d > 0) u.daily[c[0]] = Math.ceil(u.remaining[c[0]] / d); });
    });
    var headline = {};
    CATS.forEach(function (c) { if (totals[c[0]] > 0) headline[c[0]] = Math.ceil(totals[c[0]] / daysLeft); });
    return { mode: 'normal', daysLeft: daysLeft, totals: totals, totalWork: totalWork, mock: mock, units: units, headline: headline };
  }

  /* 単元の総量（純粋関数）。進捗ゼロのときの残量はこれと一致する。 */
  function unitTotals(u) {
    var t = { vocab: 0, grammar: 0, listening: 0, reading: 0, travel: 0 };
    if (u.vocab) t.vocab = u.vocab[1] - u.vocab[0] + 1;
    if (u.grammar) t.grammar = u.grammar.length;
    if (u.listening) t.listening = u.listening[1] - u.listening[0] + 1;
    if (u.reading) t.reading = u.reading[1] - u.reading[0] + 1;
    if (u.travel) t.travel = TRAVEL_SCENES.reduce(function (s, sc) { return s + sc.total; }, 0);
    return t;
  }

  // ---------- 進捗の読み取り（ブラウザのみ・読み取り専用） ----------
  function readUnits() {
    var words = {}, gm = new Set(), ls = {}, rs = {};
    try { var raw = JSON.parse(localStorage.getItem('topikVocabState') || 'null'), d0 = raw && (raw.data || raw); if (d0 && d0.words) words = d0.words; } catch (_) {}
    try { gm = new Set(JSON.parse(localStorage.getItem('topikGrammarMastered') || '[]')); } catch (_) {}
    try { var l = JSON.parse(localStorage.getItem('topikListeningState') || 'null'); if (l && l.items) ls = l.items; } catch (_) {}
    try { var r = JSON.parse(localStorage.getItem('topikReadingState') || 'null'); if (r && r.items) rs = r.items; } catch (_) {}
    return UNITS.map(function (u) {
      var tot = unitTotals(u), rem = { vocab: 0, grammar: 0, listening: 0, reading: 0, travel: 0 }, n, id, done;
      if (u.vocab) { done = 0; for (n = u.vocab[0]; n <= u.vocab[1]; n++) { var ws = words['w' + String(n).padStart(4, '0')]; if (ws && ws.status === 'learned') done++; } rem.vocab = tot.vocab - done; }
      if (u.grammar) rem.grammar = u.grammar.filter(function (g) { return !gm.has(g); }).length;
      /* 総復習単元の文法は新規分として数えない（全30項目は他単元で数えている）。 */
      if (u.listening) { done = 0; for (n = u.listening[0]; n <= u.listening[1]; n++) { id = 'l' + String(n).padStart(2, '0'); if (ls[id] && ls[id].mastered) done++; } rem.listening = tot.listening - done; }
      if (u.reading) { done = 0; for (n = u.reading[0]; n <= u.reading[1]; n++) { id = 'r' + String(n).padStart(2, '0'); if (rs[id] && rs[id].mastered) done++; } rem.reading = tot.reading - done; }
      if (u.travel) { done = 0; TRAVEL_SCENES.forEach(function (sc) { done += Math.min(+(localStorage.getItem('best_' + sc.id) || 0), sc.total); }); rem.travel = tot.travel - done; }
      return { id: u.id, level: u.level, name: u.name, remaining: rem, grammarReview: !!u.grammarReview };
    });
  }

  /* 弱点レポートと同じ判定：記録5件以上の分野が2つ以上あるときだけ最弱分野を返す。 */
  function readWeakestField() {
    function srsRate(key) { try { var v = JSON.parse(localStorage.getItem(key) || 'null'); if (!v || !v.items) return null; var r = 0, l = 0; Object.values(v.items).forEach(function (it) { if (!it) return; r += Number(it.r) || 0; l += Number(it.l) || 0; }); return r + l ? { correct: r, attempts: r + l } : null; } catch (_) { return null; } }
    function stateRate(key) { try { var v = JSON.parse(localStorage.getItem(key) || 'null'); if (!v || !v.items) return null; var c = 0, a = 0; Object.values(v.items).forEach(function (e) { if (!e) return; c += Number(e.correct) || 0; a += Number(e.attempts) || 0; }); return a ? { correct: c, attempts: a } : null; } catch (_) { return null; } }
    var F = [
      { name: '単語', href: './topik1-vocabulary', rate: srsRate('topikSrsV1') },
      { name: '文法', href: './topik1-grammar', rate: srsRate('topikGrammarSrsV1') },
      { name: '聞き取り', href: './topik1-listening', rate: stateRate('topikListeningState') },
      { name: '読解', href: './topik1-reading', rate: stateRate('topikReadingState') }
    ];
    var cand = F.filter(function (f) { return f.rate && f.rate.attempts >= 5; });
    if (cand.length < 2) return null;
    cand.sort(function (a, b) { return (a.rate.correct / a.rate.attempts) - (b.rate.correct / b.rate.attempts) || b.rate.attempts - a.rate.attempts; });
    return { name: cand[0].name, href: cand[0].href, pct: Math.round(cand[0].rate.correct / cand[0].rate.attempts * 100), attempts: cand[0].rate.attempts };
  }

  // ---------- 画面表示（ブラウザのみ） ----------
  function fmtDate(key) {
    var d = parseKey(key), w = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
    return (d.getMonth() + 1) + '月' + d.getDate() + '日（' + w + '）';
  }
  function catText(obj, suffix) {
    var parts = [];
    CATS.forEach(function (c) { if (obj[c[0]]) parts.push(c[1] + ' ' + obj[c[0]] + (suffix ? c[2] : '')); });
    return parts.join('・');
  }
  function remText(rem) {
    var parts = [];
    CATS.forEach(function (c) { if (rem[c[0]] > 0) parts.push(c[1] + ' あと' + rem[c[0]] + c[2]); });
    return parts.join('・');
  }

  function init() {
    var chipsEl = document.getElementById('examChips');
    var countEl = document.getElementById('examCount');
    var panel = document.getElementById('planPanel');
    if (!chipsEl || !panel) return;
    var todayKey = keyOf(new Date());
    var saved = null;
    try { saved = localStorage.getItem(TARGET_KEY); } catch (_) {}
    var selected = EXAMS.some(function (e) { return e.date === saved; }) ? saved : null;
    if (!selected) { var next = EXAMS.filter(function (e) { return daysBetween(todayKey, e.date) > 0; })[0]; selected = next ? next.date : EXAMS[EXAMS.length - 1].date; }

    EXAMS.forEach(function (e) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.dataset.date = e.date;
      b.setAttribute('aria-pressed', e.date === selected ? 'true' : 'false');
      b.textContent = e.round + ' ' + fmtDate(e.date) + '（' + e.area + '）';
      b.addEventListener('click', function () {
        selected = e.date;
        try { localStorage.setItem(TARGET_KEY, selected); } catch (_) {}
        chipsEl.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-pressed', c.dataset.date === selected ? 'true' : 'false'); });
        render();
      });
      chipsEl.appendChild(b);
    });

    function render() {
      var exam = EXAMS.filter(function (e) { return e.date === selected; })[0];
      var plan = planCompute({ today: todayKey, examDate: selected, units: readUnits(), weakestField: readWeakestField() });
      countEl.textContent = exam.round + '（' + fmtDate(selected) + '・' + exam.area + '）まで あと' + Math.max(plan.daysLeft, 0) + '日';
      var html = '';
      if (plan.mode === 'past') {
        var nx = EXAMS.filter(function (e) { return daysBetween(todayKey, e.date) > 0; })[0];
        html = '<p class="status">選んだ試験日は過ぎています。' + (nx ? '次の試験は' + nx.round + '（' + fmtDate(nx.date) + '・' + nx.area + '）です。上のボタンから選び直してください。' : '次の日程はまだ発表されていません。') + '</p>';
      } else if (plan.mode === 'done') {
        html = '<p class="status">カリキュラム全9単元は完了しています。あとは模試で仕上げましょう。</p>' +
          '<p class="mock-line">模試：' + plan.mock.kind + 'を' + plan.mock.per + '（期間中 約' + plan.mock.sessions + '回）</p>';
      } else if (plan.mode === 'priority') {
        var f = plan.focus, idx = plan.units.indexOf(f);
        html = '<p class="mode-note"><strong>優先モードです。</strong>残り' + plan.daysLeft + '日で全範囲（あと' + plan.totalWork + '項目）を終えるには1日' + Math.ceil(plan.totalWork / plan.daysLeft) + '項目を超えるペースが必要で、復習の負担も考えると継続が難しいため、このプランでは<strong>全範囲を終える前提にしません</strong>。下の順番で進めてください。</p>' +
          '<ol class="prio-list">' +
          '<li><strong>まず今の単元を仕上げる</strong>：UNIT ' + (idx + 1) + '「' + f.name + '」（' + f.level + '）— ' + remText(f.remaining) + '。1日あたり ' + catText(plan.focusDaily, true) + ' のペースで、試験前日までに終える計算です。</li>' +
          (plan.weakestField ? '<li><strong>いちばん伸ばせる分野を並行して</strong>：' + plan.weakestField.name + '（正答率 ' + plan.weakestField.pct + '%・' + plan.weakestField.attempts + '件の記録から）。<a href="' + plan.weakestField.href + '">' + plan.weakestField.name + 'を練習する →</a></li>' : '') +
          '<li><strong>模試で時間配分を確認</strong>：' + plan.mock.kind + 'を' + plan.mock.per + '（期間中 約' + plan.mock.sessions + '回）。</li>' +
          '<li>余った時間は、カリキュラムの順番どおり次の単元へ進んでください。</li>' +
          '</ol>';
      } else {
        html = '<p class="status">残り<strong>' + plan.daysLeft + '日</strong>で、カリキュラムの残り<strong>' + plan.totalWork + '項目</strong>を進める計画です。</p>' +
          '<p class="daily-line">1日あたりの目安：' + catText(plan.headline, true) + '</p>' +
          '<p class="mock-line">模試：' + plan.mock.kind + 'を' + plan.mock.per + '（期間中 約' + plan.mock.sessions + '回）' + (plan.mock.finalPhase ? '。残り30日を切ったので、本番と同じ100分形式で仕上げます。' : '') + '</p>' +
          '<ul class="unit-list">';
        plan.units.forEach(function (u, i2) {
          if (u.work === 0) {
            html += '<li class="unit-row done"><div class="unit-head"><strong>UNIT ' + (i2 + 1) + '「' + u.name + '」</strong><span class="unit-badge">' + u.level + '</span><span class="unit-state">完了</span></div></li>';
            return;
          }
          html += '<li class="unit-row"><div class="unit-head"><strong>UNIT ' + (i2 + 1) + '「' + u.name + '」</strong><span class="unit-badge">' + u.level + '</span><span class="unit-range">' + fmtDate(u.startKey) + '〜' + fmtDate(u.endKey) + '（' + u.days + '日間）</span></div>' +
            '<p class="unit-rem">' + remText(u.remaining) + (u.grammarReview ? '＋文法 全30項目の総復習' : '') + '</p>' +
            '<p class="unit-daily">1日あたり ' + catText(u.daily, true) + '（最終日は残り分だけ）</p></li>';
        });
        html += '</ul>';
      }
      panel.innerHTML = html;
      panel.hidden = false;
    }
    render();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EXAMS: EXAMS, UNITS: UNITS, CATS: CATS, DAILY_CAP: DAILY_CAP, daysBetween: daysBetween, distribute: distribute, mockCadence: mockCadence, allocDays: allocDays, planCompute: planCompute, unitTotals: unitTotals };
  }
})();
