/* シャドーイング (/shadowing)
   お手本TTSを聞いて、後を追って声に出し、自分の録音と聞き比べる反復練習。採点はしない
   （発音の採点は /speaking-practice の役割）。データは dictation-items.js を共用する。
   録音はメモリ上だけに置き、学習記録への書き込みはしない
   （このファイルに保存まわりの参照は無い）。 */
(function () {
  'use strict';

  /* ---- 純粋関数（単体テストで検証する） ---- */
  var RATE_NORMAL = 0.9, RATE_SLOW = 0.7;
  function tierItems(data, tier) {
    return (data && data[tier]) || [];
  }
  /* 前後移動。範囲外には出ず、端ではその場にとどまる。空リストでは -1。 */
  function moveIndex(pos, delta, length) {
    if (!length || length <= 0) return -1;
    var n = pos + delta;
    if (n < 0) return 0;
    if (n > length - 1) return length - 1;
    return n;
  }
  function canPrev(pos) { return pos > 0; }
  function canNext(pos, length) { return pos >= 0 && pos < length - 1; }
  /* 項目ごとの練習回数（メモリ上のみ）。id をキーに数える。 */
  function bumpCount(counts, id) {
    counts[id] = (counts[id] || 0) + 1;
    return counts[id];
  }
  function countOf(counts, id) { return counts[id] || 0; }
  window.TopikShadowingCore = {
    RATE_NORMAL: RATE_NORMAL, RATE_SLOW: RATE_SLOW,
    tierItems: tierItems, moveIndex: moveIndex,
    canPrev: canPrev, canNext: canNext,
    bumpCount: bumpCount, countOf: countOf
  };

  /* ---- 画面 ---- */
  var data = window.TopikDictationItems || { sentences: [], phrases: [] };
  var listEl = document.getElementById('itemList');
  var countEl = document.getElementById('tierCount');
  var emptyEl = document.getElementById('emptyList');
  var panel = document.getElementById('practicePanel');
  var counterEl = document.getElementById('itemCounter');
  var tierNameEl = document.getElementById('tierName');
  var koEl = document.getElementById('practiceKo');
  var jaEl = document.getElementById('practiceJa');
  var toggleKoBtn = document.getElementById('toggleKo');
  var playModelBtn = document.getElementById('playModel');
  var playSlowBtn = document.getElementById('playSlow');
  var recordBtn = document.getElementById('recordBtn');
  var playRecordBtn = document.getElementById('playRecordBtn');
  var compareBtn = document.getElementById('compareBtn');
  var recordAudio = document.getElementById('recordAudio');
  var repeatEl = document.getElementById('repeatLine');
  var statusEl = document.getElementById('status');
  var hoyaEl = document.getElementById('panelHoya');
  var prevBtn = document.getElementById('prevBtn');
  var nextBtn = document.getElementById('nextBtn');
  var closeBtn = document.getElementById('closePanel');
  if (!listEl || !panel) return;

  var TIER_LABEL = {
    sentences: '聞き取り問題の文 ',
    phrases: '旅行会話のフレーズ '
  };
  var TIER_NAME = {
    sentences: '文章（聞き取り）',
    phrases: '短文（旅行会話）'
  };
  var hasRecorder = typeof window.MediaRecorder === 'function' &&
    !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  var tier = 'sentences';
  var pos = -1;
  var current = null;
  var koVisible = true;
  var counts = {};   /* id -> このセッションで録音を終えた回数 */
  var takes = {};    /* id -> 自分の録音の ObjectURL（メモリ上のみ） */
  var recording = false, recorder = null, recordChunks = [], recordItem = null;

  function setStatus(main, next) {
    statusEl.textContent = main || '';
    if (next) {
      var s = document.createElement('span');
      s.className = 'next';
      s.textContent = next;
      statusEl.appendChild(s);
    }
  }

  function items() { return tierItems(data, tier); }

  function renderList() {
    var list = items();
    listEl.innerHTML = '';
    list.forEach(function (item, i) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'item-btn';
      b.setAttribute('aria-label', item.ja + 'のシャドーイング練習');
      var ko = document.createElement('span');
      ko.className = 'ko'; ko.lang = 'ko'; ko.textContent = item.ko;
      var ja = document.createElement('span');
      ja.className = 'ja'; ja.textContent = item.ja;
      b.appendChild(ko); b.appendChild(ja);
      b.addEventListener('click', function () { openItem(i); });
      li.appendChild(b);
      listEl.appendChild(li);
    });
    countEl.textContent = TIER_LABEL[tier] + list.length + '件';
    emptyEl.hidden = list.length > 0;
  }

  document.querySelectorAll('.chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      tier = chip.getAttribute('data-tier') || 'sentences';
      document.querySelectorAll('.chip').forEach(function (c) {
        c.setAttribute('aria-pressed', String(c === chip));
      });
      closePanel();
      renderList();
    });
  });

  function stopAll() {
    if (recording && recorder) { try { recorder.stop(); } catch (e) {} }
    recording = false;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (recordAudio) { try { recordAudio.pause(); } catch (e) {} }
    recordBtn.disabled = false;
    recordBtn.textContent = '録音する';
    recordBtn.classList.remove('recording');
  }

  function applyKoVisibility() {
    koEl.hidden = !koVisible;
    toggleKoBtn.textContent = koVisible ? '韓国語を隠す' : '韓国語を表示する';
    toggleKoBtn.setAttribute('aria-pressed', String(!koVisible));
  }

  function renderPanel() {
    if (!current) return;
    counterEl.textContent = (pos + 1) + ' / ' + items().length;
    tierNameEl.textContent = TIER_NAME[tier];
    koEl.textContent = current.ko;
    jaEl.textContent = current.ja;
    applyKoVisibility();
    var hasTake = !!takes[current.id];
    recordAudio.hidden = !hasTake;
    if (hasTake) recordAudio.src = takes[current.id];
    else recordAudio.removeAttribute('src');
    playRecordBtn.disabled = !hasTake;
    compareBtn.disabled = !hasTake;
    prevBtn.disabled = !canPrev(pos);
    nextBtn.disabled = !canNext(pos, items().length);
    renderRepeat();
    if (hoyaEl) hoyaEl.hidden = true;
  }

  function renderRepeat() {
    var n = current ? countOf(counts, current.id) : 0;
    repeatEl.textContent = n > 0
      ? 'この文は ' + n + '回練習しました（このページを開いている間だけの数です）'
      : 'まだ録音していません。お手本を聞いて、録音してみましょう。';
  }

  function openItem(index) {
    var list = items();
    if (index < 0 || index >= list.length) return;
    stopAll();
    pos = index;
    current = list[index];
    setStatus('');
    renderPanel();
    panel.hidden = false;
    panel.scrollIntoView({ block: 'start' });
    koEl.focus();
  }

  function closePanel() {
    stopAll();
    panel.hidden = true;
    pos = -1;
    current = null;
  }

  /* お手本再生：既存ページと同じ TTS パターン（cancel → Utterance、ko-KR）。
     練習用なので回数制限は無く、押すたびに再生できる。 */
  function speakModel(rate, after) {
    if (!current) return false;
    if (!('speechSynthesis' in window)) {
      setStatus('この端末では音声を利用できません。音声なしでも、文を見ながら音読する練習ができます。');
      return false;
    }
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(current.ko);
    u.lang = 'ko-KR';
    u.rate = rate;
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      if (typeof after === 'function') after();
    }
    u.onend = finish;
    u.onerror = function () {
      setStatus('音声を再生できませんでした。端末の音量やマナーモードを確認して、もう一度押してください。');
      finish();
    };
    window.speechSynthesis.speak(u);
    return true;
  }

  function playModel(rate) {
    if (speakModel(rate)) {
      setStatus(rate <= RATE_SLOW
        ? 'ゆっくり再生しています。音のつながりを確かめましょう。'
        : 'お手本を再生しています。聞いたら、すぐ後を追って声に出しましょう。');
    }
  }

  /* 聞き比べ：お手本を再生し、終わったら続けて自分の録音を再生する。 */
  function compare() {
    if (!current || !takes[current.id]) return;
    function playMine() {
      recordAudio.currentTime = 0;
      var p = recordAudio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(function () {
          setStatus('自分の録音を再生できませんでした。もう一度録音してください。');
        });
      }
    }
    if (speakModel(RATE_NORMAL, playMine)) {
      setStatus('聞き比べ中です。お手本の後に、あなたの録音が続きます。');
    } else {
      playMine();
    }
  }

  /* 録音：MediaRecorder で自分の声を録る。speaking-practice の自己録音と同じ流れ。
     録り直すと、その文の前の録音は新しい録音に置き換わる。 */
  function startRecording() {
    if (!current || !hasRecorder) {
      setStatus('この端末では録音が使えません。', 'お手本を聞いて声に出す練習は、そのまま続けられます。');
      return;
    }
    stopAll();
    var item = current;
    recordItem = item;
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
        recording = false;
        recordBtn.disabled = false;
        recordBtn.textContent = 'もう一度録音する';
        recordBtn.classList.remove('recording');
        if (!recordChunks.length) return;
        var blob = new Blob(recordChunks, { type: 'audio/webm' });
        if (takes[item.id]) URL.revokeObjectURL(takes[item.id]);
        takes[item.id] = URL.createObjectURL(blob);
        var n = bumpCount(counts, item.id);
        if (current && current.id === item.id) {
          renderPanel();
          setStatus('録音しました（' + n + '回目）。「聞き比べ」でお手本と続けて聞いてみましょう。');
          if (hoyaEl && window.ResultViz && typeof window.ResultViz.hoya === 'function') {
            window.ResultViz.hoya(hoyaEl, n >= 3 ? 'great' : 'good');
          }
        }
      };
      rec.start();
      recording = true;
      recordBtn.disabled = false;
      recordBtn.textContent = '録音を止める';
      recordBtn.classList.add('recording');
    }).catch(function (err) {
      recordBtn.disabled = false;
      recordBtn.textContent = '録音する';
      var name = (err && err.name) || '';
      if (name === 'NotAllowedError') {
        setStatus('マイクの使用が許可されていません。',
          'ブラウザのマイク許可をオンにして、もう一度試してください。許可しない場合は、お手本を聞いて声に出す練習ができます。');
      } else if (name === 'NotFoundError') {
        setStatus('マイクが見つかりませんでした。',
          'マイク付きのイヤホンをつないでから、もう一度試してください。お手本を聞いて声に出す練習もできます。');
      } else if (name === 'NotReadableError') {
        setStatus('マイクが他のアプリで使われています。', '他のアプリを閉じてから、もう一度試してください。');
      } else {
        setStatus('録音を開始できませんでした。', 'もう一度試してください。うまくいかない場合は、お手本を聞いて声に出す練習ができます。');
      }
    });
  }
  function stopRecording() {
    if (recorder && recording) {
      try { recorder.stop(); } catch (e) {}
    }
    recording = false;
  }

  toggleKoBtn.addEventListener('click', function () {
    koVisible = !koVisible;
    applyKoVisibility();
  });
  playModelBtn.addEventListener('click', function () { playModel(RATE_NORMAL); });
  playSlowBtn.addEventListener('click', function () { playModel(RATE_SLOW); });
  recordBtn.addEventListener('click', function () {
    if (recording) stopRecording(); else startRecording();
  });
  playRecordBtn.addEventListener('click', function () {
    if (!recordAudio.src) return;
    recordAudio.currentTime = 0;
    var p = recordAudio.play();
    if (p && typeof p.catch === 'function') {
      p.catch(function () {
        setStatus('自分の録音を再生できませんでした。もう一度録音してください。');
      });
    }
  });
  compareBtn.addEventListener('click', compare);
  prevBtn.addEventListener('click', function () {
    if (canPrev(pos)) openItem(moveIndex(pos, -1, items().length));
  });
  nextBtn.addEventListener('click', function () {
    if (canNext(pos, items().length)) openItem(moveIndex(pos, 1, items().length));
  });
  closeBtn.addEventListener('click', closePanel);

  renderList();
})();
