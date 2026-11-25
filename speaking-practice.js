/* 発音チェック (/speaking-practice)
   旅行会話75フレーズ（speaking-phrases.js）を声に出して練習する。
   お手本TTS → SpeechRecognition で聞き取り → レーベンシュタイン類似度で採点。
   認識が無い端末では MediaRecorder の自己録音モードに切り替わる。
   学習記録への書き込みはしない（このファイルに保存まわりの参照は無い）。 */
(function () {
  'use strict';

  /* ---- 採点（純粋関数。window.TopikSpeakingScore として公開し、単体テストで検証する） ---- */
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
  /* 文字単位の差分。match: 一致 / sub: 置換（お手本の字を赤で、聞き取れた字を title に）/
     miss: 欠落（お手本の字を破線で）/ extra: 余分に聞き取れた字。 */
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
  window.TopikSpeakingScore = {
    normalize: normalize, levenshtein: levenshtein, similarity: similarity,
    diffTokens: diffTokens, scoreBand: scoreBand
  };

  /* ---- 画面 ---- */
  var phrases = window.TopikSpeakingPhrases || [];
  var listEl = document.getElementById('phraseList');
  var countEl = document.getElementById('phraseCount');
  var emptyEl = document.getElementById('emptyList');
  var panel = document.getElementById('practicePanel');
  var modeLabel = document.getElementById('modeLabel');
  var koEl = document.getElementById('practiceKo');
  var jaEl = document.getElementById('practiceJa');
  var playModelBtn = document.getElementById('playModel');
  var speakBtn = document.getElementById('speakBtn');
  var recordRow = document.getElementById('recordRow');
  var recordBtn = document.getElementById('recordBtn');
  var playRecordBtn = document.getElementById('playRecordBtn');
  var recordAudio = document.getElementById('recordAudio');
  var statusEl = document.getElementById('status');
  var resultWrap = document.getElementById('resultWrap');
  var scoreNum = document.getElementById('scoreNum');
  var heardLine = document.getElementById('heardLine');
  var heardText = document.getElementById('heardText');
  var diffWrap = document.getElementById('diffWrap');
  var hoyaEl = document.getElementById('resultHoya');
  var closeBtn = document.getElementById('closePanel');
  if (!listEl || !panel) return;

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var hasRecorder = typeof window.MediaRecorder === 'function' &&
    !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  var mode = SR ? 'recognition' : (hasRecorder ? 'record' : 'read');
  var category = 'すべて';
  var current = null;
  var listening = false, recognizer = null;
  var recording = false, recorder = null, recordChunks = [], recordUrl = null;

  function setStatus(main, next) {
    statusEl.textContent = main || '';
    if (next) {
      var s = document.createElement('span');
      s.className = 'next';
      s.textContent = next;
      statusEl.appendChild(s);
    }
  }

  function renderList() {
    var items = phrases.filter(function (p) {
      return category === 'すべて' || p.category === category;
    });
    listEl.innerHTML = '';
    items.forEach(function (p) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'phrase-btn';
      b.setAttribute('aria-label', p.ja + '（' + p.category + '）の発音練習');
      var ko = document.createElement('span');
      ko.className = 'ko'; ko.lang = 'ko'; ko.textContent = p.ko;
      var ja = document.createElement('span');
      ja.className = 'ja'; ja.textContent = p.ja;
      var cat = document.createElement('span');
      cat.className = 'cat'; cat.textContent = p.category;
      b.appendChild(ko); b.appendChild(ja); b.appendChild(cat);
      b.addEventListener('click', function () { openPhrase(p); });
      li.appendChild(b);
      listEl.appendChild(li);
    });
    countEl.textContent = items.length + '件の表現';
    emptyEl.hidden = items.length > 0;
  }

  document.querySelectorAll('.chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      category = chip.getAttribute('data-category') || 'すべて';
      document.querySelectorAll('.chip').forEach(function (c) {
        c.setAttribute('aria-pressed', String(c === chip));
      });
      renderList();
    });
  });

  function stopAll() {
    if (listening && recognizer) { try { recognizer.abort(); } catch (e) {} }
    listening = false;
    if (recording && recorder) { try { recorder.stop(); } catch (e) {} }
    recording = false;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    speakBtn.disabled = false;
    speakBtn.textContent = '話してみる';
    recordBtn.textContent = '録音する';
  }

  function openPhrase(p) {
    stopAll();
    current = p;
    koEl.textContent = p.ko;
    jaEl.textContent = p.ja;
    resultWrap.hidden = true;
    heardLine.hidden = true;
    recordAudio.hidden = true;
    recordAudio.removeAttribute('src');
    playRecordBtn.disabled = true;
    setStatus('');
    if (mode === 'recognition') {
      modeLabel.textContent = '音声認識モード：話した言葉をブラウザが聞き取って採点します';
      speakBtn.hidden = false;
      recordRow.hidden = true;
    } else if (mode === 'record') {
      modeLabel.textContent = '自己録音モード：この端末では音声認識が使えないため、自分の声を録音してお手本と聞き比べます';
      speakBtn.hidden = true;
      recordRow.hidden = false;
    } else {
      modeLabel.textContent = '音読モード：この端末ではマイクが使えないため、お手本を聞いて音読する練習です';
      speakBtn.hidden = true;
      recordRow.hidden = true;
    }
    panel.hidden = false;
    koEl.focus();
  }

  /* お手本再生：既存ページと同じ TTS パターン（cancel → Utterance、ko-KR、rate .85）。 */
  function playModel() {
    if (!current) return;
    if (!('speechSynthesis' in window)) {
      setStatus('この端末では音声を利用できません。音声なしでも、フレーズを見ながら音読する練習ができます。');
      return;
    }
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(current.ko);
    u.lang = 'ko-KR';
    u.rate = .85;
    u.onerror = function () {
      setStatus('音声を再生できませんでした。端末の音量やマナーモードを確認して、もう一度押してください。');
    };
    window.speechSynthesis.speak(u);
    setStatus('お手本を再生しています。音量・マナーモードも確認してください。');
  }

  function finishListening() {
    listening = false;
    speakBtn.disabled = false;
    speakBtn.textContent = '話してみる';
  }

  function startRecognition() {
    if (!current || !SR) return;
    stopAll();
    setStatus('聞いています。お手本と同じように話してください。');
    speakBtn.disabled = true;
    speakBtn.textContent = '聞いています…';
    listening = true;
    var rec = new SR();
    recognizer = rec;
    rec.lang = 'ko-KR';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = function (event) {
      var transcript = '';
      try { transcript = event.results[0][0].transcript || ''; } catch (e) { transcript = ''; }
      finishListening();
      showScore(transcript);
    };
    rec.onerror = function (event) {
      var err = (event && event.error) || '';
      finishListening();
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        setStatus('マイクの使用が許可されていません。',
          'ブラウザのマイク許可をオンにして、もう一度「話してみる」を押してください。許可しない場合は、お手本を聞いて音読する練習ができます。');
      } else if (err === 'no-speech') {
        setStatus('声が聞き取れませんでした。',
          'もう一度、ゆっくりはっきりと話してみてください。静かな場所だと聞き取りやすくなります。');
      } else if (err === 'audio-capture') {
        setStatus('マイクが見つかりませんでした。',
          'マイク付きのイヤホンをつないでから、もう一度試してください。お手本を聞いて音読する練習もできます。');
      } else if (err === 'network') {
        setStatus('音声認識の通信に失敗しました。',
          '通信環境を確認して、もう一度試してください。電波の良い場所だと成功しやすくなります。');
      } else if (err === 'aborted') {
        setStatus('聞き取りを止めました。', 'もう一度「話してみる」を押すと、聞き取りを始めます。');
      } else {
        setStatus('聞き取りできませんでした。',
          'もう一度「話してみる」を押して試してください。うまくいかない場合は、お手本を聞いて音読する練習ができます。');
      }
    };
    rec.onend = function () { if (listening) finishListening(); };
    try {
      rec.start();
    } catch (e) {
      finishListening();
      setStatus('聞き取りを開始できませんでした。', 'もう一度「話してみる」を押して試してください。');
    }
  }

  function showScore(transcript) {
    if (!current) return;
    var score = similarity(current.ko, transcript);
    scoreNum.textContent = String(score);
    heardText.textContent = transcript || '（聞き取れませんでした）';
    heardLine.hidden = !transcript;
    diffWrap.innerHTML = '';
    diffTokens(current.ko, transcript).forEach(function (tok) {
      var s = document.createElement('span');
      if (tok.type === 'match') { s.className = 'd-ok'; s.textContent = tok.ch; }
      else if (tok.type === 'sub') {
        s.className = 'd-sub'; s.textContent = tok.ch;
        s.title = '「' + tok.heard + '」と聞き取れました';
      } else if (tok.type === 'miss') { s.className = 'd-miss'; s.textContent = tok.ch; }
      else {
        s.className = 'd-extra'; s.textContent = tok.ch;
        s.title = '余分に聞き取れた音です';
      }
      diffWrap.appendChild(s);
    });
    if (hoyaEl && window.ResultViz && typeof window.ResultViz.hoya === 'function') {
      window.ResultViz.hoya(hoyaEl, scoreBand(score));
    }
    resultWrap.hidden = false;
    setStatus(score >= 80 ? 'よくできました。お手本にとても近い発音です。'
      : score >= 50 ? 'だいたい伝わる発音です。赤い字と破線のところを、もう一度お手本で確認してみましょう。'
      : 'まだ聞き取りにくいところがあります。お手本をもう一度聞いて、ゆっくり話してみましょう。');
  }

  /* 自己録音モード：MediaRecorder で自分の声を録り、お手本と聞き比べる。 */
  function startRecording() {
    if (!current) return;
    stopAll();
    setStatus('録音しています。お手本と同じように話してください。終わったら「録音を止める」を押してください。');
    recordBtn.disabled = true;
    recordBtn.textContent = '録音中…';
    recordChunks = [];
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var rec = new MediaRecorder(stream);
      recorder = rec;
      rec.ondataavailable = function (e) { if (e.data) recordChunks.push(e.data); };
      rec.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        var blob = new Blob(recordChunks, { type: 'audio/webm' });
        if (recordUrl) URL.revokeObjectURL(recordUrl);
        recordUrl = URL.createObjectURL(blob);
        recordAudio.src = recordUrl;
        recordAudio.hidden = false;
        playRecordBtn.disabled = false;
        recordBtn.disabled = false;
        recordBtn.textContent = 'もう一度録音する';
        setStatus('録音しました。「自分の声を聞く」で聞き比べができます。',
          'お手本ももう一度聞いて、ちがうところを確認してみましょう。');
      };
      rec.start();
      recording = true;
      recordBtn.disabled = false;
      recordBtn.textContent = '録音を止める';
    }).catch(function (err) {
      recordBtn.disabled = false;
      recordBtn.textContent = '録音する';
      var name = (err && err.name) || '';
      if (name === 'NotAllowedError') {
        setStatus('マイクの使用が許可されていません。',
          'ブラウザのマイク許可をオンにして、もう一度試してください。許可しない場合は、お手本を聞いて音読する練習ができます。');
      } else if (name === 'NotFoundError') {
        setStatus('マイクが見つかりませんでした。',
          'マイク付きのイヤホンをつないでから、もう一度試してください。お手本を聞いて音読する練習もできます。');
      } else if (name === 'NotReadableError') {
        setStatus('マイクが他のアプリで使われています。', '他のアプリを閉じてから、もう一度試してください。');
      } else {
        setStatus('録音を開始できませんでした。', 'もう一度試してください。うまくいかない場合は、お手本を聞いて音読する練習ができます。');
      }
    });
  }
  function stopRecording() {
    if (recorder && recording) {
      try { recorder.stop(); } catch (e) {}
    }
    recording = false;
  }

  playModelBtn.addEventListener('click', playModel);
  speakBtn.addEventListener('click', startRecognition);
  recordBtn.addEventListener('click', function () {
    if (recording) stopRecording(); else startRecording();
  });
  playRecordBtn.addEventListener('click', function () {
    if (!recordAudio.src) return;
    var p = recordAudio.play();
    if (p && typeof p.catch === 'function') {
      p.catch(function () {
        setStatus('自分の声を再生できませんでした。もう一度録音してください。');
      });
    }
  });
  closeBtn.addEventListener('click', function () {
    stopAll();
    panel.hidden = true;
    current = null;
  });

  renderList();
})();
