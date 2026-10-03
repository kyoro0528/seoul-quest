(function (root) {
  'use strict';
  const categories = [
    ['vocabulary','語彙','topik1-vocabulary'],['grammar','文法','topik1-grammar'],
    ['listening','聞き取り：数字・場所','topik1-listening'],['reading','読解：内容一致','topik1-reading'],
    ['other','その他・未分類','topik1-practice']
  ];
  function validate(record) {
    if (!record || !/^\d{4}-\d{2}-\d{2}$/.test(record.date) || typeof record.name!=='string' || !record.name.trim() || typeof record.missed!=='string' || typeof record.note!=='string') throw Error('日付と受験回・教材名を入力してください。');
    for (const field of ['listening','reading']) if (!Number.isInteger(record[field]) || record[field]<0 || record[field]>100) throw Error('得点は各科目0〜100の整数で入力してください。');
    for (const [key] of categories) {
      const x=record.fields[key];
      if (!x || !Number.isInteger(x.total) || !Number.isInteger(x.wrong) || x.total<0 || x.wrong<0 || x.wrong>x.total || x.total>70) throw Error('分野の確認数は0〜70、誤答数は確認数以下で入力してください。');
    }
    if (Object.values(record.fields).reduce((n,x)=>n+x.total,0)>70) throw Error('分野の確認数の合計は70問以下にしてください。同じ問題を重複して数えないでください。');
    if (record.missed.trim() && !/^\d+(?:\s*[,、]\s*\d+)*$/.test(record.missed.trim())) throw Error('誤答番号は半角数字をカンマで区切ってください。');
    if(record.missed.trim().split(/[,、]/).filter(Boolean).some(x=>+x<1||+x>70)) throw Error('誤答番号は1〜70で入力してください（聞き取り1〜30、読解31〜70）。');
    return record;
  }
  function analyse(records,goal) {
    const ordered=[...records].sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt-b.createdAt);
    const recent=ordered.filter(x=>x.examConditions).slice(-3);
    const fields=categories.map(([key,name,path])=>{
      const total=ordered.reduce((n,r)=>n+r.fields[key].total,0),wrong=ordered.reduce((n,r)=>n+r.fields[key].wrong,0);
      return {key,name,path,total,wrong,rate:total?Math.round((total-wrong)/total*100):null};
    }).sort((a,b)=>(a.rate===null?101:a.rate)-(b.rate===null?101:b.rate));
    return {ordered,recent,passed:recent.filter(r=>r.listening+r.reading>=goal).length,fields};
  }
  function radarModel(fields) {
    const values=categories.map(([key,name])=>{const field=fields.find(x=>x.key===key);return {key,name,rate:field?.rate??null};});
    return {values,evaluated:values.filter(x=>x.rate!==null).length,complete:values.every(x=>x.rate!==null)};
  }
  if(typeof module==='object'&&module.exports){module.exports={validate,analyse,radarModel,categories};return;}
  const $=id=>document.getElementById(id),KEY='topikExamResults';let data={version:1,goal:80,records:[]},editing=null,readFailed=false;
  const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function message(text,error=false){$('saveMessage').textContent=text;$('saveMessage').className=error?'error':'note';}
  try {const stored=localStorage.getItem(KEY);if(stored){const parsed=JSON.parse(stored);if(!Array.isArray(parsed.records))throw Error('形式不正');parsed.records.forEach(validate);data={version:1,goal:parsed.goal===140?140:80,records:parsed.records};}}
  catch(e){readFailed=true;message('保存済みデータを読み取れませんでした。上書きせず、バックアップを復元してください。',true);$('saveResult').disabled=true;}
  async function persist(next){if(readFailed)throw Error('保存済みデータが読めないため上書きを停止しています。');localStorage.setItem(KEY,JSON.stringify(next));data=next;try{await TopikLearningStorage.syncNow();}catch(e){message('端末内に保存しましたが予備保存に失敗しました。バックアップを書き出してください。',true);return false;}return true;}
  $('fieldRows').innerHTML=categories.map(([key,name])=>`<div class="field-row"><span>${name}</span><label>確認数<input type="number" name="${key}Total" min="0" max="70" value="0" required></label><label>誤答数<input type="number" name="${key}Wrong" min="0" max="70" value="0" required></label></div>`).join('');
  function resetForm(){editing=null;$('resultForm').reset();$('resultDate').value=new Date().toLocaleDateString('sv-SE');$('saveResult').textContent='結果を保存';$('cancelEdit').hidden=true;}
  function render(){
    $('goal').value=data.goal;const a=analyse(data.records,data.goal),latest=a.ordered.at(-1);
    const radar=radarModel(a.fields),center=170,radius=105,point=(index,value=100)=>{const angle=-Math.PI/2+index*Math.PI*2/5,r=radius*value/100;return [center+Math.cos(angle)*r,center+Math.sin(angle)*r]},polygon=level=>radar.values.map((_,i)=>point(i,level).join(',')).join(' ');
    $('latestScore').textContent=latest?`${latest.listening+latest.reading} / 200点`:'まだ記録がありません';
    $('goalGap').textContent=latest?(latest.listening+latest.reading>=data.goal?'目標点に到達':`目標まであと${data.goal-latest.listening-latest.reading}点`):'模試を受けると自動で表示';
    $('scoreContext').textContent=latest?`${latest.date}・${latest.name}／${latest.examConditions?'初見・本番時間':'練習条件'}`:'';
    $('readiness').textContent=a.recent.length?`初見・本番時間の直近${a.recent.length}回中${a.passed}回、目標点に到達`:'初見・本番時間で解いた記録はありません';
    const series=a.ordered.slice(-10),x=i=>series.length===1?180:45+i*280/(series.length-1),y=n=>190-n*.75;
    $('chart').innerHTML=series.length?`<svg viewBox="0 0 370 235" role="img" aria-label="直近${series.length}回の得点推移。詳細は下の結果一覧で確認できます。"><path d="M45 40V190H330" fill="none" stroke="#b7c8d8"/>${[0,100,200].map(n=>`<text x="6" y="${y(n)+4}" font-size="12">${n}</text>`).join('')}<path d="M45 ${y(data.goal)}H330" stroke="#16834a" stroke-dasharray="5 4"/><text x="45" y="${y(data.goal)-7}" font-size="11" fill="#16834a">目標 ${data.goal}点</text><polyline points="${series.map((r,i)=>`${x(i)},${y(r.listening+r.reading)}`).join(' ')}" fill="none" stroke="#1756a9" stroke-width="3"/>${series.map((r,i)=>`<circle cx="${x(i)}" cy="${y(r.listening+r.reading)}" r="4" fill="#1756a9"/><text x="${x(i)}" y="${y(r.listening+r.reading)-9}" text-anchor="middle" font-size="11">${r.listening+r.reading}</text><text x="${x(i)}" y="213" text-anchor="middle" font-size="10">${i+1}</text>`).join('')}</svg><p class="note">横軸は古い順の直近${series.length}回。縦軸は得点。練習条件・再挑戦の結果も含みます。</p><ol class="note">${series.map(r=>`<li>${esc(r.date)}・${esc(r.name)}：${r.listening+r.reading}点</li>`).join('')}</ol>`:'<p>結果を保存すると得点グラフが表示されます。</p>';
    $('radarChart').innerHTML=radar.complete?`<svg viewBox="0 0 340 340" role="img" aria-label="5分野の累計正答率レーダーチャート">${[20,40,60,80,100].map(level=>`<polygon points="${polygon(level)}" fill="none" stroke="#d9e2ec"/>`).join('')}${radar.values.map((_,i)=>{const [x,y]=point(i);return `<line x1="${center}" y1="${center}" x2="${x}" y2="${y}" stroke="#d9e2ec"/>`}).join('')}<polygon points="${radar.values.map((v,i)=>point(i,v.rate).join(',')).join(' ')}" fill="#1756a933" stroke="#1756a9" stroke-width="3"/>${radar.values.map((v,i)=>{const [x,y]=point(i,v.rate),[lx,ly]=point(i,122);return `<circle cx="${x}" cy="${y}" r="5" fill="#1756a9"/><text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="11"><tspan x="${lx}" dy="-7">${esc(v.name)}</tspan><tspan x="${lx}" dy="14">${v.rate}%</tspan></text>`}).join('')}</svg><p class="note">保存された全結果の累計正答率です。外側ほど正答率が高くなります。</p>`:`<div class="radar-empty"><strong>${radar.evaluated}/5分野を評価済み</strong><p>レーダーチャートは5分野すべてに評価すると表示されます。未評価を0％として描画しません。</p></div>`;
    $('weaknesses').innerHTML=a.fields.map(f=>`<div class="weakness"><div><strong>${f.name}</strong><span>${f.rate===null?'未入力':`正答率 ${f.rate}%（${f.total-f.wrong}/${f.total}問）`}</span></div>${f.rate===null?'':`<div class="track"><i style="width:${f.rate}%"></i></div>`}<a href="./${f.path}">${f.name}を練習する →</a></div>`).join('');
    $('history').innerHTML=[...a.ordered].reverse().map(r=>`<article class="history-item"><h3>${esc(r.name)}</h3><p>${esc(r.date)}・${r.examConditions?'初見・本番時間':'練習条件／再挑戦'}</p><p><strong>${r.listening+r.reading}点</strong>（聞き取り ${r.listening}・読解 ${r.reading}）</p>${r.missed?`<p>誤答番号：${esc(r.missed)}</p>`:''}${r.note?`<p>${esc(r.note)}</p>`:''}<div class="buttons">${r.source==='original-mock'?`<button type="button" data-pdf="${esc(r.id)}">この模試のPDFを保存</button>`:''}<button type="button" data-delete="${esc(r.id)}">この結果を削除</button></div></article>`).join('')||'<p>まだ結果がありません。</p>';
  }
  $('goal').onchange=async()=>{try{await persist({...data,goal:Number($('goal').value)});render();}catch(e){message('目標を保存できませんでした。バックアップを書き出してください。',true);}};
  $('resultForm').onsubmit=async e=>{e.preventDefault();try{const f=new FormData(e.target),old=data.records.find(r=>r.id===editing),r=validate({id:old?.id||crypto.randomUUID(),createdAt:old?.createdAt||Date.now(),date:f.get('date'),name:f.get('name').trim().slice(0,80),listening:Number(f.get('listening')),reading:Number(f.get('reading')),examConditions:f.get('examConditions')==='on',missed:f.get('missed').trim().slice(0,300),note:f.get('note').trim().slice(0,500),fields:Object.fromEntries(categories.map(([k])=>[k,{total:Number(f.get(k+'Total')),wrong:Number(f.get(k+'Wrong'))}]))});const next={...data,records:editing?data.records.map(x=>x.id===editing?r:x):[...data.records,r]};const complete=await persist(next);resetForm();render();if(complete)message('結果を保存しました。');}catch(e){message(e.message||'保存に失敗しました。',true);}};
  $('history').onclick=async e=>{const b=e.target.closest('button');if(!b)return;const id=b.dataset.pdf||b.dataset.edit||b.dataset.delete,r=data.records.find(x=>x.id===id);if(!r)return;if(b.dataset.pdf){b.disabled=true;try{await TopikExamPdf.download(r);message('PDFを作成しました。ダウンロードまたは共有から保存してください。');}catch(e){message(e.message||'PDFを作成できませんでした。',true);}finally{b.disabled=false;}return;}if(b.dataset.edit){editing=id;const form=$('resultForm');for(const k of ['date','name','listening','reading','missed','note'])form.elements.namedItem(k).value=r[k];form.elements.namedItem('examConditions').checked=r.examConditions;for(const [k]of categories){form.elements.namedItem(k+'Total').value=r.fields[k].total;form.elements.namedItem(k+'Wrong').value=r.fields[k].wrong;}$('saveResult').textContent='変更を保存';$('cancelEdit').hidden=false;$('entry').scrollIntoView({behavior:'smooth'});}else if(confirm('この結果を削除しますか？')){try{await persist({...data,records:data.records.filter(x=>x.id!==id)});if(editing===id)resetForm();render();}catch(e){message('削除できませんでした。',true);}}};
  $('cancelEdit').onclick=resetForm;
  $('exportResults').onclick=async()=>{try{const backup=await TopikLearningStorage.createBackup();const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='topik-study-backup-'+new Date().toLocaleDateString('sv-SE')+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);message('全学習データのバックアップを書き出しました。');}catch(e){message('バックアップを書き出せませんでした。',true);}};
  $('importResults').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;const parsed=JSON.parse(await file.text());if(!confirm('バックアップを復元します。現在の学習データと同じキーの記録は置き換わります。続けますか？'))return;await TopikLearningStorage.importBackup(parsed);location.reload();}catch(e){message('復元できませんでした。TOPIK STUDYのバックアップを選んでください。',true);}finally{e.target.value='';}};
  resetForm();render();root.addEventListener('storage',e=>{if(e.key===KEY)location.reload();});
})(typeof window==='undefined'?globalThis:window);
