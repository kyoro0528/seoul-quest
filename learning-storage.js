(function () {
  'use strict';

  const DB_NAME = 'topik-study-storage';
  const DB_VERSION = 1;
  const OBJECT_STORE = 'snapshots';
  const SNAPSHOT_KEY = 'learning-data';
  const BACKUP_VERSION = 3;
  const EXACT_KEYS = new Set([
    'sqWrong', 'studySeconds', 'studyByDay', 'studyCount', 'streak', 'last',
    'topikVocabState', 'topikVocabStateBackup', 'topikGrammarMastered',
    'topikListeningWrong', 'topikReadingWrong', 'topikPracticeWrong',
    'topikPracticeStats', 'topikDailyHistory', 'topikActivityStats', 'topikExamResults', 'topikSrsV1', 'topikGrammarSrsV1', 'topikListeningState', 'topikReadingState', 'topikSyncMeta'
  ]);

  function isLearningKey(key) {
    return EXACT_KEYS.has(key) || key.startsWith('best_');
  }

  function collect() {
    const items = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && isLearningKey(key)) items[key] = localStorage.getItem(key);
      }
    } catch (error) {
      console.warn('学習データを読み取れませんでした', error);
      throw error;
    }
    return items;
  }

  function hasMeaningfulData(items) {
    return Object.entries(items || {}).some(([key, value]) => {
      if (!value) return false;
      if (key === 'topikSyncMeta') return false;
      if (key.startsWith('best_')) return Number(value) > 0;
      if (['studySeconds', 'studyCount', 'streak'].includes(key)) return Number(value) > 0;
      if (key === 'last') return Boolean(value);
      try {
        const parsed = JSON.parse(value);
        const data = parsed && parsed.data ? parsed.data : parsed;
        if (Array.isArray(data)) return data.length > 0;
        if (!data || typeof data !== 'object') return false;
        if (key === 'topikVocabState' || key === 'topikVocabStateBackup') {
          return Object.keys(data.words || {}).length > 0 ||
            Object.keys(data.sessions || {}).length > 0 ||
            Object.keys(data.history || {}).length > 0 ||
            Boolean(data.streak && data.streak.count);
        }
        if (key === 'topikSrsV1' || key === 'topikGrammarSrsV1' || key === 'topikListeningState' || key === 'topikReadingState') {
          return Object.keys(data.items || {}).length > 0;
        }
        return Object.keys(data).length > 0;
      } catch (_) {
        return value !== '0' && value !== '[]' && value !== '{}';
      }
    });
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return resolve(null);
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(OBJECT_STORE)) db.createObjectStore(OBJECT_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('保存データベースを開けませんでした'));
    });
  }

  async function readSnapshot() {
    const db = await openDatabase();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const request = db.transaction(OBJECT_STORE, 'readonly').objectStore(OBJECT_STORE).get(SNAPSHOT_KEY);
      request.onsuccess = () => { db.close(); resolve(request.result || null); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  }

  async function writeSnapshot(items) {
    const db = await openDatabase();
    if (!db) return;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OBJECT_STORE, 'readwrite');
      tx.objectStore(OBJECT_STORE).put({ version: BACKUP_VERSION, savedAt: Date.now(), items }, SNAPSHOT_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('保存処理が中断されました')); };
    });
  }

  async function deleteSnapshot() {
    const db = await openDatabase();
    if (!db) return;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OBJECT_STORE, 'readwrite');
      tx.objectStore(OBJECT_STORE).delete(SNAPSHOT_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('保存処理が中断されました')); };
    });
  }

  let writes = Promise.resolve();
  let booting = true;
  function reportFailure(message) {
    const show = () => {
      let notice = document.getElementById('learning-save-error');
      if (!notice) {
        notice = document.createElement('p');
        notice.id = 'learning-save-error';
        notice.setAttribute('role', 'alert');
        notice.style.cssText = 'position:fixed;z-index:10000;bottom:12px;left:12px;right:12px;padding:16px;background:#fff1f1;color:#8c2020;border:2px solid #c33;border-radius:10px;font:14px/1.6 sans-serif';
        document.body.appendChild(notice);
      }
      notice.textContent = message || '学習記録を保存できませんでした。画面を閉じず、バックアップを書き出してください。';
    };
    if (document.body) show();
    else document.addEventListener('DOMContentLoaded', show, { once: true });
  }

  async function syncNow() {
    if (booting) return collect();
    const items = collect();
    const task = writes.catch(() => {}).then(() => writeSnapshot(items));
    writes = task;
    await task;
    return items;
  }

  async function createBackup() {
    await ready;
    let items;
    try { items = await syncNow(); }
    catch (_) { items = collect(); }
    return {
      app: 'TOPIK Study',
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      storage: items
    };
  }

  function backupItems(payload) {
    if (payload && payload.storage && typeof payload.storage === 'object') return payload.storage;
    const data = payload && payload.data ? payload.data : payload;
    if (data && typeof data === 'object' && data.words && data.sessions) {
      const value = JSON.stringify(data);
      return {
        topikVocabState: value,
        topikVocabStateBackup: JSON.stringify({
          version: Number(payload && payload.version) || 2,
          createdAt: Date.now(),
          data
        })
      };
    }
    throw new Error('対応していないバックアップ形式です');
  }

  function validateBackupItems(payload) {
    if (payload && payload.app && !['TOPIK Study', 'TOPIK I 単語トレーニング'].includes(payload.app)) {
      throw new Error('TOPIK Studyのバックアップを選んでください');
    }
    const raw = backupItems(payload), items = {};
    if (Array.isArray(raw)) throw new Error('バックアップ形式が不正です');
    for (const [key, value] of Object.entries(raw)) {
      if (!isLearningKey(key)) continue;
      if (typeof value !== 'string') throw new Error('保存データの形式が不正です');
      if (key === 'last') {
        if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('学習日が不正です');
      } else if (key.startsWith('best_') || ['studySeconds', 'studyCount', 'streak'].includes(key)) {
        if (!value.trim() || !Number.isFinite(Number(value)) || Number(value) < 0) throw new Error('学習数値が不正です');
      } else {
        const data = JSON.parse(value);
        const arrays = ['sqWrong', 'topikGrammarMastered', 'topikListeningWrong', 'topikReadingWrong', 'topikPracticeWrong'];
        if (arrays.includes(key)) {
          if (!Array.isArray(data)) throw new Error('問題履歴の形式が不正です');
        } else {
          if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('学習記録の形式が不正です');
          if (key === 'topikExamResults' && !Array.isArray(data.records)) throw new Error('模試結果の形式が不正です');
          if (key === 'topikVocabState' || key === 'topikVocabStateBackup') {
            const vocab = data.data || data;
            if (!vocab.words || typeof vocab.words !== 'object' || Array.isArray(vocab.words) ||
                !vocab.sessions || typeof vocab.sessions !== 'object' || Array.isArray(vocab.sessions)) throw new Error('単語記録の形式が不正です');
          }
        }
      }
      items[key] = value;
    }
    if (!Object.keys(items).length) throw new Error('復元できる学習記録がありません');
    return items;
  }

  async function importBackup(payload) {
    await ready;
    const items = validateBackupItems(payload);
    await writes.catch(() => {});
    const previous = {}, changed = [];
    try {
      for (const [key, value] of Object.entries(items)) {
        previous[key] = localStorage.getItem(key);
        localStorage.setItem(key, value);
        changed.push(key);
      }
    } catch (error) {
      for (const key of changed.reverse()) {
        try {
          if (previous[key] === null) localStorage.removeItem(key);
          else localStorage.setItem(key, previous[key]);
        } catch (_) { reportFailure('復元を完了できませんでした。画面を閉じず、元のバックアップを保管してください。'); }
      }
      throw error;
    }
    // Primary storage has succeeded; reserve-storage failure must not claim that import failed.
    try { await syncNow(); }
    catch (_) { reportFailure('学習記録は復元しましたが、予備保存に失敗しました。バックアップを保管してください。'); }
  }

  async function clearAll() {
    await ready;
    await writes.catch(() => {});
    for (const key of Object.keys(collect())) localStorage.removeItem(key);
    await deleteSnapshot();
  }

  function isStandalone() {
    return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  }

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (_) { return fallback; }
  }

  function summary() {
    const vocabRaw = readJSON('topikVocabState', readJSON('topikVocabStateBackup', {}));
    const vocab = vocabRaw.data || vocabRaw;
    const activity = readJSON('topikActivityStats', {});
    const days = { ...readJSON('studyByDay', {}) };
    let answers = Number(localStorage.getItem('studyCount')) || 0;
    answers += Object.values(vocab.words || {}).reduce((n, w) => n + (Number(w.correct) || 0) + (Number(w.wrong) || 0), 0);
    for (const [day, item] of Object.entries(activity)) {
      answers += Number(item.answers) || 0;
      days[day] = (Number(days[day]) || 0) + (Number(item.seconds) || 0);
    }
    for (const [day, item] of Object.entries(vocab.history || {})) {
      days[day] = (Number(days[day]) || 0) + (Number(item.seconds) || 0);
    }
    const dates = new Set([
      ...Object.keys(vocab.history || {}), ...Object.keys(activity),
      ...Object.keys(readJSON('studyByDay', {})),
      localStorage.getItem('last'), vocab.streak && vocab.streak.last
    ].filter(Boolean));
    const dayKey = d => d.toLocaleDateString('sv-SE');
    const cursor = new Date();
    cursor.setHours(12, 0, 0, 0);
    if (!dates.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (dates.has(dayKey(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }
    // Preserve historical streaks from before day-by-day recording was available.
    const today = dayKey(new Date()), yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if ([today, dayKey(yesterday)].includes(localStorage.getItem('last'))) streak = Math.max(streak, Number(localStorage.getItem('streak')) || 0);
    if (vocab.streak && [today, dayKey(yesterday)].includes(vocab.streak.last)) streak = Math.max(streak, Number(vocab.streak.count) || 0);
    const seconds = Math.max(Number(localStorage.getItem('studySeconds')) || 0, Object.values(readJSON('studyByDay', {})).reduce((n, x) => n + Number(x || 0), 0)) +
      Object.values(activity).reduce((n, x) => n + Number(x.seconds || 0), 0) +
      Object.values(vocab.history || {}).reduce((n, x) => n + Number(x.seconds || 0), 0);
    return { answers, seconds, streak, days };
  }

  let lastAnswerAt = Date.now();
  function recordAnswer(correct) {
    try {
      const stats = readJSON('topikActivityStats', {});
      const day = new Date().toLocaleDateString('sv-SE');
      const entry = stats[day] || { answers: 0, correct: 0, seconds: 0 };
      entry.answers++; entry.correct += correct ? 1 : 0;
      entry.seconds += Math.max(0, Math.min(300, Math.round((Date.now() - lastAnswerAt) / 1000)));
      lastAnswerAt = Date.now(); stats[day] = entry;
      localStorage.setItem('topikActivityStats', JSON.stringify(stats));
      syncNow().catch(() => reportFailure());
    } catch (_) { reportFailure(); }
  }

  function showRestoreNotice() {
    if (!isStandalone() || hasMeaningfulData(collect()) || sessionStorage.getItem('topikRestoreNoticeDismissed')) return;
    const style = document.createElement('style');
    style.textContent = '.topik-restore-notice{position:fixed;z-index:9999;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));max-width:520px;margin:auto;padding:15px;border:1px solid #bed0e2;border-radius:12px;background:#fff;color:#102a43;box-shadow:0 14px 45px #102a4340;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif}.topik-restore-notice strong{display:block;font-size:15px}.topik-restore-notice p{margin:6px 0 11px;font-size:12px;line-height:1.6;color:#486581}.topik-restore-actions{display:grid;grid-template-columns:1fr auto;gap:8px}.topik-restore-actions button{min-height:44px;padding:9px 13px;border:0;border-radius:8px;font:inherit;font-size:13px;font-weight:900}.topik-restore-pick{background:#1756a9;color:#fff}.topik-restore-close{background:#edf2f7;color:#334e68}';
    document.head.appendChild(style);
    const notice = document.createElement('aside');
    notice.className = 'topik-restore-notice';
    notice.setAttribute('role', 'status');
    notice.innerHTML = '<strong>以前の学習記録がありますか？</strong><p>ホーム画面版に記録が表示されない場合は、ブラウザ版で書き出したバックアップを選ぶと引き継げます。</p><div class="topik-restore-actions"><button class="topik-restore-pick">バックアップから復元</button><button class="topik-restore-close">今はしない</button></div><input type="file" accept="application/json,.json" hidden>';
    const input = notice.querySelector('input');
    notice.querySelector('.topik-restore-pick').onclick = () => input.click();
    notice.querySelector('.topik-restore-close').onclick = () => {
      sessionStorage.setItem('topikRestoreNoticeDismissed', '1');
      notice.remove();
    };
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        await importBackup(JSON.parse(await file.text()));
        alert('学習記録を引き継ぎました。');
        location.reload();
      } catch (error) {
        alert('バックアップを読み込めませんでした。正しいJSONファイルを選んでください。');
      }
    };
    document.body.appendChild(notice);
  }

  async function boot() {
    try {
      const snapshot = await readSnapshot();
      const local = collect();
      if (snapshot && snapshot.items && hasMeaningfulData(snapshot.items) && !hasMeaningfulData(local)) {
        for (const [key, value] of Object.entries(snapshot.items)) {
          if (isLearningKey(key) && typeof value === 'string') localStorage.setItem(key, value);
        }
      } else if (snapshot && snapshot.items) {
        for (const [key, value] of Object.entries(snapshot.items)) {
          const current = localStorage.getItem(key);
          let invalid = current === null;
          if (current !== null && key !== 'last') {
            try {
              if (key.startsWith('best_') || ['studySeconds', 'studyCount', 'streak'].includes(key)) invalid = !Number.isFinite(Number(current));
              else JSON.parse(current);
            } catch (_) { invalid = true; }
          }
          if (isLearningKey(key) && invalid && typeof value === 'string') {
            localStorage.setItem(key, value);
          }
        }
      }
      booting = false;
      await syncNow();
    } catch (error) {
      console.warn('学習データの自動復旧を利用できませんでした', error);
      booting = false;
      reportFailure('予備保存を利用できません。学習記録のバックアップを書き出して保管してください。');
    }
  }

  const ready = boot();
  window.TopikLearningStorage = {
    ready, collect, hasMeaningfulData, syncNow, createBackup, importBackup, clearAll, isStandalone, reportFailure, summary, recordAnswer
  };

  addEventListener('error', event => {
    if (event.error && ['QuotaExceededError', 'SecurityError'].includes(event.error.name)) reportFailure();
  });
  addEventListener('pagehide', () => { syncNow().catch(() => {}); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') syncNow().catch(() => {});
  });
  setInterval(() => { syncNow().catch(() => {}); }, 2000);
  addEventListener('DOMContentLoaded', () => { ready.then(showRestoreNotice); });
})();

