(() => {
  'use strict';
  const button = document.createElement('button');
  button.className = 'seoul-map-open';
  button.textContent = '🗺 ソウルの地図を開く';
  button.setAttribute('aria-haspopup', 'dialog');
  document.querySelector('#home .dashboard').append(button);
  const dialog = document.createElement('dialog');
  dialog.className = 'seoul-map-dialog';
  dialog.setAttribute('aria-labelledby', 'seoul-map-title');
  dialog.innerHTML = `<div class="seoul-map-heading"><h2 id="seoul-map-title">ソウルを歩いて、韓国語を学ぼう</h2><button type="button" class="seoul-map-close" aria-label="地図を閉じる">閉じる ×</button></div><p>地図をドラッグ・拡大できます。街のピンを押して会話に挑戦！</p><div class="seoul-map-canvas" role="region" aria-label="ソウルの学習スポット地図"></div><p class="seoul-map-status" role="status"></p><div class="seoul-map-places" aria-label="街からレッスンを選ぶ"></div><small>実在する街を舞台にしたオリジナル練習です。施設の案内ではありません。地図の表示には通信が必要です。</small><p><a href="https://www.openstreetmap.org/#map=12/37.552/126.99" target="_blank" rel="noopener">地図が表示されない場合はOpenStreetMapで開く ↗</a></p>`;
  document.body.append(dialog);
  const status = dialog.querySelector('.seoul-map-status');
  const canvas = dialog.querySelector('.seoul-map-canvas');
  const q = (id, ko, jp, choices, note) => ({id, ko, kana:'', jp, choices, note, prompt:'場面に合う表現を、解説で確認しましょう。',guide:'会話の場面に合う答えを選ぼう'});
  const shopping = {id:'map-shopping',name:'明洞で買い物',icon:'🛍',avatar:'🛍',q:[
    q('map-shop-1','이거 얼마예요?','これはいくらですか？', [['가격을 묻고 있어요.','','値段を尋ねています。',true],['색깔을 묻고 있어요.','','色を尋ねています。',false],['위치를 묻고 있어요.','','場所を尋ねています。',false]], '얼마예요? は「いくらですか？」。이거 は「これ」で、商品の値段を尋ねる表現です。色なら 무슨 색이에요?、場所なら 어디에 있어요? を使います。'),
    q('map-shop-2','좀 더 큰 사이즈 있어요?','もう少し大きいサイズはありますか？', [['네, 큰 사이즈도 있어요.','','はい、大きいサイズもあります。',true],['아니요, 오늘은 안 추워요.','','いいえ、今日は寒くありません。',false],['저는 지하철로 왔어요.','','私は地下鉄で来ました。',false]], '좀 더 は「もう少し」、큰 は 크다（大きい）の連体形です。サイズの有無を聞いているので「大きいサイズもあります」が合います。他の選択肢は天気と交通手段の話です。'),
    q('map-shop-3','카드로 결제할 수 있어요?','カードで支払えますか？', [['네, 카드로 결제하실 수 있어요.','','はい、カードでお支払いいただけます。',true],['네, 아홉 시에 문을 열어요.','','はい、9時に開店します。',false],['네, 이 옷은 파란색이에요.','','はい、この服は青色です。',false]], '카드로 の 로 は手段「カードで」。-ㄹ 수 있어요? は「〜できますか？」です。支払い方法を尋ねているためカード決済が可能という返答が正解。開店時間や服の色では答えになりません。')
  ]};
  const directions = {id:'map-directions',name:'弘大で道案内',icon:'🚶',avatar:'🚶',q:[
    q('map-way-1','홍대입구역에 어떻게 가요?','弘大入口駅へはどうやって行きますか？', [['이 길로 쭉 가세요.','','この道をまっすぐ進んでください。',true],['커피 한 잔 주세요.','','コーヒーを1杯ください。',false],['정말 맛있어요.','','本当においしいです。',false]], '어떻게 가요? は行き方を尋ねます。이 길로（この道を）＋쭉（まっすぐ）＋가세요（進んでください）が道案内になります。注文や味の感想は行き方の説明ではありません。'),
    q('map-way-2','다음 사거리에서 오른쪽으로 가세요.','次の交差点で右へ進んでください。', [['다음 사거리에서 우회전해요.','','次の交差点で右折します。',true],['다음 사거리에서 좌회전해요.','','次の交差点で左折します。',false],['여기에서 기다려요.','','ここで待ちます。',false]], '오른쪽 は右、왼쪽 は左です。右へ進む指示は 우회전（右折）に対応します。좌회전 は左折なので逆方向。「ここで待つ」には移動がありません。'),
    q('map-way-3','걸어서 얼마나 걸려요?','歩いてどのくらいかかりますか？', [['십 분쯤 걸려요.','','10分くらいかかります。',true],['삼천 원이에요.','','3,000ウォンです。',false],['오른쪽에 있어요.','','右側にあります。',false]], '걸어서 は「歩いて」、얼마나 걸려요? は「どのくらい時間がかかりますか？」。분 は分、쯤 は「くらい」です。金額や位置では所要時間への答えになりません。')
  ]};
  function registerLessons() {
    if (typeof S === 'undefined') return;
    [shopping,directions].forEach(stage=>{if(!S.some(item=>item.id===stage.id))S.push(stage);});
  }
  window.addEventListener('learning-ready',registerLessons,{once:true});
  registerLessons();
  const places = [
    {name:'明洞',topic:'買い物 · 3問',pos:[37.5636,126.985],stage:shopping},
    {name:'弘大',topic:'道案内 · 3問',pos:[37.5563,126.9236],stage:directions},
    {name:'聖水',topic:'カフェ · 5問',pos:[37.5446,127.0559],id:'cafe'}
  ];
  function lesson(place) {
    if (typeof start !== 'function') {status.textContent='学習データを準備しています。少し待ってからもう一度押してください。';return;}
    const stage = place.stage || S.find(item => item.id === place.id);
    dialog.close();
    start(stage,stage.q,'subgame');
  }
  const list = dialog.querySelector('.seoul-map-places');
  places.forEach(place => {
    const b = document.createElement('button');
    b.textContent = `${place.name}：${place.topic} →`;
    b.onclick = () => lesson(place);
    list.append(b);
  });
  let map, loading;
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((resolve,reject) => {
      const css = document.createElement('link');
      css.rel='stylesheet';css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      css.integrity='sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';css.crossOrigin='';
      const js = document.createElement('script');
      js.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      js.integrity='sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';js.crossOrigin='';
      const timer=setTimeout(()=>reject(new Error('timeout')),15000);
      let stylesReady=false,scriptReady=false;
      const ready=()=>{if(stylesReady&&scriptReady){clearTimeout(timer);resolve();}};
      css.onload=()=>{stylesReady=true;ready();};js.onload=()=>{scriptReady=true;ready();};
      css.onerror=js.onerror=()=>{clearTimeout(timer);css.remove();js.remove();reject(new Error('network'));};
      document.head.append(css,js);
    }).catch(error=>{loading=null;throw error;});
    return loading;
  }
  button.onclick = async () => {
    dialog.showModal();
    if (map) {map.invalidateSize();return;}
    status.textContent='地図を読み込んでいます…';
    try {
      await loadLeaflet();
      if(map)return;
      map=L.map(canvas,{scrollWheelZoom:false}).setView([37.551,126.99],12);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'}).addTo(map).on('tileerror',()=>{status.textContent='地図の一部を読み込めませんでした。下の街ボタンから学習できます。';});
      places.forEach(place=>{
        const content=document.createElement('div');
        const title=document.createElement('strong');title.textContent=place.name;
        const b=document.createElement('button');b.className='seoul-map-lesson';b.textContent=place.topic+'を始める';b.onclick=()=>lesson(place);
        content.append(title,document.createElement('br'),b);
        L.marker(place.pos,{title:place.name,alt:place.name+'の学習スポット'}).addTo(map).bindPopup(content);
      });
      status.textContent='ピンまたは下の街ボタンからレッスンを始められます。';
      map.invalidateSize();
    } catch(error) {status.textContent='地図を読み込めませんでした。下の街ボタンから学習できます。閉じて開くと再試行します。';}
  };
  dialog.querySelector('.seoul-map-close').onclick=()=>dialog.close();
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>button.focus({preventScroll:true}));
})();
