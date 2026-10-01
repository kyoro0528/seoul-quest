const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const storageCode = fs.readFileSync(path.join(root, 'learning-storage.js'), 'utf8');

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; }, key: i => [...values.keys()][i],
    getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)),
    removeItem: k => values.delete(k)
  };
}
function setup(initial = {}, snapshot = null) {
  let persisted = snapshot;
  const elements = new Map();
  function element() {
    return { style: { setProperty() {} }, dataset: {}, children: [], classList: { add() {}, remove() {}, toggle() {} },
      textContent: '', innerHTML: '', value: '', append(x) { this.children.push(x); },
      appendChild(x) { this.children.push(x); if (x.id) elements.set(x.id, x); },
      setAttribute() {}, addEventListener() {}, querySelector: () => element(), querySelectorAll: () => [] };
  }
  const db = {
    close() {}, objectStoreNames: { contains: () => true },
    transaction() {
      const tx = { objectStore: () => ({
        get() { const r = {}; setTimeout(() => { r.result = persisted; r.onsuccess(); }, 0); return r; },
        put(v) { persisted = v; setTimeout(() => tx.oncomplete(), 0); },
        delete() { persisted = null; setTimeout(() => tx.oncomplete(), 0); }
      }) }; return tx;
    }
  };
  const c = {
    localStorage: storage(initial), sessionStorage: storage(), console: { warn() {}, error() {} },
    Date, JSON, Set, Promise, Event, URLSearchParams,
    location: { search: '', reload() { throw Error('Unexpected reload'); } },
    navigator: {}, matchMedia: () => ({ matches: false }), setInterval() {}, setTimeout() {},
    addEventListener() {}, dispatchEvent() {}, scrollTo() {},
    document: {
      body: element(), head: element(), addEventListener() {},
      getElementById: id => elements.get(id), createElement: element,
      querySelector: id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
      querySelectorAll: () => []
    },
    indexedDB: { open() { const r = {}; setTimeout(() => { r.result = db; r.onsuccess(); }, 0); return r; } }
  };
  c.window = c; vm.createContext(c); vm.runInContext(storageCode, c);
  return { c, elements, get snapshot() { return persisted; } };
}