/* ============================================================
   アカウント同期（Phase 2c）
   Googleログイン時のみ動作し、未ログイン時は何もしない（従来どおり
   端末内保存のみ）。同期はローカルファースト：学習操作は端末に保存
   され、裏側でクラウドと同期する。競合マージ（設計書§4）はこの
   クライアント側で項目単位まで実施し、サーバーはキー単位の
   last-write-wins ストアとして働く。
   ============================================================ */
(function () {
  'use strict';
  var META_KEY = 'topikSyncMeta';
  var storage = window.TopikLearningStorage;
  if (!storage || typeof fetch !== 'function') return;

  var state = { user: null, timer: null, syncing: false, started: false };

  function readMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; }
    catch (_) { return {}; }
  }
  function writeMeta(meta) {
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (_) {}
  }
  function hashOf(value) {
    var h = 0x811c9dc5, s = value || '';
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  function parseJson(value, fallback) {
    try { var parsed = JSON.parse(value); return parsed == null ? fallback : parsed; }
    catch (_) { return fallback; }
  }
  function collectSyncData() {
    var items = storage.collect(), out = {};
    Object.keys(items).forEach(function (key) { if (key !== META_KEY) out[key] = items[key]; });
    return out;
  }

  /* ---- 項目単位マージ（設計書§4の例外規則）。失敗時は null を返し LWW に落とす ---- */
  function mergeSrs(localValue, serverValue) {
    var local = parseJson(localValue, null), server = parseJson(serverValue, null);
    if (!local || !server || !local.items || !server.items) return null;
    var items = {}, ids = {};
    Object.keys(local.items).forEach(function (id) { ids[id] = 1; });
    Object.keys(server.items).forEach(function (id) { ids[id] = 1; });
    Object.keys(ids).forEach(function (id) {
      var a = local.items[id], b = server.items[id];
      if (!a) { items[id] = b; return; }
      if (!b) { items[id] = a; return; }
      var scoreA = (Number(a.r) || 0) + (Number(a.l) || 0);
      var scoreB = (Number(b.r) || 0) + (Number(b.l) || 0);
      items[id] = (scoreB > scoreA || (scoreB === scoreA && (Number(b.s) || 0) > (Number(a.s) || 0))) ? b : a;
    });
    return JSON.stringify({ version: local.version || 1, items: items });
  }
  function mergeState(localValue, serverValue) {
    var local = parseJson(localValue, null), server = parseJson(serverValue, null);
    if (!local || !server || !local.items || !server.items) return null;
    var items = {}, ids = {};
    Object.keys(local.items).forEach(function (id) { ids[id] = 1; });
    Object.keys(server.items).forEach(function (id) { ids[id] = 1; });
    Object.keys(ids).forEach(function (id) {
      var a = local.items[id] || {}, b = server.items[id] || {};
      items[id] = {
        attempts: Math.max(Number(a.attempts) || 0, Number(b.attempts) || 0),
        correct: Math.max(Number(a.correct) || 0, Number(b.correct) || 0),
        mastered: Boolean(a.mastered || b.mastered)
      };
    });
    return JSON.stringify({ version: local.version || 1, items: items });
  }
  function mergeExamResults(localValue, serverValue) {
    var local = parseJson(localValue, null), server = parseJson(serverValue, null);
    if (!local || !server || !Array.isArray(local.records) || !Array.isArray(server.records)) return null;
    var seen = {}, records = [];
    server.records.concat(local.records).forEach(function (record) {
      if (!record) return;
      var k = record.id ? 'id:' + record.id : 'json:' + JSON.stringify(record);
      if (!seen[k]) { seen[k] = 1; records.push(record); }
    });
    records.sort(function (a, b) { return (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0); });
    var merged = {};
    Object.keys(server).forEach(function (k) { merged[k] = server[k]; });
    Object.keys(local).forEach(function (k) { merged[k] = local[k]; });
    merged.version = 1;
    merged.records = records;
    return JSON.stringify(merged);
  }
  function mergeArrayUnion(localValue, serverValue) {
    var local = parseJson(localValue, null), server = parseJson(serverValue, null);
    if (!Array.isArray(local) || !Array.isArray(server)) return null;
    var seen = {}, out = [];
    server.concat(local).forEach(function (item) {
      var k = JSON.stringify(item);
      if (!seen[k]) { seen[k] = 1; out.push(item); }
    });
    return JSON.stringify(out);
  }
  function mergeDailyMax(localValue, serverValue) {
    var local = parseJson(localValue, null), server = parseJson(serverValue, null);
    if (!local || !server || typeof local !== 'object' || typeof server !== 'object' || Array.isArray(local) || Array.isArray(server)) return null;
    var out = {}, days = {};
    Object.keys(server).forEach(function (d) { days[d] = 1; });
    Object.keys(local).forEach(function (d) { days[d] = 1; });
    Object.keys(days).forEach(function (d) {
      var a = Number(local[d]), b = Number(server[d]);
      if (Number.isFinite(a) && Number.isFinite(b)) out[d] = Math.max(a, b);
      else if (d in local) out[d] = local[d];
      else out[d] = server[d];
    });
    return JSON.stringify(out);
  }
  function mergeActivity(localValue, serverValue) {
    var local = parseJson(localValue, null), server = parseJson(serverValue, null);
    if (!local || !server || typeof local !== 'object' || typeof server !== 'object') return null;
    var out = {}, days = {};
    Object.keys(server).forEach(function (d) { days[d] = 1; });
    Object.keys(local).forEach(function (d) { days[d] = 1; });
    Object.keys(days).forEach(function (d) {
      var a = local[d] || {}, b = server[d] || {}, entry = {};
      ['answers', 'correct', 'seconds'].forEach(function (field) {
        entry[field] = Math.max(Number(a[field]) || 0, Number(b[field]) || 0);
      });
      out[d] = entry;
    });
    return JSON.stringify(out);
  }
  function mergeNumberMax(localValue, serverValue) {
    var a = Number(localValue), b = Number(serverValue);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return String(Math.max(a, b));
  }
  function mergeValues(key, localValue, serverValue) {
    if (key === 'topikSrsV1' || key === 'topikGrammarSrsV1') return mergeSrs(localValue, serverValue);
    if (key === 'topikListeningState' || key === 'topikReadingState') return mergeState(localValue, serverValue);
    if (key === 'topikExamResults') return mergeExamResults(localValue, serverValue);
    if (key === 'topikGrammarMastered' || key === 'sqWrong' || key === 'topikListeningWrong' ||
        key === 'topikReadingWrong' || key === 'topikPracticeWrong') return mergeArrayUnion(localValue, serverValue);
    if (key === 'studyByDay') return mergeDailyMax(localValue, serverValue);
    if (key === 'topikActivityStats') return mergeActivity(localValue, serverValue);
    if (key === 'studySeconds' || key === 'studyCount' || key === 'streak' || key.indexOf('best_') === 0) return mergeNumberMax(localValue, serverValue);
    if (key === 'last') return (typeof localValue === 'string' && typeof serverValue === 'string')
      ? (localValue >= serverValue ? localValue : serverValue) : null;
    return null;
  }

  /* ---- API ---- */
  function api(path, options) {
    var opts = { credentials: 'same-origin' };
    if (options) Object.keys(options).forEach(function (k) { opts[k] = options[k]; });
    if (opts.body) opts.headers = { 'Content-Type': 'application/json' };
    return fetch(path, opts);
  }
  function syncStatusText() {
    return '最終同期 ' + new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  }
  function setSyncStatus(text) {
    var el = document.getElementById('accountSyncStatus');
    if (el) el.textContent = text;
  }
  function clearAcctPending() {
    var box = document.getElementById('accountSync');
    if (box) { box.classList.remove('acct-checking'); box.removeAttribute('aria-busy'); }
  }
  function onLoggedOut() {
    state.user = null;
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    var text = document.getElementById('accountSyncText');
    if (text) text.textContent = 'ログインの有効期限が切れました。再度ログインすると同期を再開できます。ログインしなくても今まで通り使えます。';
    var loginBtn = document.getElementById('accountLoginBtn');
    if (loginBtn) loginBtn.style.display = '';
    var logoutBtn = document.getElementById('accountLogoutBtn');
    if (logoutBtn) logoutBtn.remove();
    setSyncStatus('');
  }

  async function fullSync() {
    if (state.syncing || !state.user) return;
    state.syncing = true;
    try {
      var res = await api('/api/sync');
      if (res.status === 401) { onLoggedOut(); return; }
      if (!res.ok) { setSyncStatus('同期できませんでした（通信環境を確認してください）'); return; }
      var data = await res.json();
      var serverKeys = (data && data.keys) || {};
      var local = collectSyncData();
      var meta = readMeta();
      meta.updatedAt = meta.updatedAt || {};
      meta.hashes = meta.hashes || {};
      var firstSync = !meta.lastSyncAt;
      var now = Date.now();
      var pushPayload = {}, changedLocal = false, allKeys = {};
      Object.keys(local).forEach(function (k) { allKeys[k] = 1; });
      Object.keys(serverKeys).forEach(function (k) { allKeys[k] = 1; });
      Object.keys(allKeys).forEach(function (key) {
        var localValue = local[key];
        var serverEntry = serverKeys[key];
        var storedTs = Number(meta.updatedAt[key]) || 0;
        var localTs = storedTs || (firstSync && localValue !== undefined ? now : 0);
        var mergedValue, mergedTs;
        if (serverEntry && localValue !== undefined) {
          var merged = mergeValues(key, localValue, serverEntry.value);
          if (merged !== null) { mergedValue = merged; mergedTs = Math.max(localTs, serverEntry.updated_at); }
          else if (localTs >= serverEntry.updated_at) { mergedValue = localValue; mergedTs = localTs; }
          else { mergedValue = serverEntry.value; mergedTs = serverEntry.updated_at; }
        } else if (serverEntry) {
          mergedValue = serverEntry.value; mergedTs = serverEntry.updated_at;
        } else if (localValue !== undefined) {
          mergedValue = localValue; mergedTs = localTs || now;
        } else {
          return;
        }
        if (mergedValue !== localValue) {
          try { localStorage.setItem(key, mergedValue); changedLocal = true; } catch (_) {}
        }
        if (!serverEntry || serverEntry.value !== mergedValue || serverEntry.updated_at < mergedTs) {
          pushPayload[key] = { value: mergedValue, updated_at: mergedTs };
        }
        meta.updatedAt[key] = mergedTs;
        meta.hashes[key] = hashOf(mergedValue);
      });
      if (Object.keys(pushPayload).length) {
        var pushRes = await api('/api/sync', { method: 'POST', body: JSON.stringify({ keys: pushPayload }) });
        if (pushRes.status === 401) { onLoggedOut(); return; }
        if (!pushRes.ok) { setSyncStatus('同期できませんでした（通信環境を確認してください）'); return; }
      }
      meta.lastSyncAt = Date.now();
      meta.email = state.user.email;
      writeMeta(meta);
      if (changedLocal) storage.syncNow().catch(function () {});
      setSyncStatus(syncStatusText());
    } catch (_) {
      setSyncStatus('同期できませんでした（通信環境を確認してください）');
    } finally {
      state.syncing = false;
    }
  }

  async function pushDirty(useKeepalive) {
    if (!state.user || state.syncing) return;
    var local = collectSyncData();
    var meta = readMeta();
    meta.updatedAt = meta.updatedAt || {};
    meta.hashes = meta.hashes || {};
    var payload = {}, dirtyKeys = [];
    Object.keys(local).forEach(function (key) {
      if (meta.hashes[key] !== hashOf(local[key])) {
        var ts = Math.max(Date.now(), Number(meta.updatedAt[key]) || 0);
        payload[key] = { value: local[key], updated_at: ts };
        dirtyKeys.push(key);
      }
    });
    if (!dirtyKeys.length) return;
    state.syncing = true;
    try {
      var res = await fetch('/api/sync', {
        method: 'POST', credentials: 'same-origin', keepalive: !!useKeepalive,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys: payload })
      });
      if (res.status === 401) { onLoggedOut(); return; }
      if (!res.ok) return;
      var latest = readMeta();
      latest.updatedAt = latest.updatedAt || {};
      latest.hashes = latest.hashes || {};
      dirtyKeys.forEach(function (key) {
        latest.hashes[key] = hashOf(payload[key].value);
        latest.updatedAt[key] = payload[key].updated_at;
      });
      latest.lastSyncAt = Date.now();
      writeMeta(latest);
      setSyncStatus(syncStatusText());
    } catch (_) {
      /* 次回の定期実行で再送する */
    } finally {
      state.syncing = false;
    }
  }

  /* ---- アカウントUI（トップページの #accountSync がある場合のみ） ---- */
  function renderAccount() {
    var box = document.getElementById('accountSync');
    if (!box || !state.user) return;
    var text = document.getElementById('accountSyncText');
    if (text) text.textContent = state.user.email + ' でログイン中です。学習記録は自動でクラウドに保存され、別の端末でも続きから学習できます。';
    var loginBtn = document.getElementById('accountLoginBtn');
    if (loginBtn) loginBtn.style.display = 'none';
    if (!document.getElementById('accountSyncStatus')) {
      var status = document.createElement('p');
      status.id = 'accountSyncStatus';
      status.className = 'account-sync-status';
      box.appendChild(status);
    }
    if (!document.getElementById('accountLogoutBtn')) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'accountLogoutBtn';
      btn.className = 'home-action';
      btn.textContent = 'ログアウト';
      btn.addEventListener('click', async function () {
        btn.disabled = true;
        try { await pushDirty(false); } catch (_) {}
        try { await api('/api/auth/logout', { method: 'POST' }); } catch (_) {}
        location.reload();
      });
      box.appendChild(btn);
    }
  }
  function showLoginNotice() {
    var login = new URLSearchParams(location.search).get('login');
    if (login !== 'error') return;
    var text = document.getElementById('accountSyncText');
    if (text) text.textContent = 'ログインできませんでした。もう一度お試しください。ログインしなくても今まで通り使えます。';
  }

  async function init() {
    if (state.started) return;
    state.started = true;
    showLoginNotice();
    var pendingTimer = setTimeout(clearAcctPending, 6000);
    function acctResolved() { clearTimeout(pendingTimer); clearAcctPending(); }
    try {
      var res = await api('/api/auth/me');
      if (!res.ok) { acctResolved(); return; }
      var me = await res.json();
      if (!me || !me.loggedIn) { acctResolved(); return; }
      state.user = { email: me.email };
    } catch (_) {
      acctResolved();
      return;
    }
    renderAccount();
    acctResolved();
    await fullSync();
    state.timer = setInterval(function () { pushDirty(false); }, 30000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') pushDirty(true);
    });
    addEventListener('pagehide', function () { pushDirty(true); });
  }

  if (storage.ready && typeof storage.ready.then === 'function') storage.ready.then(init);
  else addEventListener('DOMContentLoaded', init);
})();
