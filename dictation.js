/* ディクテーション (/dictation)
   聞こえた韓国語をそのまま書き取る練習。1回5問。
   音声は TTS（ko-KR）で何度でも再生でき、ゆっくり再生もある（本番モードと違い練習用）。
   採点は normalize → レーベンシュタイン類似度 → 文字単位の差分表示。
   学習記録への書き込みはしない（聞き取りの4択統計とは性質が違うため、
   聞き取りの学習記録にも書かない。このファイルに保存まわりの参照は無い）。 */
(function () {
  'use strict';

  /* ---- 採点（純粋関数。speaking-practice.js の TopikSpeakingScore と同じ方式の複写。
         片方を直したら、もう片方もそろえること） ---- */
  function normalize(text) {
    return String(text == null ? '' : text).replace(/[^\p{L}\p{N}]/gu, '');
  }
  function levenshtein(a, b) {
    var m = a.length, n = b.length, i, j;
    if (m === 0) return n;
    if (n === 0) return m;
    var prev = [], cur = [], tmp;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur[0] = i;
      for (j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      tmp = prev; prev = cur; cur = tmp;
    }
    return prev[n];
  }
  function similarity(target, heard) {
    var t = normalize(target), h = normalize(heard);
    if (!t || !h) return 0;
    var d = levenshtein(t, h), m = Math.max(t.length, h.length);
    return Math.max(0, Math.min(100, Math.round((1 - d / m) * 100)));
  }
  /* 文字単位の差分。match: 一致 / sub: 置換（正解の字を赤で、書いた字を title に）/
     miss: 欠落（正解の字を破線で）/ extra: 余分に書いた字。 */
  function diffTokens(target, heard) {
    var t = normalize(target), h = normalize(heard);
    var n = t.length, m = h.length, i, j;
    var dp = [];
    for (i = 0; i <= n; i++) { dp[i] = []; dp[i][0] = i; }
    for (j = 0; j <= m; j++) dp[0][j] = j;
    for (i = 1; i <= n; i++) {
      for (j = 1; j <= m; j++) {
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (t[i - 1] === h[j - 1] ? 0 : 1));
      }
    }
    var tokens = [];
    i = n; j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && t[i - 1] === h[j - 1]) {
        tokens.unshift({ type: 'match', ch: t[i - 1] }); i--; j--;
      } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
        tokens.unshift({ type: 'sub', ch: t[i - 1], heard: h[j - 1] }); i--; j--;
      } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
        tokens.unshift({ type: 'miss', ch: t[i - 1] }); i--;
      } else if (j > 0) {
        tokens.unshift({ type: 'extra', ch: h[j - 1] }); j--;
      } else {
        break;
      }
    }
    return tokens;
  }
  /* ResultViz.hoya の great/good/low は、サイト内の正答率の慣習（80以上/50以上）と同じ境目。 */
  function scoreBand(score) {
    return score >= 80 ? 'great' : score >= 50 ? 'good' : 'low';
  }
  window.TopikDictationScore = {
    normalize: normalize, levenshtein: levenshtein, similarity: similarity,
    diffTokens: diffTokens, scoreBand: scoreBand
  };

  /* ---- セッションの純粋関数（単体テストで検証する） ---- */
  var SESSION_SIZE = 5;
  var RATE_NORMAL = 0.9, RATE_SLOW = 0.7;
  function drawItems(items, count, rng) {
    var rand = typeof rng === 'function' ? rng : Math.random;
    var pool = items.slice();
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    return pool.slice(0, Math.min(count, pool.length));
  }
  function averageScore(results) {
    if (!results.length) return 0;
    var sum = 0;
    results.forEach(function (r) { sum += r.score; });
    return Math.round(sum / results.length);
  }
  window.TopikDictationCore = {
    SESSION_SIZE: SESSION_SIZE, RATE_NORMAL: RATE_NORMAL, RATE_SLOW: RATE_SLOW,
    drawItems: drawItems, averageScore: averageScore
  };

  /* ---- 画面 ---- */
  var data = window.TopikDictationItems || { sentences: [], phrases: [] };
  var tierCount = document.getElementById('tierCount');
  var startBtn = document.getElementById('startBtn');
  var quizPanel = document.getElementById('quizPanel');
  var counterEl = document.getElementById('quizCounter');
  var barEl = document.getElementById('quizBar');
  var playBtn = document.getElementById('playBtn');
  var playSlowBtn = document.getElementById('playSlowBtn');
  var input = document.getElementById('answerInput');
  var submitBtn = document.getElementById('submitBtn');
  var statusEl = document.getElementById('status');
  var itemResult = document.getElementById('itemResult');
  var scoreNum = document.getElementById('scoreNum');
  var diffWrap = document.getElementById('diffWrap');
  var correctKo = document.getElementById('correctKo');
  var correctJa = document.getElementById('correctJa');
  var yourAnswerLine = document.getElementById('yourAnswerLine');
  var yourAnswer = document.getElementById('yourAnswer');
  var nextBtn = document.getElementById('nextBtn');
  var resultPanel = document.getElementById('resultPanel');
  var avgNum = document.getElementById('avgNum');
  var reviewList = document.getElementById('reviewList');
  var hoyaEl = document.getElementById('resultHoya');
  var retryBtn = document.getElementById('retryBtn');
  var changeTierBtn = document.getElementById('changeTierBtn');
  if (!quizPanel || !input) return;

  var TIER_LABEL = {
    sentences: '聞き取り問題の文 ',
    phrases: '旅行会話のフレーズ '
  };
  var tier = 'sentences';
  var queue = [], pos = 0, results = [], answered = false;

  function setStatus(msg) { statusEl.textContent = msg || ''; }

  function tierItems() { return data[tier] || []; }

  function renderTierCount() {
    tierCount.textContent = TIER_LABEL[tier] + tierItems().length + '件から5問出題します';
  }

  document.querySelectorAll('.chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      tier = chip.getAttribute('data-tier') || 'sentences';
      document.querySelectorAll('.chip').forEach(function (c) {
        c.setAttribute('aria-pressed', String(c === chip));
      });
      renderTierCount();
    });
  });

  /* 音声再生：既存ページと同じ TTS パターン（cancel → Utterance、ko-KR）。
     練習用なので回数制限は無く、押すたびに再生できる。 */
  function play(rate) {
    var item = queue[pos];
    if (!item) return;
    if (!('speechSynthesis' in window)) {
      setStatus('この端末では音声を利用できません。音声なしでは練習できないため、音声が使える端末で試してください。');
      return;
    }
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(item.ko);
    u.lang = 'ko-KR';
    u.rate = rate;
    u.onerror = function () {
      setStatus('音声を再生できませんでした。端末の音量やマナーモードを確認して、もう一度押してください。');
    };
    window.speechSynthesis.speak(u);
    setStatus(rate <= RATE_SLOW ? 'ゆっくり再生しています。' : '再生しています。聞こえた文を入力してください。');
  }

  function startSession() {
    queue = drawItems(tierItems(), SESSION_SIZE);
    pos = 0;
    results = [];
    resultPanel.hidden = true;
    quizPanel.hidden = false;
    renderItem();
    quizPanel.scrollIntoView({ block: 'start' });
  }

  function renderItem() {
    answered = false;
    counterEl.textContent = (pos + 1) + ' / ' + queue.length;
    barEl.style.width = (queue.length ? (pos / queue.length) * 100 : 0) + '%';
    input.value = '';
    input.disabled = false;
    submitBtn.disabled = false;
    itemResult.hidden = true;
    setStatus('「聞く」を押して、聞こえた文を入力してください。');
    input.focus();
  }

  function submit() {
    if (answered || !queue[pos]) return;
    answered = true;
    var item = queue[pos];
    var answer = input.value;
    var score = similarity(item.ko, answer);
    results.push({ item: item, answer: answer, score: score });
    scoreNum.textContent = String(score);
    diffWrap.innerHTML = '';
    diffTokens(item.ko, answer).forEach(function (tok) {
      var s = document.createElement('span');
      if (tok.type === 'match') { s.className = 'd-ok'; s.textContent = tok.ch; }
      else if (tok.type === 'sub') {
        s.className = 'd-sub'; s.textContent = tok.ch;
        s.title = '「' + tok.heard + '」と書きました';
      } else if (tok.type === 'miss') { s.className = 'd-miss'; s.textContent = tok.ch; }
      else {
        s.className = 'd-extra'; s.textContent = tok.ch;
        s.title = '余分に書いた音です';
      }
      diffWrap.appendChild(s);
    });
    correctKo.textContent = item.ko;
    correctJa.textContent = item.ja;
    yourAnswer.textContent = answer || '（無回答）';
    yourAnswerLine.hidden = false;
    nextBtn.textContent = pos === queue.length - 1 ? '結果を見る' : '次の問題へ';
    itemResult.hidden = false;
    input.disabled = true;
    submitBtn.disabled = true;
    setStatus(score >= 80 ? 'よく聞き取れました。'
      : score >= 50 ? 'だいたい聞き取れています。赤い字と破線のところを確認しましょう。'
      : 'まだ聞き取りにくいところがあります。「聞く」でもう一度確認しましょう。');
  }

  function showResult() {
    quizPanel.hidden = true;
    var avg = averageScore(results);
    avgNum.textContent = String(avg);
    reviewList.innerHTML = '';
    results.forEach(function (r) {
      var li = document.createElement('li');
      var head = document.createElement('div');
      head.className = 'review-head';
      var ko = document.createElement('span');
      ko.className = 'r-ko'; ko.lang = 'ko'; ko.textContent = r.item.ko;
      var sc = document.createElement('span');
      sc.className = 'r-score'; sc.textContent = r.score + '点';
      head.appendChild(ko); head.appendChild(sc);
      var ja = document.createElement('div');
      ja.className = 'r-ja'; ja.textContent = r.item.ja;
      var your = document.createElement('div');
      your.className = 'r-your';
      your.appendChild(document.createTextNode('あなたの答え：'));
      var q = document.createElement('q');
      q.lang = 'ko'; q.textContent = r.answer || '（無回答）';
      your.appendChild(q);
      li.appendChild(head); li.appendChild(ja); li.appendChild(your);
      reviewList.appendChild(li);
    });
    if (hoyaEl && window.ResultViz && typeof window.ResultViz.hoya === 'function') {
      window.ResultViz.hoya(hoyaEl, scoreBand(avg));
    }
    resultPanel.hidden = false;
    resultPanel.scrollIntoView({ block: 'start' });
  }

  startBtn.addEventListener('click', startSession);
  playBtn.addEventListener('click', function () { play(RATE_NORMAL); });
  playSlowBtn.addEventListener('click', function () { play(RATE_SLOW); });
  submitBtn.addEventListener('click', submit);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  });
  nextBtn.addEventListener('click', function () {
    if (pos < queue.length - 1) { pos++; renderItem(); }
    else showResult();
  });
  retryBtn.addEventListener('click', startSession);
  changeTierBtn.addEventListener('click', function () {
    resultPanel.hidden = true;
    startBtn.scrollIntoView({ block: 'center' });
    startBtn.focus();
  });

  renderTierCount();
})();