test('restore missing keys before application startup without losing existing keys', async () => {
  const x = setup({ studyCount: '10' }, { items: { studyCount: '8', sqWrong: '["q1"]' } });
  await x.c.TopikLearningStorage.ready;
  assert.equal(x.c.localStorage.getItem('studyCount'), '10');
  assert.equal(x.c.localStorage.getItem('sqWrong'), '["q1"]');
  assert.equal(x.snapshot.items.sqWrong, '["q1"]');
});
test('empty local storage restores the whole backup', async () => {
  const x = setup({}, { items: { studyCount: '8', sqWrong: '["q1"]' } });
  await x.c.TopikLearningStorage.ready;
  assert.equal(x.c.localStorage.getItem('studyCount'), '8');
});
test('early sync never overwrites a snapshot before recovery', async () => {
  const x = setup({}, { items: { studyCount: '8' } });
  await x.c.TopikLearningStorage.syncNow();
  await x.c.TopikLearningStorage.ready;
  assert.equal(x.snapshot.items.studyCount, '8');
});
test('summary combines legacy roadmap, vocabulary and new practice records once', async () => {
  const today = new Date().toLocaleDateString('sv-SE');
  const x = setup({ studyCount: '3', studySeconds: '10', studyByDay: JSON.stringify({ [today]: 10 }),
    topikVocabState: JSON.stringify({ words: { w1: { correct: 2, wrong: 1 } }, history: { [today]: { answers: 3, seconds: 7 } } }),
    topikActivityStats: JSON.stringify({ [today]: { answers: 2, seconds: 5 } }) });
  await x.c.TopikLearningStorage.ready;
  const summary = x.c.TopikLearningStorage.summary();
  assert.equal(summary.answers, 8); assert.equal(summary.seconds, 22);
  assert.equal(summary.days[today], 22); assert.equal(summary.streak, 1);
});
test('reset cannot resurrect data from a queued snapshot', async () => {
  const x = setup({ studyCount: '3' }); await x.c.TopikLearningStorage.ready;
  const pending = x.c.TopikLearningStorage.syncNow();
  await x.c.TopikLearningStorage.clearAll(); await pending;
  assert.equal(x.c.localStorage.getItem('studyCount'), null); assert.equal(x.snapshot, null);
});
test('vocabulary answers persist before completion, finish does not double-count', async () => {
  const x = setup(); await x.c.TopikLearningStorage.ready;
  x.c.V = { test: [['가', 'カ', '行く'], ['나', 'ナ', '私'], ['다', 'タ', 'すべて'], ['라', 'ラ', '仮']] };
  const html = fs.readFileSync(path.join(root, 'topik1-vocabulary.html'), 'utf8');
  const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes("const STORE='topikVocabState'"));
  vm.runInContext(script.slice(0, script.indexOf("$$('[data-go=")), x.c);
  vm.runInContext("quiz=[{w:raw[0],answer:'行く',type:'ko-jp',choices:['行く','私']}];quizIndex=0;returnMode='chapter';renderQuestion();answer(document.createElement('button'),'行く')", x.c);
  let saved = JSON.parse(x.c.localStorage.getItem('topikVocabState'));
  const day = vm.runInContext('dateKey()', x.c);
  assert.equal(saved.history[day].answers, 1); assert.equal(saved.words.w0001.correct, 1);
  vm.runInContext('finishQuiz()', x.c);
  saved = JSON.parse(x.c.localStorage.getItem('topikVocabState'));
  assert.equal(saved.history[day].answers, 1); assert.equal(saved.history[day].sessions, 1);
  assert.equal(x.c.TopikLearningStorage.summary().answers, 1);
  await x.c.TopikLearningStorage.syncNow();
  const reload = setup(x.c.TopikLearningStorage.collect(), x.snapshot);
  await reload.c.TopikLearningStorage.ready;
  assert.equal(reload.c.TopikLearningStorage.summary().answers, 1);
});
test('storage errors show a visible alert', async () => {
  const x = setup(); await x.c.TopikLearningStorage.ready;
  x.c.localStorage.setItem = () => { throw Object.assign(Error('full'), { name: 'QuotaExceededError' }); };
  x.c.TopikLearningStorage.recordAnswer(true);
  assert.match(x.elements.get('learning-save-error').textContent, /保存できません/);
});
test('all six applications are gated behind recovery and compile', () => {
  for (const name of ['index', 'topik1-vocabulary', 'topik1-grammar', 'topik1-reading', 'topik1-listening', 'topik1-practice']) {
    const html = fs.readFileSync(path.join(root, name + '.html'), 'utf8');
    assert.ok(html.includes('learning-bootstrap.js'));
    for (const [, attributes, body] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (attributes.includes('ld+json')) continue;
      if (body.includes('localStorage')) assert.ok(attributes.includes('data-learning-app'), name);
      new vm.Script(body);
    }
  }
});

test('homepage boots with restored records before roadmap generation', async () => {
  const x = setup({ studyCount: '2' }, { items: { sqWrong: '["a1"]', best_c1: '5' } });
  await x.c.TopikLearningStorage.ready;
  vm.runInContext(fs.readFileSync(path.join(root, 'vocab.js'), 'utf8'), x.c);
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const inline = [...html.matchAll(/<script[^>]*data-learning-app[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(Boolean);
  vm.runInContext(inline, x.c);
  vm.runInContext(fs.readFileSync(path.join(root, 'roadmap-questions.js'), 'utf8'), x.c);
  assert.equal(x.c.localStorage.getItem('sqWrong'), '["a1"]');
  assert.equal(String(x.elements.get('#studyCount').textContent), '2');
});

test('damaged JSON is restored before application parses it', async () => {
  const x = setup({ studyCount: '2', sqWrong: 'invalid' }, { items: { sqWrong: '["a1"]' } });
  await x.c.TopikLearningStorage.ready;
  assert.equal(x.c.localStorage.getItem('sqWrong'), '["a1"]');
});
