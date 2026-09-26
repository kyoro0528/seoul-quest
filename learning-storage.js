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
    'topikPracticeStats', 'topikDailyHistory'
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
    }
    return items;
  }

  function hasMeaningfulData(items) {
    return Object.entries(items || {}).some(([key, value]) => {
      if (!value) return false;
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
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  async function deleteSnapshot() {
    const db = await openDatabase();
    if (!db) return;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OBJECT_STORE, 'readwrite');
      tx.objectStore(OBJECT_STORE).delete(SNAPSHOT_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  async function syncNow() {
    const items = collect();
    await writeSnapshot(items);
    return items;
  }

  async function createBackup() {
    const items = await syncNow();
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

  async function importBackup(payload) {
    const items = backupItems(payload);
    for (const [key, value] of Object.entries(items)) {
      if (isLearningKey(key) && typeof value === 'string') localStorage.setItem(key, value);
    }
    await syncNow();
  }

  async function clearAll() {
    for (const key of Object.keys(collect())) localStorage.removeItem(key);
    await deleteSnapshot();
  }

  function isStandalone() {
    return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
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
        if (!sessionStorage.getItem('topikStorageRestored')) {
          sessionStorage.setItem('topikStorageRestored', '1');
          location.reload();
          return;
        }
      } else if (snapshot && snapshot.items) {
        for (const [key, value] of Object.entries(snapshot.items)) {
          if (isLearningKey(key) && localStorage.getItem(key) === null && typeof value === 'string') {
            localStorage.setItem(key, value);
          }
        }
      }
      await syncNow();
    } catch (error) {
      console.warn('学習データの自動復旧を利用できませんでした', error);
    }
  }

  const ready = boot();
  window.TopikLearningStorage = {
    ready, collect, hasMeaningfulData, syncNow, createBackup, importBackup, clearAll, isStandalone
  };

  addEventListener('pagehide', () => { syncNow().catch(() => {}); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') syncNow().catch(() => {});
  });
  setInterval(() => { syncNow().catch(() => {}); }, 2000);
  addEventListener('DOMContentLoaded', () => { ready.then(showRestoreNotice); });
})();
