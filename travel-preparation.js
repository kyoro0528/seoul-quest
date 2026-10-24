(() => {
 'use strict';
 const key='topikTravelPrep_v1';
 const boxes=[...document.querySelectorAll('[data-prep]')];
 const status=document.querySelector('#prepSaveStatus');
 let saved={};
 try {const raw=JSON.parse(localStorage.getItem(key)||'{}');if(raw&&typeof raw==='object'&&!Array.isArray(raw))saved=raw;}catch(error){status.textContent='以前のチェックを読み込めませんでした。今回の画面ではチェックできます。';}
 boxes.forEach(box=>{box.checked=saved[box.dataset.prep]===true;box.addEventListener('change',()=>{update();const values=Object.fromEntries(boxes.map(b=>[b.dataset.prep,b.checked]));try{localStorage.setItem(key,JSON.stringify(values));status.textContent='チェックをこのブラウザに保存しました。別端末とは同期されません。';}catch(error){status.textContent='保存できませんでした。この画面内のチェックだけが有効です。';}});});
 let onlyUnchecked=false;
 document.querySelector('#prepFilter').addEventListener('click',e=>{onlyUnchecked=!onlyUnchecked;e.currentTarget.setAttribute('aria-pressed',String(onlyUnchecked));e.currentTarget.textContent=onlyUnchecked?'すべての項目を表示':'未チェックの項目だけ表示';update();});
 function update(){boxes.forEach(b=>{b.closest('.prep-card').hidden=onlyUnchecked&&b.checked;});const n=boxes.filter(b=>b.checked).length;document.querySelector('#prepCount').textContent=`準備チェック：${n} / ${boxes.length}`;document.querySelector('#prepProgress').value=n;document.querySelector('#prepFilterStatus').textContent=onlyUnchecked?(n===boxes.length?'すべてチェック済みです。「すべての項目を表示」で見直せます。':`未チェック：${boxes.length-n}項目`):'';}
 update();
 if(Date.now()>Date.parse('2026-12-31T23:59:59+09:00'))document.querySelector('#entryFreshness').textContent='入国案内の確認日から期間が経過しています。2026年までのK-ETA免除情報を現在の制度として使用せず、必ず最新の公式案内を確認してください。';
})();
